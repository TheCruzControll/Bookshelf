/**
 * Orchestrator — non-Claude.
 *
 * Pure mechanics: parse `Depends on:` lines and `## Files` claim sets from
 * open issues, recompute `lifecycle:ready/blocked` labels, dispatch up to
 * `MAX_CONCURRENT_IMPLEMENTERS` parallel Implementer runs whose claim sets
 * don't conflict with currently-running issues, and on PR merge close the
 * linked issue (cascading downstream).
 *
 * Invoked by `.github/workflows/agent-orchestrator.yml`.
 *
 * Env (all set by the workflow):
 *   GH_TOKEN — fine-grained PAT with issues/actions write
 *   GITHUB_REPOSITORY — "owner/repo"
 *   EVENT_NAME, EVENT_ACTION, EVENT_PR_NUMBER, EVENT_PR_MERGED — passthrough
 *   MAX_CONCURRENT_IMPLEMENTERS — default 3
 *   IMPLEMENTER_WORKFLOW — default "agent-implementer.yml"
 *   IMPLEMENTER_REF — branch to dispatch on, default "main"
 */

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

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_IMPLEMENTERS ?? '3');
const IMPLEMENTER_WORKFLOW = process.env.IMPLEMENTER_WORKFLOW ?? 'agent-implementer.yml';
const IMPLEMENTER_REF = process.env.IMPLEMENTER_REF ?? 'main';

const octokit = new Octokit({ auth: token });

const LIFECYCLE = ['lifecycle:ready', 'lifecycle:blocked', 'lifecycle:in-progress', 'lifecycle:in-review', 'lifecycle:done'] as const;
const TERMINAL_STATES = new Set(['lifecycle:in-progress', 'lifecycle:in-review', 'lifecycle:done']);

interface IssueLite {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
}

async function listAllIssues(): Promise<IssueLite[]> {
  const out: IssueLite[] = [];
  for (let page = 1; ; page += 1) {
    const res = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      per_page: 100,
      page,
    });
    for (const issue of res.data) {
      if (issue.pull_request) continue;
      out.push({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? '',
        state: issue.state as 'open' | 'closed',
        labels: issue.labels
          .map((l) => (typeof l === 'string' ? l : (l.name ?? '')))
          .filter(Boolean),
      });
    }
    if (res.data.length < 100) break;
  }
  return out;
}

