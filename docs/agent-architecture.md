# Hone Agent Architecture

Six autonomous GitHub Actions workflows build, review, test, document, and
extend Hone v1 from a static issue DAG. This doc explains the conceptual
model — what each agent does, how state flows, why the boundaries are
where they are. For operating, debugging, and recovering the system, see
[`agent-runbook.md`](./agent-runbook.md).

## Mental model

The system has three primitives:

1. **Issues** — atomic units of work, each ½ to 1½ days. Encoded in
   `tools/orchestrator/issues.ts` (the canonical seed list) and pushed to
   GitHub as the live DAG. Each issue declares dependencies (`Depends on:
   #N, #N`) and a claim set (`## Files`).
2. **Labels** — the issue's lifecycle state. Exactly one `lifecycle:*`
   label is the issue's current position in the pipeline:
   `ready → in-progress → in-review → done` (or `blocked` if deps unmet,
   or `needs-human` for escalations).
3. **PRs** — the work product. Implementer opens a draft `Closes #N`,
   Reviewer + Tester gate it, auto-merge fires, Orchestrator closes the
   issue and re-evaluates the DAG.

Everything else is plumbing.

## The six agents

| Agent | Trigger | Engine | Role |
|---|---|---|---|
| **Orchestrator** | every 15min cron + `issues.*` + `pull_request.closed` + `workflow_dispatch` | TS script (no Claude) | DAG mechanics: parse `Depends on:`, recompute `lifecycle:ready`/`blocked`, dispatch up to N parallel Implementers, close issues on PR merge |
| **Implementer** | `workflow_dispatch` (issue_number) by Orchestrator | Claude Sonnet 4.6 | Read issue + locked specs, write code on `agent/issue-N-slug`, open draft PR `Closes #N` |
| **Reviewer** | `pull_request.opened/synchronize/ready_for_review` | Claude Haiku 4.5 | Review against issue scope and locked decisions; on approve, `gh pr merge --auto --squash`; on request-changes, label `agent:implementer` for re-dispatch |
| **Tester** | `pull_request.opened/synchronize/ready_for_review` | deterministic CI (no Claude) | Affected-files-only typecheck/lint/test via `turbo --filter=...[base]` + Vitest `--changed`. The `agent-tester` check is the auto-merge gate |
| **Documenter** | `pull_request.closed` (merged) + weekly cron | Claude Haiku 4.5 | Read merged diff; if architecture/product/runbook docs need updating, open follow-up `docs:` PR |
| **Spec-Watcher** | `pull_request.closed` (merged) for `type:doc` PRs touching spec docs + `workflow_dispatch` | Claude Haiku 4.5 | Read spec diff; if it introduces new work, propose new issues labeled `needs-triage` + `needs-human` for human approval |

Three of the six (Orchestrator, Tester, two of the others when on Haiku)
draw modest Claude usage; one (Orchestrator, Tester) draws none. The
heavy hitter is the Implementer, pinned to Sonnet 4.6 for code quality.

## End-to-end flow

```
                    ┌────────────────────────┐
                    │   tools/orchestrator/  │
                    │      issues.ts         │  human-curated seed
                    └──────────┬─────────────┘
                               │ bootstrap-issues.ts (one-shot)
                               ▼
              ┌────────────────────────────────────┐
              │      GitHub Issues (the DAG)       │
              │   labels = lifecycle state         │
              └──────────┬─────────────────────────┘
                         │
                         │ every 15min, on every issue/PR event
                         ▼
                  ┌──────────────┐
                  │ Orchestrator │  parses Depends on:
                  └──────┬───────┘  computes ready set
                         │          dispatches up to N parallel
                         ▼
        ┌─────────────────────────────────────────┐
        │   Implementer  ×N (Sonnet)              │
        │   - reads issue + locked specs          │
        │   - writes code, opens draft PR         │
        │   - labels agent:reviewer on PR         │
        └────────────┬───────────────┬────────────┘
                     │               │
                     ▼               ▼
              ┌──────────┐   ┌──────────────┐
              │ Reviewer │   │   Tester     │
              │ (Haiku)  │   │  (deterministic, changed-only)
              └────┬─────┘   └──────┬───────┘
                   │                │
                   │ approves +     │ green check is the
                   │ gh pr merge    │ auto-merge gate
                   │  --auto        │
                   └───────┬────────┘
                           │ GitHub auto-merges when both green
                           ▼
                    ┌──────────────┐
                    │ PR closed,   │
                    │ merged=true  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────────┐ ┌──────────────┐
       │Orchestr. │ │ Documenter   │ │ Spec-Watcher │
       │close #N  │ │ updates docs │ │ if doc PR:   │
       │unblock   │ │ if architec. │ │ propose new  │
       │downstream│ │ touched      │ │ issues       │
       └──────────┘ └──────────────┘ └──────────────┘
                                            │
                                            │ needs-triage
                                            ▼
                                    ┌────────────────┐
                                    │ Human triages  │
                                    │ → DAG          │
                                    └────────────────┘
```

