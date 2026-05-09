# Agent Runbook

The Hone v1 build is driven by five autonomous GitHub Actions workflows.
This runbook covers operating, debugging, and recovering them.

## Agent overview

| Agent | Workflow | Trigger | Role |
|---|---|---|---|
| Orchestrator | `agent-orchestrator.yml` | every 15 min, on issue/PR events, manual dispatch | parses `Depends on:` lines, sets `lifecycle:ready`/`blocked`, dispatches up to `MAX_CONCURRENT_IMPLEMENTERS` (default 3) ready issues whose `## Files` claim sets don't overlap, closes issues when their PR merges |
| Implementer | `agent-implementer.yml` | manual dispatch (or repository_dispatch) with `issue_number` | reads the issue and locked specs, writes code on a branch, opens a draft PR `Closes #N` |
| Reviewer | `agent-reviewer.yml` | on `pull_request.opened/synchronize/ready_for_review` | reviews diff against issue scope and locked decisions; on approve calls `gh pr merge --auto --squash` |
| Tester | `agent-tester.yml` | on `pull_request.*` | typecheck + lint + test against a Postgres service container; the `agent-tester` check is the auto-merge gate |
| Documenter | `agent-documenter.yml` | on `pull_request.closed` (merged), weekly cron, manual dispatch | reads merged diff, opens follow-up doc PR if architecture/product/API/runbook docs need updates |

Auto-merge is wired so that Reviewer's approval plus a green Tester check
triggers GitHub's auto-merge with squash. The Orchestrator then closes the
linked issue and re-evaluates the DAG.

## One-time setup

Before the agents can run end-to-end, do this once:

1. **Set repo secrets:**
   - `ANTHROPIC_API_KEY` — Anthropic API key, provisioned with a billing budget.
   - `BOT_PAT` — fine-grained PAT scoped to this repo with `contents:write`, `pull-requests:write`, `issues:write`, `workflows:write`. Required so Implementer's PR triggers Reviewer/Tester (default `GITHUB_TOKEN` does not retrigger workflows on its own pushes).
2. **Bootstrap labels:**
   - `gh workflow run bootstrap-labels.yml -R TheCruzControll/bookshelf` — or trigger from the Actions tab. Idempotent.
3. **Branch protection on `main`:**
   - Require status check: `agent-tester` (the test job)
   - Require linear history
   - Allow auto-merge
   - Dismiss stale approvals on new commits
4. **Bootstrap issues:**
   - From a local checkout: `pnpm tsx tools/orchestrator/bootstrap-issues.ts`
   - Creates ~93 issues with deps and labels. Idempotent on re-run via `[X-NN]` title prefixes.
5. **Kick off:**
   - `gh workflow run agent-orchestrator.yml`
   - The Orchestrator labels Wave 0 issues `lifecycle:ready` and dispatches the lowest-numbered W0 issue to the Implementer.

## Daily operations

- **Check progress:** the Actions tab shows recent runs of all five workflows. Issues filtered by `lifecycle:in-progress`, `lifecycle:in-review` show what's flowing.
- **Inspect a stuck issue:** `gh issue view N` — labels indicate state. If `lifecycle:in-progress` for >1 hour with no PR, kill the Implementer run via `gh run cancel <run-id>` and reset the issue: `gh issue edit N --remove-label lifecycle:in-progress --add-label lifecycle:ready`.
- **Adjust parallelism:** edit `MAX_CONCURRENT_IMPLEMENTERS` in `agent-orchestrator.yml`. Default 3. Push to a new branch + PR so the change goes through review. Higher numbers = faster wall-clock but more API spend and more rebase conflicts.
- **Conflict during parallel runs:** when two Implementers' PRs both claim files outside their declared `## Files` sections, the second to merge will rebase-fail. The Implementer's recovery step resets the issue to `lifecycle:ready`; the next Orchestrator pass re-dispatches. If conflicts are frequent, tighten the `## Files` declarations on the offending issues.
- **Re-run Reviewer on a PR:** push an empty commit to the PR branch (`git commit --allow-empty -m "retry review"; git push`) — Reviewer triggers on `synchronize`.
- **Force a Documenter run for a merged PR:** `gh workflow run agent-documenter.yml -f pr_number=<n>`.
- **Audit invariants:** `pnpm tsx tools/orchestrator/audit.ts` — verifies every open issue has exactly one `lifecycle:*`, one `wave:*`, one `type:*`; no `lifecycle:ready` issue has unsatisfied deps; no two issues are simultaneously `lifecycle:in-progress`.

## Failure modes

- **Implementer fails halfway** → its `Recover on failure` step removes `lifecycle:in-progress` and restores `lifecycle:ready`, posts a comment on the issue with the run URL. The Orchestrator's next pass will re-dispatch.
- **Reviewer requests changes** → Reviewer applies `agent:implementer`, removes `agent:reviewer`. Orchestrator re-dispatches the Implementer for that PR's source issue.
- **Tester fails** → auto-merge is gated; the PR sits in `lifecycle:in-review` until the Implementer fixes. A subsequent Implementer run on the same issue will push to the same branch.
- **Cycle detected** → Orchestrator labels every issue in the cycle `needs-human` and stops dispatching.
- **Self-referential dep** → labeled `needs-human`.
- **PR does not have `Closes #N`** → Orchestrator cannot close the issue automatically. Add the line to the PR body and the next Orchestrator pass will close.
- **Anthropic API quota exhausted** → all agents fail at the `claude-code-base-action` step. Refill the budget; re-trigger the workflows.
- **`BOT_PAT` expired** → Implementer's PR doesn't retrigger Reviewer/Tester. Rotate the PAT.

## Stopping the swarm

Pause everything:

```sh
# Disable scheduled triggers
gh workflow disable agent-orchestrator.yml -R TheCruzControll/bookshelf
gh workflow disable agent-documenter.yml -R TheCruzControll/bookshelf
```

Resume with `gh workflow enable`.

To pause without disabling, add `lifecycle:in-progress` to a sentinel issue
to occupy the implementer slot — Orchestrator's single-flight check
prevents new dispatches while any issue is in-progress.

## Cost notes

- Each Implementer run uses 5–30 minutes of Claude API time depending on issue size. Budget for ~$200–800 over the full v1 build at Claude Sonnet pricing.
- Reviewer and Tester run on every PR, including doc-only PRs. Tester skips lint+test for doc-only PRs.
- Weekly Documenter drift audit is bounded — produces at most one PR per run.

## Where to look

- `tools/orchestrator/labels.json` — full label set
- `tools/orchestrator/prompts/*.md` — what each agent is told to do
- `tools/orchestrator/issues.json` — the 93-issue DAG definition
- `tools/orchestrator/bootstrap-issues.ts` — script that creates issues
- `tools/orchestrator/audit.ts` — invariant checker
- `docs/prd-backlog.md` — locked product decisions every Implementer cites
