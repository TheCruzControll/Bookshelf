/**
 * Rebaser — non-Claude.
 *
 * Auto-resolves the most common merge conflict (pnpm-lock.yaml) on agent
 * PRs. Only fires when a PR's `mergeable_state` is `dirty` (real
 * conflict). Skips `behind` PRs entirely — squash auto-merge handles
 * those cleanly at merge time without needing the head branch to be up
 * to date, and proactively rebasing every behind PR pollutes history
 * with noisy merge commits and burns CI minutes / Claude quota on each
 * Tester+Reviewer re-run.
 *
 * Conflicts in `AUTO_RESOLVABLE_FILES` (default: pnpm-lock.yaml) are
 * resolved by taking main's version and re-running `pnpm install`.
 * Anything else gets `merge-conflict` + `needs-human` labels and a PR
 * comment listing the conflicting files.
 *
 * Triggers:
 *   - push to main           → walks every open agent PR (filtered to dirty)
 *   - workflow_dispatch      → either single PR (input) or all
 *   - pull_request opened    → just that PR (catches new PRs on stale base)
 *
 * Env (set by the workflow):
 *   GH_TOKEN — fine-grained PAT (contents:write, pull-requests:write)
 *   GITHUB_REPOSITORY — "owner/repo"
 *   EVENT_NAME — push | workflow_dispatch | pull_request
 *   PR_NUMBER — optional; rebase only this PR if set
 *   AUTO_RESOLVABLE_FILES — comma-separated, default "pnpm-lock.yaml"
 */

import { execSync } from 'node:child_process';
import { Octokit } from '@octokit/rest';

const REPO_FULL = process.env.GITHUB_REPOSITORY ?? 'TheCruzControll/bookshelf';
const slugParts = REPO_FULL.split('/');
if (slugParts.length !== 2 || !slugParts[0] || !slugParts[1]) {
  console.error(`GITHUB_REPOSITORY must be "owner/repo", got ${REPO_FULL}`);
  process.exit(1);
}
const owner: string = slugParts[0];
const repo: string = slugParts[1];

const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Set GH_TOKEN or GITHUB_TOKEN.');
  process.exit(1);
}

const AUTO_RESOLVABLE_FILES = new Set(
  (process.env.AUTO_RESOLVABLE_FILES ?? 'pnpm-lock.yaml').split(',').map((s) => s.trim()),
);
const EVENT_NAME = process.env.EVENT_NAME ?? 'manual';
const SINGLE_PR = process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : undefined;

const octokit = new Octokit({ auth: token });

function sh(cmd: string, opts: { allowFail?: boolean } = {}): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (opts.allowFail) return '';
    throw err;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function listAgentPRs(): Promise<number[]> {
  const out: number[] = [];
  for (let page = 1; ; page += 1) {
    const res = await octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100,
      page,
      base: 'main',
    });
    for (const pr of res.data) {
      if (pr.head.ref.startsWith('agent/')) out.push(pr.number);
    }
    if (res.data.length < 100) break;
  }
  return out;
}

async function getPR(num: number): Promise<{
  number: number;
  headRef: string;
  headSha: string;
  baseRef: string;
  mergeableState: string;
  mergeable: boolean | null;
  labels: string[];
}> {
  // mergeable_state can be `unknown` immediately after fetch — GitHub computes
  // it lazily. Retry once after a brief pause.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await octokit.pulls.get({ owner, repo, pull_number: num });
    if (res.data.mergeable_state !== 'unknown') {
      return {
        number: res.data.number,
        headRef: res.data.head.ref,
        headSha: res.data.head.sha,
        baseRef: res.data.base.ref,
        mergeableState: res.data.mergeable_state,
        mergeable: res.data.mergeable,
        labels: (res.data.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name ?? '')),
      };
    }
    await sleep(2000);
  }
  // Last resort: return whatever we got, even if 'unknown'.
  const res = await octokit.pulls.get({ owner, repo, pull_number: num });
  return {
    number: res.data.number,
    headRef: res.data.head.ref,
    headSha: res.data.head.sha,
    baseRef: res.data.base.ref,
    mergeableState: res.data.mergeable_state,
    mergeable: res.data.mergeable,
    labels: (res.data.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name ?? '')),
  };
}

async function tryUpdateBranch(num: number): Promise<boolean> {
  try {
    await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch', {
      owner,
      repo,
      pull_number: num,
    });
    console.log(`#${num}: update-branch OK (clean merge of main into head)`);
    return true;
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.log(`#${num}: update-branch failed (${e.status} ${e.message ?? ''})`);
    return false;
  }
}

function configureGit(): void {
  sh('git config user.name "hone-rebaser[bot]"');
  sh('git config user.email "hone-rebaser[bot]@users.noreply.github.com"');
}

