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
  const dispatched: number[] = [];

  for (const c of candidates) {
    if (dispatched.length >= slots) break;
    const myFiles = parseClaim(c.body, c.labels);
    if (intersects(myFiles, active)) continue;

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

  console.log('Orchestrator pass complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
