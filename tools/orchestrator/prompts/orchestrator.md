# Hone Orchestrator

The Orchestrator is a non-Claude TypeScript script that manages the issue
DAG and dispatches Implementer runs. It runs on every cron tick (every 15
minutes), on issue/PR events, and on manual dispatch.

The orchestrator script lives at `tools/orchestrator/orchestrator.ts` and
is invoked by `.github/workflows/agent-orchestrator.yml`.

## Responsibilities

1. **Parse `Depends on:` lines** from open issue bodies to build a
   dependency DAG.
2. **Compute lifecycle labels** — set `lifecycle:ready` on issues whose
   deps are all `lifecycle:done`; set `lifecycle:blocked` on issues
   with unmet deps.
3. **Dispatch Implementer runs** — up to `MAX_CONCURRENT_IMPLEMENTERS`
   (default 3) ready issues in parallel, provided their `## Files` claim
   sets don't overlap with currently in-progress issues.
4. **Close linked issues** — when a PR with `Closes #N` is merged, mark
   issue N as `lifecycle:done` and trigger a fresh DAG evaluation so
   downstream issues become ready.
5. **Detect cycles** — label every issue in a dependency cycle
   `needs-human` and halt dispatching for that subgraph.

## Environment

All env vars are set by the workflow:

- `GH_TOKEN` — fine-grained PAT with `issues:write`, `actions:write`
- `GITHUB_REPOSITORY` — `owner/repo`
- `EVENT_NAME`, `EVENT_ACTION`, `EVENT_PR_NUMBER`, `EVENT_PR_MERGED` —
  passthrough from the triggering GitHub event
- `MAX_CONCURRENT_IMPLEMENTERS` — default `3`
- `IMPLEMENTER_WORKFLOW` — default `agent-implementer.yml`
- `IMPLEMENTER_REF` — branch to dispatch Implementer on, default `main`

## Label conventions

| Label | Meaning |
|---|---|
| `lifecycle:ready` | All deps satisfied; Orchestrator will dispatch next run |
| `lifecycle:blocked` | One or more deps not yet `lifecycle:done` |
| `lifecycle:in-progress` | Implementer workflow is running |
| `lifecycle:in-review` | Draft PR open; Reviewer workflow running |
| `lifecycle:done` | PR merged; issue closed |
| `needs-human` | Cycle detected or unresolvable state |

## Files claim deduplication

Each issue may have a `## Files` section listing the files it intends to
touch. The Orchestrator reads these claim sets to prevent two concurrent
Implementers from operating on overlapping files. If a ready issue's
claim set overlaps with any in-progress issue's claim set, dispatch is
deferred until the in-progress issue clears.

## Audit

Run `pnpm tsx tools/orchestrator/audit.ts` to verify all invariants:
every open issue has exactly one `lifecycle:*`, one `wave:*`, one
`type:*`; no `lifecycle:ready` issue has unsatisfied deps; no two issues
are simultaneously `lifecycle:in-progress`.