async function manualMerge(pr: Awaited<ReturnType<typeof getPR>>): Promise<void> {
  configureGit();

  // Fetch PR head and base
  sh(`git fetch origin ${pr.baseRef}`);
  sh(`git fetch origin ${pr.headRef}`);
  sh(`git checkout -B ${pr.headRef} origin/${pr.headRef}`);

  // Attempt the merge.
  const mergeOut = sh(`git merge --no-edit origin/${pr.baseRef}`, { allowFail: true });

  // If clean, push and exit.
  const status = sh('git status --porcelain');
  if (!status.includes('UU') && !status.includes('AA') && !status.includes('DD')) {
    if (mergeOut.includes('Already up to date')) {
      console.log(`#${pr.number}: already up to date`);
      return;
    }
    console.log(`#${pr.number}: clean merge, pushing`);
    sh(`git push origin ${pr.headRef}`);
    return;
  }

  // Identify conflicted files.
  const conflictedFiles = sh('git diff --name-only --diff-filter=U')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`#${pr.number}: conflicts in ${conflictedFiles.length} file(s): ${conflictedFiles.join(', ')}`);

  const allAutoResolvable = conflictedFiles.every((f) => AUTO_RESOLVABLE_FILES.has(f));

  if (!allAutoResolvable) {
    sh('git merge --abort', { allowFail: true });
    await flagNeedsHuman(pr, conflictedFiles);
    return;
  }

  // Auto-resolve: take main's version of each lockfile-class file, then
  // regenerate via pnpm install so the result reflects the union of both
  // PRs' package.json changes.
  for (const file of conflictedFiles) {
    sh(`git checkout --theirs -- ${file}`);
    sh(`git add ${file}`);
  }

  // If pnpm-lock.yaml was in the conflict set, re-run install to sync.
  if (conflictedFiles.includes('pnpm-lock.yaml')) {
    console.log(`#${pr.number}: regenerating lockfile via pnpm install`);
    sh('pnpm install --no-frozen-lockfile');
    sh('git add pnpm-lock.yaml');
  }

  sh('git commit --no-edit');
  sh(`git push origin ${pr.headRef}`);

  // Remove any prior merge-conflict label since we just resolved it.
  for (const label of ['merge-conflict', 'needs-human']) {
    if (pr.labels.includes(label)) {
      try {
        await octokit.issues.removeLabel({ owner, repo, issue_number: pr.number, name: label });
      } catch {
        // ignore
      }
    }
  }

  console.log(`#${pr.number}: auto-resolved ${conflictedFiles.join(', ')}, pushed`);
}

async function flagNeedsHuman(
  pr: Awaited<ReturnType<typeof getPR>>,
  conflictedFiles: string[],
): Promise<void> {
  for (const label of ['merge-conflict', 'needs-human']) {
    try {
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: [label],
      });
    } catch (err) {
      console.error(`Could not add label ${label}:`, err);
    }
  }

  const body = [
    'Rebaser tried to merge `main` into this PR but hit conflicts in files outside the auto-resolvable set.',
    '',
    'Conflicted files:',
    ...conflictedFiles.map((f) => `- \`${f}\``),
    '',
    'Resolve manually: rebase or merge `main` locally, fix the conflicts, push.',
  ].join('\n');

  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pr.number,
      body,
    });
  } catch (err) {
    console.error('Could not post comment:', err);
  }

  console.log(`#${pr.number}: flagged needs-human (conflicts in ${conflictedFiles.join(', ')})`);
}

async function rebaseOnePR(num: number): Promise<void> {
  const pr = await getPR(num);
  console.log(`#${pr.number}: state=${pr.mergeableState} mergeable=${pr.mergeable}`);

  // Only act on dirty PRs (real conflict). `clean`, `unstable`,
  // `has_hooks`, and `behind` are all left alone:
  //   - clean / unstable / has_hooks: nothing to do.
  //   - behind: squash auto-merge handles staleness at merge time
  //     without needing the head to be up to date. Proactively
  //     rebasing every push-to-main creates noisy merge commits and
  //     re-fires Tester + Reviewer on each open PR — wasteful.
  if (pr.mergeableState !== 'dirty') {
    return;
  }

  await manualMerge(pr);
}

async function main(): Promise<void> {
  console.log(`Rebaser pass: event=${EVENT_NAME} pr=${SINGLE_PR ?? 'all'}`);

  const targets = SINGLE_PR ? [SINGLE_PR] : await listAgentPRs();
  console.log(`Targets: ${targets.length} PR(s)`);

  for (const num of targets) {
    try {
      await rebaseOnePR(num);
    } catch (err) {
      console.error(`#${num}: failed:`, err);
    }
  }

  console.log('Rebaser pass complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