## Lifecycle state machine

```
                 (no deps OR all deps closed)
   created ─────────────────► lifecycle:ready
       │                            │
       │ (deps unmet)               │ Orchestrator dispatches
       ▼                            ▼
   lifecycle:blocked          lifecycle:in-progress
       ▲                            │
       │ (dep closes)               │ Implementer opens PR
       │                            ▼
       │                      lifecycle:in-review
       │                            │
       │                            │ PR merges
       │                            ▼
       └──────── (downstream) ── lifecycle:done (issue closed)

   any state ─────► needs-human    (cycles, scope failures, escalations)
                    needs-triage   (Spec-Watcher proposal awaiting review)
```

Exactly one `lifecycle:*` label at any time, set by the Orchestrator
(except `in-progress` is set by the Orchestrator at dispatch time, and
`in-review` is set by the Implementer when opening the PR).

## Parallelism + claim sets

The Orchestrator dispatches up to `MAX_CONCURRENT_IMPLEMENTERS` (default
3) at once. Two issues conflict if their **claim sets** overlap.

The claim set is parsed from the issue body in this priority:

1. Explicit `## Files` section listing absolute paths.
2. Coarse fallback by `area:*` label (`area:web` → `apps/web/`,
   `area:api` → `apps/api/`, etc.).
3. Last resort: claim everything (`*`) — issue runs alone.

This means well-specified issues with `## Files` parallelize finely;
issues that only declare `area:` parallelize across areas; vague issues
serialize. The system degrades gracefully.

## Data flow boundaries

| Boundary | Crosser | Why |
|---|---|---|
| Spec docs → DAG | Spec-Watcher (proposes); human (triages) | Specs are authored by humans; new work needs human approval before entering autonomous flow |
| DAG → Code | Implementer | The only agent that writes feature code |
| Code → Tests | Implementer (writes) + Tester (runs) | Implementer ships tests; Tester executes them per-PR on changed files |
| Code → Docs | Documenter | After-the-fact reconciliation; one-way, never modifies specs |
| PR → DAG state | Reviewer (merges) + Orchestrator (closes issue, unblocks downstream) | Two distinct roles: judge (Reviewer) and bookkeeper (Orchestrator) |

The boundaries are intentional. The Documenter is **not** allowed to
modify specs (those are human-authored); the Spec-Watcher is **not**
allowed to add issues directly to the DAG (it proposes only). The
Implementer is **not** allowed to modify the issue inventory
(`tools/orchestrator/issues.ts`).

## Auth model

- **`CLAUDE_CODE_OAUTH_TOKEN`** — Claude Code subscription auth, scoped
  to the user's Claude.ai account. Used by Implementer, Reviewer,
  Documenter, Spec-Watcher.
  - Generated by `claude setup-token` locally.
  - Rotates periodically; agents fail auth → regenerate.
- **`BOT_PAT`** — fine-grained GitHub PAT with `contents:write`,
  `pull-requests:write`, `issues:write`, `workflows:write`.
  - Used by all workflows for `gh` CLI calls.
  - Required because the default `GITHUB_TOKEN` does NOT retrigger
    workflows on its own pushes (intentional anti-loop guard from
    GitHub).
