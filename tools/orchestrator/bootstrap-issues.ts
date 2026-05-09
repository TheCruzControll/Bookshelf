/**
 * Bootstrap the v1 issue DAG on GitHub.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... GITHUB_REPOSITORY=TheCruzControll/bookshelf \
 *     pnpm --filter @hone/orchestrator-tools bootstrap:issues
 *
 * Behavior:
 *   - Loads issues from `./issues.ts`.
 *   - Skips any issue whose `[X-NN]` title prefix already exists on GitHub
 *     (idempotent — safe to re-run).
 *   - Topologically sorts so deps are created before dependents (lets us
 *     resolve dep IDs to GitHub issue numbers).
 *   - Sets `lifecycle:ready` if all deps are satisfied (no open deps),
 *     else `lifecycle:blocked`.
 *   - Applies all labels declared on each issue plus the lifecycle label.
 *   - Appends `Depends on: #X, #Y, ...` to the body when deps exist.
 *
 * Idempotency rules:
 *   - Re-running with new issues added at the end of `issues.ts` creates
 *     only the new ones.
 *   - Existing issues are not modified.
 */

import { Octokit } from '@octokit/rest';
import { issues, type IssueDef } from './issues.js';

const REPO_FULL = process.env.GITHUB_REPOSITORY ?? 'TheCruzControll/bookshelf';
const slugParts = REPO_FULL.split('/');
if (slugParts.length !== 2 || !slugParts[0] || !slugParts[1]) {
  console.error(`GITHUB_REPOSITORY must be "owner/repo", got ${REPO_FULL}`);
  process.exit(1);
}
const owner: string = slugParts[0];
const repo: string = slugParts[1];
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error('Set GITHUB_TOKEN to a PAT with issues:write on the repo.');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const CREATE_DELAY_MS = Number(process.env.BOOTSTRAP_CREATE_DELAY_MS ?? '1500');
const MAX_RETRIES = Number(process.env.BOOTSTRAP_MAX_RETRIES ?? '6');

/** Wraps an octokit call with retry on GitHub secondary rate limits. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string; response?: { headers?: Record<string, string> } };
      const isSecondary = e.status === 403 && (e.message ?? '').includes('secondary rate limit');
      const isPrimary = e.status === 403 && (e.message ?? '').includes('rate limit');
      if (!isSecondary && !isPrimary) throw err;

      const retryAfter = Number(e.response?.headers?.['retry-after']);
      const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(120_000, 2 ** attempt * 5_000);
      console.log(`[${label}] rate-limited (attempt ${attempt}/${MAX_RETRIES}); sleeping ${Math.round(backoffMs / 1000)}s`);
      await sleep(backoffMs);
    }
  }
  throw new Error(`${label}: gave up after ${MAX_RETRIES} retries`);
}

/** Topological sort: deps first. Throws on cycle. */
function topoSort(defs: IssueDef[]): IssueDef[] {
  const byId = new Map(defs.map((d) => [d.id, d] as const));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: IssueDef[] = [];

  function visit(id: string, path: string[]): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Cycle detected: ${[...path, id].join(' → ')}`);
    }
    const def = byId.get(id);
    if (!def) {
      console.warn(`Unknown dep referenced: ${id}`);
      return;
    }
    visiting.add(id);
    for (const dep of def.deps) visit(dep, [...path, id]);
    visiting.delete(id);
    visited.add(id);
    out.push(def);
  }

  for (const d of defs) visit(d.id, []);
  return out;
}

/** Pull all existing issues' titles to detect duplicates. */
async function existingTitles(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let page = 1;
  while (true) {
    const res = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      per_page: 100,
      page,
    });
    if (res.data.length === 0) break;
    for (const issue of res.data) {
      // Skip PRs — listForRepo includes them.
      if (issue.pull_request) continue;
      const m = issue.title.match(/^\[([A-Z]-\d+)\]/);
      if (m && m[1]) out.set(m[1], issue.number);
    }
    if (res.data.length < 100) break;
    page += 1;
  }
  return out;
}

async function main(): Promise<void> {
  console.log(`Bootstrapping issues on ${owner}/${repo}...`);

  const sorted = topoSort(issues);
  const existing = await existingTitles();
  console.log(`Found ${existing.size} existing tracked issues.`);

  /** Internal id → GitHub issue number, populated as we create. */
  const idToNumber = new Map<string, number>(existing);

  let created = 0;
  let skipped = 0;

  for (const def of sorted) {
    if (existing.has(def.id)) {
      // Already created in a prior run.
      skipped += 1;
      continue;
    }

    // Resolve deps to GH numbers (must exist by now thanks to topo sort).
    const depNumbers = def.deps.map((depId) => {
      const num = idToNumber.get(depId);
      if (num === undefined) {
        throw new Error(
          `Dep ${depId} for ${def.id} has no GitHub number. ` +
            `Was it skipped earlier? Topo sort should prevent this.`,
        );
      }
      return num;
    });

    const dependsLine =
      depNumbers.length > 0
        ? `Depends on: ${depNumbers.map((n) => `#${n}`).join(', ')}`
        : 'Depends on:';

    const body = `${def.body}\n\n${dependsLine}\n`;

    // Initial lifecycle: blocked if any dep is open, else ready.
    const lifecycleLabel = await chooseLifecycle(depNumbers);

    const labels = [...def.labels, lifecycleLabel];

    try {
      const res = await withRetry(`create ${def.id}`, () =>
        octokit.issues.create({
          owner,
          repo,
          title: def.title,
          body,
          labels,
        }),
      );
      idToNumber.set(def.id, res.data.number);
      created += 1;
      console.log(`  created #${res.data.number}: ${def.title}`);
    } catch (err) {
      console.error(`  failed to create ${def.id}:`, err);
      throw err;
    }

    // Throttle to stay under GitHub's content-creation secondary limit.
    await sleep(CREATE_DELAY_MS);
  }

  console.log(`\nDone. created=${created} skipped=${skipped} total=${sorted.length}`);
}

async function chooseLifecycle(depNumbers: number[]): Promise<string> {
  if (depNumbers.length === 0) return 'lifecycle:ready';
  for (const n of depNumbers) {
    const res = await withRetry(`get #${n}`, () =>
      octokit.issues.get({ owner, repo, issue_number: n }),
    );
    if (res.data.state !== 'closed') return 'lifecycle:blocked';
  }
  return 'lifecycle:ready';
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