function parseDeps(body: string): number[] {
  const re = /^Depends on:\s*((?:#\d+(?:\s*,\s*#\d+)*)?)/gim;
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const list = m[1] ?? '';
    for (const ref of list.split(',')) {
      const n = Number(ref.trim().replace(/^#/, ''));
      if (Number.isInteger(n) && n > 0) seen.add(n);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Parse the issue's claim set. Prefer an explicit `## Files` section. When
 * absent, fall back to a coarse area-label claim (e.g. `area:web` →
 * `apps/web/`). Last resort if there's neither: claim `*` so the issue runs
 * alone, since we can't reason about what it will touch.
 */
function parseClaim(body: string, labels: string[]): Set<string> {
  const m = body.match(/##\s*Files\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (m && m[1]) {
    const files = m[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-'))
      .map((line) => line.replace(/^-\s*/, '').replace(/`/g, '').trim())
      .filter(Boolean);
    if (files.length > 0) return new Set(files);
  }

  const areaToPath: Record<string, string> = {
    'area:api': 'apps/api/',
    'area:web': 'apps/web/',
    'area:native': 'apps/native/',
    'area:db': 'packages/db/',
    'area:domain': 'packages/domain/',
    'area:ci': '.github/',
  };
  const claims = labels
    .filter((l) => l.startsWith('area:'))
    .map((l) => areaToPath[l])
    .filter((p): p is string => Boolean(p));
  return claims.length > 0 ? new Set(claims) : new Set(['*']);
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  if (a.has('*') || b.has('*')) return true;
  for (const x of a) {
    if (b.has(x)) return true;
    // Directory claim conflicts with anything inside.
    if (x.endsWith('/')) for (const y of b) if (y.startsWith(x)) return true;
  }
  for (const y of b) {
    if (y.endsWith('/')) for (const x of a) if (x.startsWith(y)) return true;
  }
  return false;
}

/**
 * Files at the repo root that nearly every infra issue wants to touch.
 * When two PRs both modify these, parallel dispatch produces avoidable
 * merge conflicts. Issues whose claim set includes one of these are
 * serialized — only one such issue may be in-flight at a time.
 */
const ROOT_CONFIG_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.base.json',
  'tsconfig.json',
  'eslint.config.mjs',
  'eslint.config.js',
  'eslint.config.ts',
  'prettier.config.mjs',
  'prettier.config.js',
  'vitest.config.ts',
  'vitest.config.mjs',
]);
const REPO_ROOT_PREFIX = '/home/user/Bookshelf/';

function claimsRootConfig(claim: Set<string>): boolean {
  // The conservative wildcard claim catches everything, root config included.
  if (claim.has('*')) return true;
  for (const raw of claim) {
    let path = raw.startsWith(REPO_ROOT_PREFIX) ? raw.slice(REPO_ROOT_PREFIX.length) : raw;
    path = path.replace(/^\/+/, '');
    // Only files at the repo root count — `apps/api/package.json` is fine to
    // run in parallel with `eslint.config.mjs`. Per-package config is
    // package-local and doesn't conflict with root config.
    if (path.includes('/')) continue;
    if (ROOT_CONFIG_FILES.has(path)) return true;
  }
  return false;
}

/**
 * Files that nearly every Wave 1 schema/domain issue wants to mutate.
 * When two such issues run in parallel, their PRs almost always conflict
 * on these files (each adds a new entity / port / mapper / repository /
 * service test fixture). Same shape as ROOT_CONFIG_FILES: only one such
 * issue may be in-flight at a time across the whole DAG.
 */
const SHARED_DOMAIN_FILES = new Set([
  'packages/db/src/schema.ts',
  'packages/db/src/repositories.ts',
  'packages/db/src/mappers.ts',
  'packages/db/src/mappers.test.ts',
  'packages/domain/src/types.ts',
  'packages/domain/src/types.test.ts',
  'packages/domain/src/ports.ts',
  'packages/domain/src/ports.test.ts',
  'packages/domain/src/services.ts',
  'packages/domain/src/services.test.ts',
  'packages/domain/src/index.ts',
]);

function claimsSharedDomain(claim: Set<string>): boolean {
  if (claim.has('*')) return true;
  for (const raw of claim) {
    let path = raw.startsWith(REPO_ROOT_PREFIX) ? raw.slice(REPO_ROOT_PREFIX.length) : raw;
    path = path.replace(/^\/+/, '');
    if (SHARED_DOMAIN_FILES.has(path)) return true;
  }
  return false;
}

function lifecycleOf(issue: IssueLite): string | undefined {
  return issue.labels.find((l) => LIFECYCLE.includes(l as typeof LIFECYCLE[number]));
}

function waveOf(issue: IssueLite): number {
  const m = issue.labels.find((l) => /^wave:\d+$/.test(l));
  return m ? Number(m.split(':')[1]) : Number.MAX_SAFE_INTEGER;
}

async function setLifecycle(issue: IssueLite, desired: string): Promise<void> {
  const current = lifecycleOf(issue);
  if (current === desired) return;
  const newLabels = issue.labels.filter((l) => !LIFECYCLE.includes(l as typeof LIFECYCLE[number]));
  newLabels.push(desired);
  await octokit.issues.setLabels({
    owner,
    repo,
    issue_number: issue.number,
    labels: newLabels,
  });
  console.log(`#${issue.number}: ${current ?? '(none)'} → ${desired}`);
  issue.labels = newLabels;
}

function detectCycles(issues: IssueLite[]): Set<number> {
  const open = issues.filter((i) => i.state === 'open');
  const adj = new Map<number, number[]>();
  for (const i of open) adj.set(i.number, parseDeps(i.body));
  const result = new Set<number>();
  const idx = new Map<number, number>();
  const low = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  let counter = 0;

  function strongConnect(v: number): void {
    idx.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!adj.has(w)) continue;
      if (!idx.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc: number[] = [];
      while (true) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      const isCycle = scc.length > 1 || (adj.get(v) ?? []).includes(v);
      if (isCycle) for (const n of scc) result.add(n);
    }
  }

  for (const v of adj.keys()) if (!idx.has(v)) strongConnect(v);
  return result;
}

async function recomputeLabels(issues: IssueLite[]): Promise<void> {
  const stateOf = new Map(issues.map((i) => [i.number, i.state]));
  const cycleNodes = detectCycles(issues);

  for (const issue of issues) {
    if (issue.state !== 'open') continue;
    const lc = lifecycleOf(issue);
    if (lc && TERMINAL_STATES.has(lc)) continue;

    if (cycleNodes.has(issue.number)) {
      if (!issue.labels.includes('needs-human')) {
        await octokit.issues.addLabels({
          owner,
          repo,
          issue_number: issue.number,
          labels: ['needs-human'],
        });
        console.log(`#${issue.number}: marked needs-human (in cycle)`);
        issue.labels.push('needs-human');
      }
      continue;
    }

    const deps = parseDeps(issue.body);
    const allClosed = deps.every((d) => stateOf.get(d) === 'closed');
    await setLifecycle(issue, allClosed ? 'lifecycle:ready' : 'lifecycle:blocked');
  }
}

async function activeImplementerRunCount(): Promise<number> {
  const res = await octokit.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: IMPLEMENTER_WORKFLOW,
    status: 'in_progress',
    per_page: 100,
  });
  const queued = await octokit.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: IMPLEMENTER_WORKFLOW,
    status: 'queued',
    per_page: 100,
  });
  return res.data.total_count + queued.data.total_count;
}

async function inProgressClaims(issues: IssueLite[]): Promise<Set<string>> {
  const claims = new Set<string>();
  for (const i of issues) {
    if (i.state !== 'open') continue;
    if (lifecycleOf(i) === 'lifecycle:in-progress') {
      for (const f of parseClaim(i.body, i.labels)) claims.add(f);
    }
  }
  return claims;
}

async function dispatchParallel(issues: IssueLite[]): Promise<void> {
  const candidates = issues
    .filter((i) => i.state === 'open' && lifecycleOf(i) === 'lifecycle:ready' && !i.labels.includes('needs-human'))
    .sort((a, b) => waveOf(a) - waveOf(b) || a.number - b.number);

  if (candidates.length === 0) {
    console.log('No ready candidates.');
    return;
  }

  const activeRuns = await activeImplementerRunCount();
  const slots = Math.max(0, MAX_CONCURRENT - activeRuns);
  if (slots === 0) {
    console.log(`No slots available (active=${activeRuns}, max=${MAX_CONCURRENT}).`);
    return;
  }

  const active = await inProgressClaims(issues);
  // Track whether any in-flight issue is touching root config or shared
  // domain/schema files. Both classes run strictly serialized — only one
  // such issue may be in-flight at a time across the whole DAG — because
  // parallel edits to those files cause near-guaranteed merge conflicts
  // (this was the cause of the ~12-PR conflict pile-up on 2026-05-09).
  let rootConfigInFlight = false;
  let sharedDomainInFlight = false;
  for (const i of issues) {
    if (i.state !== 'open') continue;
    if (lifecycleOf(i) !== 'lifecycle:in-progress') continue;
    const claim = parseClaim(i.body, i.labels);
    if (claimsRootConfig(claim)) rootConfigInFlight = true;
    if (claimsSharedDomain(claim)) sharedDomainInFlight = true;
    if (rootConfigInFlight && sharedDomainInFlight) break;
  }
  const dispatched: number[] = [];

  for (const c of candidates) {
    if (dispatched.length >= slots) break;
    const myFiles = parseClaim(c.body, c.labels);
    if (intersects(myFiles, active)) continue;

    const myClaimsRootConfig = claimsRootConfig(myFiles);
    if (myClaimsRootConfig && rootConfigInFlight) {
      console.log(`#${c.number}: skipping — another root-config issue already in flight`);
      continue;
    }

    const myClaimsSharedDomain = claimsSharedDomain(myFiles);
    if (myClaimsSharedDomain && sharedDomainInFlight) {
      console.log(`#${c.number}: skipping — another shared-domain issue already in flight`);
      continue;
    }

    try {
      await octokit.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: IMPLEMENTER_WORKFLOW,
        ref: IMPLEMENTER_REF,
        inputs: { issue_number: String(c.number) },
      });
      // Pre-claim before next iteration so we don't dispatch overlapping siblings
      // in the same pass.
      for (const f of myFiles) active.add(f);
      if (myClaimsRootConfig) rootConfigInFlight = true;
      if (myClaimsSharedDomain) sharedDomainInFlight = true;
      // Optimistically flip lifecycle so subsequent passes don't double-dispatch.
      await setLifecycle(c, 'lifecycle:in-progress');
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: c.number,
        labels: ['agent:implementer'],
      });
      dispatched.push(c.number);
      console.log(`Dispatched #${c.number} (${c.title})`);
    } catch (err) {
      console.error(`Failed to dispatch #${c.number}:`, err);
    }
  }

  console.log(`Dispatched ${dispatched.length} parallel: ${dispatched.join(', ')}`);
}

async function closeIssuesFromMergedPr(prNumber: number): Promise<number[]> {
  const pr = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
  const body = pr.data.body ?? '';
  const re = /(?:closes|fixes|resolves)\s+#(\d+)/gi;
  const closed: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const num = Number(m[1]);
    try {
      await octokit.issues.update({ owner, repo, issue_number: num, state: 'closed' });
      console.log(`Closed #${num} (referenced by PR #${prNumber})`);
      closed.push(num);
    } catch (err) {
      console.error(`Could not close #${num}:`, err);
    }
  }
  return closed;
}