- **`ANTHROPIC_API_KEY`** — optional fallback if you want to insulate a
  specific workflow from subscription quota stalls. Not used by default.

The `BOT_PAT` belongs to the user's GitHub account, so PRs authored by
agents appear under the user's name. This means the user cannot approve
their own agent PRs — branch protection's "require approving review"
must be off (or you need a separate bot identity).

## Failure modes and self-recovery

The system is designed to self-heal in the common cases:

- **Implementer fails halfway** → recovery step removes
  `lifecycle:in-progress`, restores `lifecycle:ready`, comments on the
  issue. Next Orchestrator pass re-dispatches.
- **Reviewer requests changes** → labels `agent:implementer`, removes
  `agent:reviewer`. Orchestrator re-dispatches Implementer for the
  source issue.
- **Tester fails** → auto-merge gated; PR sits until Implementer fixes.
  Pushing to the PR branch re-triggers Tester via `synchronize`.
- **Subscription quota exhausted** → all Claude agents fail at the
  action step. Implementer's recovery resets labels. Once quota refreshes
  (5h window), next Orchestrator pass re-dispatches.
- **Cycle in deps** → Orchestrator labels every issue in the cycle
  `needs-human` and skips them. Human breaks the cycle.
- **Two parallel Implementers conflict at merge** → second-merging PR
  fails to fast-forward. The second Implementer's recovery step runs;
  Orchestrator re-dispatches once the first PR is in.

What does **not** self-heal:

- Misconfigured secrets (`BOT_PAT` expired, `CLAUDE_CODE_OAUTH_TOKEN`
  rotated).
- Branch protection rule too strict (e.g., requires reviews from a
  different account than the BOT_PAT identity).
- Acceptance criteria genuinely impossible — Implementer comments and
  resets to ready, will loop forever until the issue is rewritten or
  closed manually.

## Why this shape

A few non-obvious choices:

- **The Orchestrator is not a Claude agent.** It does pure mechanics
  (label parsing, dependency lookup, dispatching). Replacing Claude with
  a 350-line TS script eliminates the highest-volume API draw (672
  scheduled runs/week) without losing any reasoning value.
- **Tester is not a Claude agent either.** Test running is deterministic;
  Claude reasoning adds no value over `pnpm test`. Per-PR, this is the
  single most expensive non-Claude activity (Postgres service container,
  full install) — but the changed-files filter keeps it fast.
- **Reviewer + Tester are two checks, not one.** They have orthogonal
  failure modes. Reviewer judges intent against the spec; Tester proves
  the code runs. Auto-merge fires only when both are happy.
- **The `## Files` claim model lets parallelism degrade gracefully.**
  A perfectly specified issue parallelizes; a poorly specified one
  serializes. The system never deadlocks on unspecified issues — they
  just take their slot alone.
- **Spec-Watcher proposes; humans triage.** Letting an LLM directly
  modify the DAG would be a one-way ratchet of noise. Triage is a
  conscious gate. Once you trust a particular spec author + Spec-Watcher
  combo, you can drop the gate by removing the `needs-triage` label
  default.
- **Documenter never edits specs.** Docs come in two flavors: prescriptive
  (specs, PRD, locked decisions) and descriptive (architecture
  reflections, runbooks). Documenter only writes descriptive docs.
  Specs change only when humans (or Spec-Watcher's proposed-then-
  triaged issues) say so.

## Where it could go next

- **Cost telemetry agent.** Track Claude usage per workflow and surface
  weekly cost reports.
- **Performance regression watcher.** On merge, run a benchmark suite
  and open an issue if any metric regresses.
- **Dependency upgrade agent.** Watch package.json + lockfile diffs,
  open PRs for safe minor/patch upgrades.
- **PR explainer.** On every merged PR, post a one-paragraph plain-
  English summary to a Slack channel.

These are deliberately not built — the v1 swarm has six agents because
the v1 build needs six agents. Add more only when the cost/value
calculation flips.
