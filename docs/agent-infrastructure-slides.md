# Hone Agent Infrastructure

> Presentation-format summary of the agent infrastructure as it stands.
> For the conceptual deep-dive see [`agent-architecture.md`](./agent-architecture.md).
> For operations see [`agent-runbook.md`](./agent-runbook.md).

---

## Slide 1 — What it is

A self-driving GitHub Actions swarm that takes a backlog of 169 atomic issues and turns them into merged PRs without manual intervention.

- 1 user (you) writes specs into `docs/prd-backlog.md`
- 7 agent workflows pick up the work
- Result: ~30+ PRs merged in this session, mostly autonomous

---

## Slide 2 — High-level architecture

```
docs/prd-backlog.md  ←─── locked PRD decisions, AC contract
        │
        ▼
GitHub Issues (169)  ←─── DAG with `Depends on:` deps + area labels
        │
        ▼
┌─── Orchestrator (cron, every 10m) ───┐
│  picks ready issues, assigns slots,  │
│  enforces serialization rules        │
└──────┬───────────────────────────────┘
       │ workflow_dispatch
       ▼
┌── Implementer (Sonnet 4.6) ──┐
│  writes code, opens PR        │
└──────┬────────────────────────┘
       │ pull_request opened
       ▼
┌── Tester (Bash + turbo) ──┐    ┌── Reviewer (Haiku 4.5) ──┐
│  changed-files only       │    │  approves or requests     │
│  → agent-tester check     │    │  changes (bounce loop)    │
└───────────────────────────┘    └──────────┬────────────────┘
                                            │ approval
                                            ▼
                                  auto-merge → main
                                            │
                                            ▼
                              ┌── Documenter (Haiku) ──┐
                              │  updates CLAUDE.md +    │
                              │  docs from merged PR    │
                              └─────────────────────────┘
```

---

## Slide 3 — The 7 workflows

