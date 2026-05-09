/**
 * Invariant checker for the Hone v1 issue DAG.
 *
 * Usage:
 *   pnpm tsx tools/orchestrator/audit.ts
 *
 * Checks performed on every open issue:
 *   1. Exactly one `lifecycle:*` label
 *   2. Exactly one `wave:*` label
 *   3. Exactly one `type:*` label
 *   4. No `lifecycle:ready` issue has an unsatisfied (open) dependency
 *   5. At most one `lifecycle:in-progress` issue
 *   6. No cycles in the dependency graph (Tarjan SCC)
 *
 * Exits 1 if any violations found, 0 if clean.
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

const octokit = new Octokit({ auth: token });

const LIFECYCLE_LABELS = [
  'lifecycle:ready',
  'lifecycle:blocked',
  'lifecycle:in-progress',
  'lifecycle:in-review',
  'lifecycle:done',
] as const;

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
 * Tarjan's strongly connected components algorithm.
 * Returns the set of issue numbers that participate in a cycle.
 */
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

  for (const v of adj.keys()) {
    if (!idx.has(v)) strongConnect(v);
  }
  return result;
}

interface Violation {
  issue: number;
  title: string;
  message: string;
}

async function main(): Promise<void> {
  console.log(`Fetching issues from ${owner}/${repo}…`);
  const allIssues = await listAllIssues();
  const openIssues = allIssues.filter((i) => i.state === 'open');
  const stateOf = new Map(allIssues.map((i) => [i.number, i.state]));

  console.log(`Loaded ${allIssues.length} issues total, ${openIssues.length} open.\n`);

  const violations: Violation[] = [];

  const inProgress: number[] = [];

  for (const issue of openIssues) {
    const { number, title, labels } = issue;

    const lifecycleLabels = labels.filter((l) =>
      LIFECYCLE_LABELS.includes(l as (typeof LIFECYCLE_LABELS)[number]),
    );
    if (lifecycleLabels.length !== 1) {
      violations.push({
        issue: number,
        title,
        message: `Expected exactly 1 lifecycle:* label, found ${lifecycleLabels.length}: [${lifecycleLabels.join(', ') || 'none'}]`,
      });
    }

    const waveLabels = labels.filter((l) => /^wave:\d+$/.test(l));
    if (waveLabels.length !== 1) {
      violations.push({
        issue: number,
        title,
        message: `Expected exactly 1 wave:* label, found ${waveLabels.length}: [${waveLabels.join(', ') || 'none'}]`,
      });
    }

    const typeLabels = labels.filter((l) => l.startsWith('type:'));
    if (typeLabels.length !== 1) {
      violations.push({
        issue: number,
        title,
        message: `Expected exactly 1 type:* label, found ${typeLabels.length}: [${typeLabels.join(', ') || 'none'}]`,
      });
    }

    if (lifecycleLabels.includes('lifecycle:ready')) {
      const deps = parseDeps(issue.body);
      const unsatisfied = deps.filter((d) => stateOf.get(d) !== 'closed');
      if (unsatisfied.length > 0) {
        violations.push({
          issue: number,
          title,
          message: `lifecycle:ready but has unsatisfied deps: ${unsatisfied.map((d) => `#${d}`).join(', ')}`,
        });
      }
    }

    if (lifecycleLabels.includes('lifecycle:in-progress')) {
      inProgress.push(number);
    }
  }

  if (inProgress.length > 1) {
    violations.push({
      issue: 0,
      title: '(global)',
      message: `At most 1 issue may be lifecycle:in-progress; found ${inProgress.length}: ${inProgress.map((n) => `#${n}`).join(', ')}`,
    });
  }

  const cycleNodes = detectCycles(openIssues);
  if (cycleNodes.size > 0) {
    const nodes = [...cycleNodes].sort((a, b) => a - b);
    violations.push({
      issue: 0,
      title: '(global)',
      message: `Cycle detected via Tarjan SCC. Participating issues: ${nodes.map((n) => `#${n}`).join(', ')}`,
    });
  }

  if (violations.length === 0) {
    console.log('✓ All invariants satisfied. DAG is clean.');
    process.exit(0);
  }

  console.error(`✗ Found ${violations.length} violation(s):\n`);
  for (const v of violations) {
    const prefix = v.issue > 0 ? `  #${v.issue} (${v.title})` : `  (global)`;
    console.error(`${prefix}\n    → ${v.message}\n`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