/**
 * The bounce-back loop. When the Reviewer requests changes, it strips
 * `agent:reviewer` from the PR and adds `agent:implementer`. The source
 * issue stays at `lifecycle:in-review` (because the PR is still open),
 * which means the normal dispatchParallel doesn't pick it up. This
 * function fills that gap: scan open PRs labeled `agent:implementer`,
 * find their `Closes #N` source issues, dispatch the Implementer for
 * those issues, and strip the `agent:implementer` label so the next
 * Orchestrator pass doesn't re-dispatch (the Implementer's prompt
 * re-applies `agent:reviewer` to the PR after pushing).
 */
async function dispatchBounceBacks(): Promise<void> {
  const res = await octokit.pulls.list({ owner, repo, state: 'open', per_page: 100 });
  const targets = res.data.filter((pr) =>
    pr.labels.some((l) => (typeof l === 'string' ? l : l.name) === 'agent:implementer'),
  );
  if (targets.length === 0) {
    console.log('No bounce-back PRs to dispatch.');
    return;
  }

  const activeRuns = await activeImplementerRunCount();
  let slots = Math.max(0, MAX_CONCURRENT - activeRuns);
  if (slots === 0) {
    console.log(`Bounce-back: no slots (active=${activeRuns}, max=${MAX_CONCURRENT}).`);
    return;
  }

  for (const pr of targets) {
    if (slots === 0) break;

    const body = pr.body ?? '';
    const m = body.match(/(?:closes|fixes|resolves)\s+#(\d+)/i);
    if (!m || !m[1]) {
      console.log(`#${pr.number}: no Closes #N reference, skipping bounce-back`);
      continue;
    }
    const issueNum = Number(m[1]);

    try {
      await octokit.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: IMPLEMENTER_WORKFLOW,
        ref: IMPLEMENTER_REF,
        inputs: { issue_number: String(issueNum) },
      });
      // Strip agent:implementer immediately so the next pass doesn't
      // re-dispatch while this one is still running. The Implementer's
      // recovery step re-applies agent:reviewer to the PR after push.
      try {
        await octokit.issues.removeLabel({
          owner,
          repo,
          issue_number: pr.number,
          name: 'agent:implementer',
        });
      } catch {
        // ignore — label may not be present after some race
      }
      console.log(`Bounce-back dispatched: PR #${pr.number} → Implementer for issue #${issueNum}`);
      slots -= 1;
    } catch (err) {
      console.error(`Bounce-back dispatch failed for PR #${pr.number}:`, err);
    }
  }
}

async function main(): Promise<void> {
  const eventName = process.env.EVENT_NAME ?? 'manual';
  const prMerged = process.env.EVENT_PR_MERGED === 'true';
  const prNumber = process.env.EVENT_PR_NUMBER ? Number(process.env.EVENT_PR_NUMBER) : undefined;

  console.log(`Orchestrator pass: event=${eventName} pr=${prNumber ?? '-'} merged=${prMerged}`);

  if (eventName === 'pull_request' && prMerged && prNumber) {
    await closeIssuesFromMergedPr(prNumber);
  }

  const issues = await listAllIssues();
  console.log(`Loaded ${issues.length} issues (${issues.filter((i) => i.state === 'open').length} open).`);

  await recomputeLabels(issues);

  // Re-list after label changes.
  const fresh = await listAllIssues();
  await dispatchParallel(fresh);

  // After dispatching ready issues, also handle PRs that the Reviewer
  // bounced back to the Implementer.
  await dispatchBounceBacks();

  console.log('Orchestrator pass complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