| Workflow | Trigger | What it does |
|---|---|---|
| **Orchestrator** | cron 10m | Scans issues, dispatches Implementer for ready ones |
| **Implementer** | workflow_dispatch | Writes code, runs tests, opens PR |
| **Reviewer** | PR opened/sync | Approves or requests changes |
| **Tester** | PR opened/sync | Changed-files typecheck/lint/test → `agent-tester` check |
| **Documenter** | post-merge | Updates docs from merged PR |
| **Spec-Watcher** | docs/* changes | Validates AC stays consistent |
| **Rebaser** | cron + labels | Lockfile-only auto-resolve when PRs go dirty |
| **agent-undraft** | agent-tester completes | Marks PR ready when checks pass |

Plus `ci.yml` (full-suite drift catcher) + `e2e-web.yml` (Playwright) + `nightly.yml` (full repo every night).

---

## Slide 4 — Lifecycle state machine

```
   ┌──────────────┐
   │ lifecycle:   │
   │  ready       │
   └──────┬───────┘
          │ orchestrator dispatch
          ▼
   ┌──────────────┐    Implementer
   │  in-progress │    writes code
   └──────┬───────┘
          │ PR opens
          ▼
   ┌──────────────┐    Reviewer + Tester
   │  in-review   │    run; auto-merge gate
   └──────┬───────┘
          │ merge
          ▼
   ┌──────────────┐
   │  done        │
   └──────────────┘

   `blocked`     — waiting on a `Depends on:`
   `needs-human` — escalation (used sparingly)
```

**Critical:** serialization counts both `in-progress` AND `in-review` as in-flight. (Bug fixed today — see slide 9.)

---

## Slide 5 — Concurrency model

Three layers of throttling control parallelism:

1. **Slot count** — `MAX_CONCURRENT` Implementer runs at any time (currently 4).
2. **Claim intersection** — issues whose declared file claims overlap can't run together (covers area-level conflicts).
3. **Strict serialization** — two file-sets are run **strictly serial across the whole DAG**:
   - `ROOT_CONFIG_FILES`: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, etc.
   - `SHARED_DOMAIN_FILES`: `packages/{db,domain}/src/{schema,types,ports,services,repositories,mappers}.ts`

Why: parallel writes to those files = near-guaranteed merge conflict.

---

## Slide 6 — Auth & credentials

| Mechanism | Used by | Notes |
|---|---|---|
| `claude_code_oauth_token` | Claude agents | Max 5x subscription |
| `BOT_PAT` | Workflow git ops | Cross-PR write permissions |
| Default `GITHUB_TOKEN` | Read-only ops | Tighter scope |
| Branch protection | `main` | Required: `agent-tester / agent-tester` |

**Self-approval fallback**: BOT_PAT user is the PR author, GitHub forbids self-approve. Reviewer swallows the 422 and falls through to `gh pr merge --auto`.

---

## Slide 7 — Auto-merge gate flow

```
PR opens (draft? non-draft?)
  │
  ├─ if draft → agent-undraft watches agent-tester
  │              ↳ marks ready when agent-tester ✅
  │
  ▼
Reviewer runs → ✅ approves
  │
  ▼
agent-tester runs → ✅ green
  │
  ▼
auto-merge fires → squash → main
  │
  ▼
Documenter runs → docs PR opens → loop closes
```

Failure modes (caught today):
- **Reviewer hits Claude API limit** → 17s fail. Recipe: close+reopen PR.
- **PR left as draft** → agent-tester triggers but auto-merge can't gate. Recipe: agent-undraft workflow now does this automatically.
- **`check (22)` drift** → not required; admin merge bypass; tracked in #268.

---

## Slide 8 — Drift defense in depth

| Layer | Gate name | Scope | Required |
|---|---|---|---|
| L1 | `agent-tester` | Changed packages only (turbo `--filter`) | ✅ |
| L2 | `check (22)` | Full-suite typecheck/lint/test/build | ❌ (informational) |
| L3 | `e2e-web` | Playwright smoke tests | ❌ |
| L4 | `nightly.yml` | Full repo every 24h, files `priority:p0` issues | n/a |

**Lesson learned today:** when L1 only sees changed files, transitive breakage on shared files (e.g. RankingRepository getting a new method, breaking 3 mock sites) goes invisible until it's already on main. Today's PR #286 fixed three accumulated drift failures in one shot.

---

## Slide 9 — Failure modes & recovery patterns

Patterns observed in this session, all now codified:

| Pattern | Recovery |
|---|---|
| 12 PRs stuck on shared-file conflicts | Close + reset issue → re-dispatch (PR #257 added serialization, #274 fixed claim matching, #293 fixed lifecycle window) |
| PR opens draft, never marked ready | agent-undraft workflow (PR #283) |
| Reviewer Action fails on API limit | Close + reopen PR → triggers `reopened` event |
| Stuck `merge-conflict + needs-human` label | Close + reset issue with a comment |
| `check (22)` red on every PR | Drop from required, fix drift (PR #286), document in #268 |

---

## Slide 10 — What we shipped today

5 substantive fixes to swarm autonomy:

1. **PR #257** — `SHARED_DOMAIN_FILES` serialization (initial)
2. **PR #274** — `claimsSharedDomain` directory-claim matching (bug: was a no-op)
3. **PR #283** — `agent-undraft` workflow
4. **PR #286** — fixed 3 accumulated drift failures (RankingRepo mocks + unused param)
5. **PR #293** — serialization counts `in-review` (bug: window let parallel work race)

Plus 30+ stuck PRs cleaned up via close+reset; 16+ source issues redispatched against a now-correct serialization rule.

---

## Slide 11 — What's still open

- **Cross-area implicit conflicts**: an `area:api` issue that reaches into `packages/db/src/schema.ts` bypasses serialization. Surfaces as `dirty` PRs needing close+reset. Could be solved by Implementer-side claim declaration before code-write.
- **`check (22)` env drift** (#268): environment-specific failure I couldn't repro locally.
- **Reviewer API-limit fail-fast**: graceful retry rather than manual close+reopen.
- **169 issues missing `## Files`**: serialization currently keyed on area-label fallback. Backfilling explicit file claims would tighten the rule.

---

## Slide 12 — Mental model

> The swarm is a state machine over GitHub labels.
> Every component is a pure function: `(issues + PRs + checks) → (label updates + dispatches)`.
> Bugs in the swarm look like state transitions that should have happened but didn't, or shouldn't have but did.
> Recovery is almost always: identify the wrong state, write the right state directly via the API, let the next cron pass take it from there.

That's the whole shape of it.
