/**
 * Hone v1 atomic issue inventory.
 *
 * The DAG of issues that the autonomous agent team will work through.
 * Each entry is half a day to ~1.5 days of work, has explicit deps by
 * internal ID, and ships with the labels the orchestrator expects.
 *
 * Run `pnpm tsx tools/orchestrator/bootstrap-issues.ts` to create them
 * all on GitHub. Idempotent — re-running skips issues whose `[X-NN]`
 * title prefix already exists.
 */

export type IssueDef = {
  /** Internal ID like "A-01"; used only for deps resolution. */
  id: string;
  /** Issue title. Must start with `[X-NN]` so the bootstrap can dedupe. */
  title: string;
  /** Markdown body (without the trailing `Depends on:` line — added at create time). */
  body: string;
  /** Labels to apply at creation time. Lifecycle is set by the script based on deps. */
  labels: string[];
  /** Internal IDs this issue depends on. */
  deps: string[];
};

const epic = (e: string) => `epic:${e}`;
const area = (a: string) => `area:${a}`;
const wave = (n: number) => `wave:${n}`;
const type_ = (t: string) => `type:${t}`;

export const issues: IssueDef[] = [
  // =========================================================================
  // Epic A — Foundation & CI (W0)
  // =========================================================================
  {
    id: 'A-01',
    title: '[A-01] CI: typecheck/lint/test PR workflow',
    body: `## Goal
Add PR-time CI that runs typecheck, lint, and test across the monorepo.

## Acceptance criteria
- [ ] \`.github/workflows/ci.yml\` exists and runs on PR + push to main
- [ ] Runs \`pnpm typecheck\`, \`pnpm lint\`, \`pnpm test\` via turbo
- [ ] Uses pnpm cache + corepack pin

## Files
- /home/user/Bookshelf/.github/workflows/ci.yml`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: [],
  },
  {
    id: 'A-02',
    title: '[A-02] CI: pnpm cache + corepack pin',
    body: `## Goal
Lock the pnpm version via corepack so CI matches local dev.

## Acceptance criteria
- [ ] \`packageManager\` in root package.json pins pnpm
- [ ] CI workflows use \`pnpm/action-setup\` with the pinned version
- [ ] \`actions/setup-node\` uses \`cache: pnpm\``,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-01'],
  },
  {
    id: 'A-03',
    title: '[A-03] CI: ESLint flat config + Prettier at root',
    body: `## Goal
Real ESLint + Prettier replacing the \`tsc --noEmit\` lint placeholders.

## Acceptance criteria
- [ ] \`eslint.config.mjs\` at root with flat config
- [ ] Per-package extends if needed
- [ ] \`prettier.config.mjs\` at root with project conventions
- [ ] \`pnpm lint\` runs ESLint via turbo`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-01'],
  },
  {
    id: 'A-04',
    title: '[A-04] CI: Vitest scaffolding for api / domain / db',
    body: `## Goal
Add Vitest with a baseline config + coverage so tests can run.

## Acceptance criteria
- [ ] \`vitest.config.ts\` at root
- [ ] Per-package \`vitest.config.ts\` extending root
- [ ] \`pnpm test\` runs via turbo
- [ ] One smoke test per package proves the runner works
- [ ] Coverage via c8 wired in`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-01'],
  },
  {
    id: 'A-05',
    title: '[A-05] CI: replace tsc-only lint placeholders with real lint',
    body: `## Goal
Each package's \`"lint"\` script currently aliases \`tsc --noEmit\`. Move typecheck to its own script and use ESLint for lint.

## Acceptance criteria
- [ ] Each package has \`"typecheck": "tsc --noEmit"\` and \`"lint": "eslint ."\`
- [ ] Turbo lint runs ESLint
- [ ] Existing \`pnpm typecheck\` still passes`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-03'],
  },
  {
    id: 'A-06',
    title: '[A-06] CI: docker-compose Postgres 16 + adminer for local dev',
    body: `## Goal
Local Postgres for dev and integration tests.

## Acceptance criteria
- [ ] \`docker-compose.yml\` at root with Postgres 16 + adminer
- [ ] Volume mount for persistence
- [ ] \`docs/dev-setup.md\` documents \`docker compose up -d postgres\``,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: [],
  },
  {
    id: 'A-07',
    title: '[A-07] CI: .env.example with all v1 envs',
    body: `## Goal
Single source of env truth: Twilio, Apple/Google client ids, KMS, Sentry, Bookshop, OpenLibrary UA.

## Acceptance criteria
- [ ] \`.env.example\` at root listing every var needed
- [ ] Comments grouping by feature (auth, contacts, observability, etc.)
- [ ] README points devs at it`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-06'],
  },
  {
    id: 'A-08',
    title: '[A-08] @hone/config-env: zod-validated env schema',
    body: `## Goal
Type-safe env access via a single zod schema consumed by api, web, native.

## Acceptance criteria
- [ ] \`packages/config-env\` package created
- [ ] Exports a typed \`env\` object validated at startup
- [ ] Crash-loud on missing required vars`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-07'],
  },
  {
    id: 'A-09',
    title: '[A-09] @hone/observability: pino logger + Sentry init',
    body: `## Goal
Shared structured logging + Sentry helpers.

## Acceptance criteria
- [ ] \`packages/observability\` package
- [ ] \`createLogger(name)\` returns a pino logger
- [ ] \`initSentry(env)\` helper for api/web/native`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-08'],
  },
  {
    id: 'A-10',
    title: '[A-10] CI: Postgres service container + db:migrate smoke',
    body: `## Goal
CI runs the \`db:migrate\` step against an ephemeral Postgres so migrations don't drift.

## Acceptance criteria
- [ ] CI matrix on Node 22
- [ ] Postgres 16 service container
- [ ] \`pnpm db:migrate\` runs as a CI step
- [ ] \`apps/api\` build smoke test`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-01', 'A-04', 'A-06'],
  },
  {
    id: 'A-11',
    title: '[A-11] docs/dev-setup.md',
    body: `## Goal
Onboarding doc for local dev.

## Acceptance criteria
- [ ] Steps: clone, pnpm install, docker compose, db:migrate, dev
- [ ] Lists all env vars and where to get them`,
    labels: [type_('doc'), area('ci'), epic('A'), wave(0)],
    deps: ['A-06'],
  },
  {
    id: 'A-12',
    title: '[A-12] CODEOWNERS + PR template',
    body: `## Goal
Default CODEOWNERS, PR template referencing \`Closes #\` convention.

## Acceptance criteria
- [ ] \`/CODEOWNERS\` exists
- [ ] \`.github/PULL_REQUEST_TEMPLATE.md\` exists with summary/AC/test plan/spec sections`,
    labels: [type_('doc'), area('ci'), epic('A'), wave(0)],
    deps: [],
  },
  {
    id: 'A-13',
    title: '[A-13] Agent workflow: orchestrator',
    body: `## Goal
GitHub Actions workflow for the Orchestrator agent.

## Acceptance criteria
- [ ] \`.github/workflows/agent-orchestrator.yml\` exists
- [ ] Schedule + issues + PR closed triggers
- [ ] Loads prompt from \`tools/orchestrator/prompts/orchestrator.md\`
- [ ] Uses \`anthropics/claude-code-base-action\``,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-12'],
  },
  {
    id: 'A-14',
    title: '[A-14] Agent workflow: implementer',
    body: `## Goal
GitHub Actions workflow for the Implementer agent.

## Acceptance criteria
- [ ] \`.github/workflows/agent-implementer.yml\` exists
- [ ] \`workflow_dispatch\` with \`issue_number\` input
- [ ] Concurrency per-issue
- [ ] Uses \`BOT_PAT\` for cross-workflow triggering
- [ ] Recover-on-failure resets labels`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-12'],
  },
  {
    id: 'A-15',
    title: '[A-15] Agent workflow: reviewer',
    body: `## Goal
GitHub Actions workflow for the Reviewer agent.

## Acceptance criteria
- [ ] \`.github/workflows/agent-reviewer.yml\` exists
- [ ] Triggers on \`pull_request.opened/synchronize/ready_for_review\`
- [ ] Calls \`gh pr merge --auto --squash\` on approve`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-12'],
  },
  {
    id: 'A-16',
    title: '[A-16] Agent workflow: tester (changed-files only)',
    body: `## Goal
GitHub Actions workflow for the Tester. Runs typecheck/lint/test against turbo-affected packages with Vitest \`--changed\`.

## Acceptance criteria
- [ ] \`.github/workflows/agent-tester.yml\` exists
- [ ] Detects diff vs base ref
- [ ] Doc-only PRs skip lint/test
- [ ] Posts a single summary comment with executed test names
- [ ] Sets the \`agent-tester\` check status (auto-merge gate)`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-12'],
  },
  {
    id: 'A-17',
    title: '[A-17] Agent workflow: documenter',
    body: `## Goal
GitHub Actions workflow for the Documenter agent.

## Acceptance criteria
- [ ] \`.github/workflows/agent-documenter.yml\` exists
- [ ] Triggers on \`pull_request.closed\` (merged), weekly schedule, manual dispatch
- [ ] Skips itself for \`type:doc\` PRs to prevent loops`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-12'],
  },
  {
    id: 'A-18',
    title: '[A-18] tools/orchestrator/audit.ts: invariant checker',
    body: `## Goal
A local script that validates the issue DAG state on demand.

## Acceptance criteria
- [ ] \`pnpm tsx tools/orchestrator/audit.ts\` runs and reports
- [ ] Verifies every open issue has exactly one \`lifecycle:*\`, one \`wave:*\`, one \`type:*\`
- [ ] Verifies no \`lifecycle:ready\` issue has unsatisfied deps
- [ ] Verifies at most one \`lifecycle:in-progress\`
- [ ] Detects cycles via Tarjan SCC and reports them`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-13'],
  },
  {
    id: 'A-19',
    title: '[A-19] docs/agent-runbook.md',
    body: `## Goal
Operator runbook for the agent swarm.

## Acceptance criteria
- [ ] Covers triggering, debugging, recovery, stopping
- [ ] Lists all five workflows
- [ ] Documents the failure modes and recovery procedures`,
    labels: [type_('doc'), area('ci'), epic('A'), wave(0)],
    deps: ['A-13', 'A-14', 'A-15', 'A-16', 'A-17'],
  },
  {
    id: 'A-20',
    title: '[A-20] @hone/test-fixtures: factories + seed scenes',
    body: `## Goal
Shared test data: factories per entity, seed scenes for common scenarios, recorded HTTP fixtures.

## Acceptance criteria
- [ ] \`packages/test-fixtures\` package
- [ ] \`makeProfile\`, \`makeBook\`, \`makeRanking\`, etc. factories
- [ ] \`seedFollowGraph\`, \`seedCatalog\`, \`seedRankingState\` scenes
- [ ] Time control helpers for fake timers
- [ ] HTTP fixtures dir for nock`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-04'],
  },
  {
    id: 'A-21',
    title: '[A-21] Playwright e2e setup for apps/web',
    body: `## Goal
Web e2e against a docker-compose-driven backend.

## Acceptance criteria
- [ ] \`apps/web/e2e/\` directory with Playwright config
- [ ] One smoke test (cold launch + sign-in stub) passes
- [ ] CI workflow path-filtered (web/domain/api changes)`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-06'],
  },
  {
    id: 'A-22',
    title: '[A-22] Maestro e2e setup for apps/native',
    body: `## Goal
Native e2e via Maestro on iOS simulator.

## Acceptance criteria
- [ ] \`apps/native/e2e/\` directory with Maestro YAML
- [ ] One smoke test (cold launch) passes on macOS runner
- [ ] Nightly schedule + manual dispatch`,
    labels: [type_('infra'), area('native'), epic('A'), wave(0)],
    deps: ['A-04'],
  },
  {
    id: 'A-23',
    title: '[A-23] Vitest coverage thresholds + nightly full suite',
    body: `## Goal
Enforce coverage targets and run a full-suite check nightly to catch drift the per-PR filter misses.

## Acceptance criteria
- [ ] Per-package thresholds in \`vitest.config.ts\` (domain 90, db/api 80, web/native 60)
- [ ] CI fails on threshold breach
- [ ] Nightly workflow runs the full suite + opens \`priority:p0\` issue on failure`,
    labels: [type_('infra'), area('ci'), epic('A'), wave(0)],
    deps: ['A-04'],
  },

  // =========================================================================
  // Epic B — DB schema migrations (W1)
  // =========================================================================
  {
    id: 'B-01',
    title: '[B-01] DB: migrate Visibility enum to Posture C 4-tier',
    body: `## Goal
Replace \`private/friends/public\` with \`public/followers/mutuals/private\`.

## Acceptance criteria
- [ ] New Drizzle migration adding the 4-tier enum
- [ ] Existing rows mapped (\`friends\` → \`mutuals\`)
- [ ] \`packages/db/src/schema.ts\` updated
- [ ] Mappers updated`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['A-10'],
  },
  {
    id: 'B-02',
    title: '[B-02] DB: follows table replacing friendships',
    body: `## Goal
Asymmetric follow graph.

## Acceptance criteria
- [ ] \`follows(follower_id, followee_id, created_at)\` with unique pair
- [ ] Indexed in both directions
- [ ] Drop \`friendships\` table in same migration`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-03',
    title: '[B-03] DB: blocks + blocks_against_hash',
    body: `## Goal
Hard block + retention against hashed phone after deletion.

## Acceptance criteria
- [ ] \`blocks(blocker_id, blocked_id, created_at)\`
- [ ] \`blocks_against_hash(hash, expires_at)\` for 90-day retention
- [ ] Indexed lookups`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-04',
    title: '[B-04] DB: auth_identities + sessions',
    body: `## Goal
OAuth identity linking + opaque-token sessions.

## Acceptance criteria
- [ ] \`auth_identities(provider, provider_user_id, profile_id)\`
- [ ] \`sessions(token_hash, profile_id, expires_at, revoked_at)\`
- [ ] Indexed by provider+id and token_hash`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-05',
    title: '[B-05] DB: phone_verifications + phone_numbers',
    body: `## Goal
Phone verify state + per-profile phone (E.164).

## Acceptance criteria
- [ ] \`phone_verifications(phone_e164, code_hash, attempts, expires_at)\`
- [ ] \`phone_numbers(profile_id, e164_hash)\``,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-06',
    title: '[B-06] DB: shelves extension for lists (kind/author_type/curator_tier)',
    body: `## Goal
Lists are extended Shelves per Q16b.

## Acceptance criteria
- [ ] Add \`kind\`, \`author_type\`, \`curator_tier\`, \`description\`, \`published_at\``,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-07',
    title: '[B-07] DB: shelf_items.notes + position',
    body: `## Goal
Per-item commentary and ordering on lists.

## Acceptance criteria
- [ ] Add \`notes\` text and \`position\` int columns to \`shelf_items\``,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-06'],
  },
  {
    id: 'B-08',
    title: '[B-08] DB: rankings table',
    body: `## Goal
Per-user book rank with derived score.

## Acceptance criteria
- [ ] \`rankings(profile_id, book_id, position int, score numeric, bucket smallint, locked_at, version)\`
- [ ] Unique (profile_id, book_id)`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-09',
    title: '[B-09] DB: version columns for optimistic locking',
    body: `## Goal
\`version\` int on reviews, shelves, profiles for 409-on-stale-edit.

## Acceptance criteria
- [ ] Migrations add the column with default 1
- [ ] Repositories' update queries enforce version match`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-10',
    title: '[B-10] DB: activity_events score snapshot + group_key',
    body: `## Goal
Frozen score on feed events + same-actor 30-min grouping key.

## Acceptance criteria
- [ ] Add \`score_at_publish numeric\`, \`score_locked_at_publish bool\`
- [ ] Add \`group_key text\` indexed for feed query`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-08'],
  },
  {
    id: 'B-11',
    title: '[B-11] DB: imports extension (idempotency hash + conflict count)',
    body: `## Goal
Goodreads import job tracking.

## Acceptance criteria
- [ ] Add \`source\`, \`idempotency_hash\`, \`conflict_count\`, \`status\` to imports`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-12',
    title: '[B-12] DB: contacts_index + email_index',
    body: `## Goal
Hashed contacts match indexes.

## Acceptance criteria
- [ ] \`contacts_index(profile_id, contact_hash, salt_version, expires_at)\`
- [ ] \`email_index(profile_id, email_hash, salt_version, expires_at)\``,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-13',
    title: '[B-13] DB: notification_tokens + notification_settings',
    body: `## Goal
Push token registration + per-user preferences.

## Acceptance criteria
- [ ] \`notification_tokens(profile_id, platform, token, last_seen)\`
- [ ] \`notification_settings(profile_id, key, value jsonb)\``,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-14',
    title: '[B-14] DB: account_deletions',
    body: `## Goal
Soft-delete state with 30-day grace.

## Acceptance criteria
- [ ] \`account_deletions(profile_id, requested_at, hard_delete_after, exported_at)\``,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-15',
    title: '[B-15] DB: taste_vectors',
    body: `## Goal
Per-user taste profile cache for recs.

## Acceptance criteria
- [ ] \`taste_vectors(profile_id, vector jsonb, updated_at)\`
- [ ] Indexed by profile`,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-01'],
  },
  {
    id: 'B-16',
    title: '[B-16] DB: refactor repositories for new schema',
    body: `## Goal
Update \`packages/db/src/repositories.ts\` to expose every new table; refactor \`ShelfRepository\` for the lists extension.

## Acceptance criteria
- [ ] Repositories exist for follows, blocks, rankings, lists, contacts, notifications, imports, sessions
- [ ] All updates use the optimistic-locking version where required
- [ ] Mappers extended in \`mappers.ts\``,
    labels: [type_('feature'), area('db'), epic('B'), wave(1)],
    deps: ['B-06', 'B-07', 'B-08', 'B-09', 'B-10', 'B-12', 'B-13'],
  },
  {
    id: 'B-17',
    title: '[B-17] Repository unit tests via testcontainers',
    body: `## Goal
Real-Postgres tests for every repository.

## Acceptance criteria
- [ ] testcontainers Postgres setup helper
- [ ] At least one happy + one failure test per repository`,
    labels: [type_('test'), area('db'), epic('B'), wave(1)],
    deps: ['B-16'],
  },

  // =========================================================================
  // Epic C — Domain ports & types (W1)
  // =========================================================================
  {
    id: 'C-01',
    title: '[C-01] Domain: Visibility union → Posture C',
    body: `## Goal
Match the new DB enum from B-01.

## Acceptance criteria
- [ ] \`packages/domain/src/types.ts\` Visibility = 'public' | 'followers' | 'mutuals' | 'private'
- [ ] Add \`ContentType\` enum
- [ ] Update Profile.defaultVisibility shape`,
    labels: [type_('feature'), area('domain'), epic('C'), wave(1)],
    deps: ['A-08'],
  },
  {
    id: 'C-02',
    title: '[C-02] Domain: Follow / Block / Ranking / List / Notification types',
    body: `## Goal
Add the new entity types matching Wave 1 schema.

## Acceptance criteria
- [ ] Types: Follow, Block, Ranking, List, ListItem, NotificationToken, Import, ContactsHash, Session
- [ ] Exhaustive enums for verbs/states`,
    labels: [type_('feature'), area('domain'), epic('C'), wave(1)],
    deps: ['C-01'],
  },
  {
    id: 'C-03',
    title: '[C-03] Domain: ports for new repositories',
    body: `## Goal
Hexagonal ports matching the new entities.

## Acceptance criteria
- [ ] Ports: FollowRepository, BlockRepository, RankingRepository, NotificationRepository, ImportRepository, ContactsRepository, ListRepository, SessionRepository
- [ ] Methods cover CRUD + visibility-aware reads`,
    labels: [type_('feature'), area('domain'), epic('C'), wave(1)],
    deps: ['C-02'],
  },
  {
    id: 'C-04',
    title: '[C-04] Domain: VisibilityFilter helper + BlockFilter port',
    body: `## Goal
Single source of truth for "can this viewer see this content?"

## Acceptance criteria
- [ ] \`applyVisibilityFilter(viewerCtx, items)\` reusable across repositories
- [ ] \`BlockFilter\` port with \`removeBlocked(viewerId, items)\`
- [ ] Composable: visibility ∧ block`,
    labels: [type_('feature'), area('domain'), epic('C'), wave(1)],
    deps: ['C-02'],
  },
  {
    id: 'C-05',
    title: '[C-05] Domain: shared zod schemas under src/schemas/',
    body: `## Goal
tRPC inputs/outputs share types via \`@hone/domain/schemas\`.

## Acceptance criteria
- [ ] \`packages/domain/src/schemas/\` directory
- [ ] One file per entity / surface (auth, profiles, shelves, ranking, feed, recs, lists, notifications)
- [ ] Re-exported from package index`,
    labels: [type_('feature'), area('domain'), epic('C'), wave(1)],
    deps: ['C-02'],
  },
  {
    id: 'C-06',
    title: '[C-06] Domain: VisibilityFilter property tests',
    body: `## Goal
fast-check covers the 4 visibilities × viewer-relationships matrix.

## Acceptance criteria
- [ ] Property: blocked viewer never sees content
- [ ] Property: \`private\` only the author sees
- [ ] Property: \`public\` everyone sees (modulo block)
- [ ] Property: \`mutuals\` requires bidirectional follow
- [ ] Property: \`followers\` requires unidirectional follow`,
    labels: [type_('test'), area('domain'), epic('C'), wave(1)],
    deps: ['C-04'],
  },

  // =========================================================================
  // Epic D — tRPC + Hono adapter (W2)
  // =========================================================================
  {
    id: 'D-01',
    title: '[D-01] tRPC mount in apps/api at /trpc',
    body: `## Goal
Mount tRPC router via Hono adapter; replace ad-hoc routes.

## Acceptance criteria
- [ ] \`apps/api/src/trpc/context.ts\` builds per-request context
- [ ] \`apps/api/src/trpc/router.ts\` aggregates sub-routers
- [ ] Hono adapter mounts at \`/trpc/*\`
- [ ] \`/health\` retained`,
    labels: [type_('feature'), area('api'), epic('D'), wave(2)],
    deps: ['A-09', 'C-05'],
  },
  {
    id: 'D-02',
    title: '[D-02] tRPC error mapping middleware',
    body: `## Goal
zod and domain errors → \`TRPCError\` with safe messages.

## Acceptance criteria
- [ ] Error formatter on the tRPC router
- [ ] Sentry capture on internal errors
- [ ] No leaked stack traces in responses`,
    labels: [type_('feature'), area('api'), epic('D'), wave(2)],
    deps: ['D-01'],
  },
  {
    id: 'D-03',
    title: '[D-03] Request id + trace + access log middleware',
    body: `## Goal
Every request has a request id and structured access log.

## Acceptance criteria
- [ ] \`x-request-id\` header in/out
- [ ] pino logger logs method, path, status, duration, request id
- [ ] OpenTelemetry-light hook (no exporter yet)`,
    labels: [type_('feature'), area('api'), epic('D'), wave(2)],
    deps: ['D-01', 'A-09'],
  },
  {
    id: 'D-04',
    title: '[D-04] tRPC rate limiter (per route group)',
    body: `## Goal
Token-bucket limiter, in-memory dev / Redis prod.

## Acceptance criteria
- [ ] Configurable per route group (auth, search, write)
- [ ] 429 response with retry-after`,
    labels: [type_('feature'), area('api'), epic('D'), wave(2)],
    deps: ['D-01'],
  },
  {
    id: 'D-05',
    title: '[D-05] Auth middleware for tRPC',
    body: `## Goal
Parse session token from cookie or \`Authorization: Bearer\`; populate context.

## Acceptance criteria
- [ ] Looks up session by token hash
- [ ] Loads profile + visibility context
- [ ] Sets \`ctx.viewer\` or null`,
    labels: [type_('feature'), area('api'), epic('D'), wave(2)],
    deps: ['D-01', 'B-04'],
  },
  {
    id: 'D-06',
    title: '[D-06] tRPC integration test',
    body: `## Goal
End-to-end round trip with mocked context.

## Acceptance criteria
- [ ] supertest hits \`/trpc/health\` style proc
- [ ] Asserts shape and status`,
    labels: [type_('test'), area('api'), epic('D'), wave(2)],
    deps: ['D-01'],
  },

  // =========================================================================
  // Epic E — Auth & onboarding (W2-W3)
  // =========================================================================
  {
    id: 'E-01',
    title: '[E-01] Apple Sign-In: server-side token validation',
    body: `## Goal
Validate Apple identity tokens, link or create identity.

## Acceptance criteria
- [ ] JWKS validation
- [ ] Email relay handling
- [ ] tRPC procedure \`auth.appleSignIn\``,
    labels: [type_('feature'), area('api'), epic('E'), wave(2)],
    deps: ['D-05'],
  },
  {
    id: 'E-02',
    title: '[E-02] Google Sign-In: id_token validation + identity link',
    body: `## Goal
Validate Google id_token, link or create identity.

## Acceptance criteria
- [ ] tRPC \`auth.googleSignIn\`
- [ ] Reuses session model from D-05`,
    labels: [type_('feature'), area('api'), epic('E'), wave(2)],
    deps: ['D-05'],
  },
  {
    id: 'E-03',
    title: '[E-03] Email magic-link auth',
    body: `## Goal
Passwordless email magic link.

## Acceptance criteria
- [ ] tRPC \`auth.requestMagicLink\`, \`auth.consumeMagicLink\`
- [ ] One-time token, short TTL, hashed at rest
- [ ] Email send via configured provider`,
    labels: [type_('feature'), area('api'), epic('E'), wave(2)],
    deps: ['D-05'],
  },
  {
    id: 'E-04',
    title: '[E-04] Twilio Verify SMS phone OTP',
    body: `## Goal
Phone verify gating the home feed.

## Acceptance criteria
- [ ] tRPC \`auth.startPhoneVerify\`, \`auth.confirmPhoneVerify\`
- [ ] libphonenumber-js E.164 normalization
- [ ] Rate limiting + SMS pumping protection`,
    labels: [type_('feature'), area('api'), epic('E'), wave(2)],
    deps: ['B-05', 'D-01'],
  },
  {
    id: 'E-05',
    title: '[E-05] Session lifecycle: create / rotate / revoke',
    body: `## Goal
Opaque random tokens, sha256 stored.

## Acceptance criteria
- [ ] \`auth.session.create / rotate / revoke\`
- [ ] Session repository uses sha256 token hash`,
    labels: [type_('feature'), area('api'), epic('E'), wave(2)],
    deps: ['D-05', 'B-04'],
  },
  {
    id: 'E-06',
    title: '[E-06] Handle creation procedure',
    body: `## Goal
Reserved-list, availability, suggestion fallback.

## Acceptance criteria
- [ ] tRPC \`profile.checkHandle\`, \`profile.setHandle\`
- [ ] Reserved list (admin, root, etc.)
- [ ] Case-insensitive uniqueness
- [ ] Returns suggestions on collision`,
    labels: [type_('feature'), area('api'), epic('E'), wave(2)],
    deps: ['D-01'],
  },
  {
    id: 'E-07',
    title: '[E-07] Web auth pages',
    body: `## Goal
\`/sign-in\`, \`/sign-up\`, OAuth callbacks.

## Acceptance criteria
- [ ] All three providers wired
- [ ] Redirect-to-onboarding after first sign-in`,
    labels: [type_('feature'), area('web'), epic('E'), wave(3)],
    deps: ['E-01', 'E-02', 'E-03'],
  },
  {
    id: 'E-08',
    title: '[E-08] Web onboarding flow',
    body: `## Goal
\`/onboarding/{phone,handle,first-book,contacts,follow,notifications}\`.

## Acceptance criteria
- [ ] All required steps gate the home feed
- [ ] All optional steps skippable with one-tap
- [ ] Soft notification prompt before iOS dialog`,
    labels: [type_('feature'), area('web'), epic('E'), wave(3)],
    deps: ['E-04', 'E-06'],
  },
  {
    id: 'E-09',
    title: '[E-09] Native auth screens',
    body: `## Goal
Expo AuthSession for Apple/Google + magic link deep link.

## Acceptance criteria
- [ ] All three providers wired
- [ ] Deep link returns to app for magic-link consumption`,
    labels: [type_('feature'), area('native'), epic('E'), wave(3)],
    deps: ['E-01', 'E-02', 'E-03'],
  },
  {
    id: 'E-10',
    title: '[E-10] Native onboarding screens',
    body: `## Goal
Mirror the web onboarding flow.

## Acceptance criteria
- [ ] Same step ordering as web
- [ ] Native UI primitives`,
    labels: [type_('feature'), area('native'), epic('E'), wave(3)],
    deps: ['E-04', 'E-06'],
  },
  {
    id: 'E-11',
    title: '[E-11] Auth integration tests with provider mocks',
    body: `## Goal
End-to-end OAuth + SMS flows with mocked providers.

## Acceptance criteria
- [ ] msw-mocked Apple/Google JWKS
- [ ] Twilio Verify mocked at HTTP layer
- [ ] Tests cover happy + every documented failure`,
    labels: [type_('test'), area('api'), epic('E'), wave(3)],
    deps: ['E-01', 'E-02', 'E-03', 'E-04'],
  },

  // =========================================================================
  // Epic F — Catalog (Open Library + Google Books) (W2-W3)
  // =========================================================================
  {
    id: 'F-01',
    title: '[F-01] CatalogProvider port + BookSearchResult type',
    body: `## Goal
Hexagonal port for catalog clients.

## Acceptance criteria
- [ ] \`packages/domain\` exports \`CatalogProvider\` port
- [ ] \`BookSearchResult\` covers OL + GB shapes`,
    labels: [type_('feature'), area('domain'), epic('F'), wave(2)],
    deps: ['C-02'],
  },
  {
    id: 'F-02',
    title: '[F-02] Open Library client',
    body: `## Goal
Search + by-isbn + by-work; UA header; retries.

## Acceptance criteria
- [ ] Adapter implements CatalogProvider
- [ ] Configurable User-Agent per OL etiquette
- [ ] Timeout + retry`,
    labels: [type_('feature'), area('api'), epic('F'), wave(2)],
    deps: ['F-01'],
  },
  {
    id: 'F-03',
    title: '[F-03] Google Books fallback client',
    body: `## Goal
Gated by env API key; same port shape.

## Acceptance criteria
- [ ] Adapter implements CatalogProvider
- [ ] Disabled if API key missing — no errors thrown`,
    labels: [type_('feature'), area('api'), epic('F'), wave(2)],
    deps: ['F-01'],
  },
  {
    id: 'F-04',
    title: '[F-04] ISBN-13 normalization helper',
    body: `## Goal
Single source of truth for ISBN handling.

## Acceptance criteria
- [ ] \`packages/domain\` exports \`normalizeIsbn(value): string\`
- [ ] ISBN-10 → ISBN-13 conversion
- [ ] Strips spaces/dashes; validates checksum
- [ ] fast-check property: idempotent`,
    labels: [type_('feature'), area('domain'), epic('F'), wave(2)],
    deps: ['C-02'],
  },
  {
    id: 'F-05',
    title: '[F-05] CatalogService.search with OL primary + GB fallback',
    body: `## Goal
Q8 lock: OL first; GB on miss; merge results; cache.

## Acceptance criteria
- [ ] Service composes OL + GB via the port
- [ ] On OL miss (zero results) → GB call
- [ ] Result cached in books/editions table
- [ ] Subsequent identical search hits cache`,
    labels: [type_('feature'), area('api'), epic('F'), wave(3)],
    deps: ['F-02', 'F-03', 'F-04'],
  },
  {
    id: 'F-06',
    title: '[F-06] Edition merge logic',
    body: `## Goal
ISBN-13 dedup; prefer OL canonical work.

## Acceptance criteria
- [ ] Merge rule: same ISBN-13 → one Book + multiple Editions
- [ ] OL work id back-fills GB-sourced books when later seen`,
    labels: [type_('feature'), area('api'), epic('F'), wave(3)],
    deps: ['F-05', 'B-16'],
  },
  {
    id: 'F-07',
    title: '[F-07] Search re-ranker',
    body: `## Goal
Layered re-rank over OL solr default.

## Acceptance criteria
- [ ] Boost: exact title, exact author, edition count
- [ ] Locale-language preference
- [ ] Publish-year tiebreak`,
    labels: [type_('feature'), area('api'), epic('F'), wave(3)],
    deps: ['F-05'],
  },
  {
    id: 'F-08',
    title: '[F-08] Catalog snapshot tests with nock',
    body: `## Goal
Recorded fixtures for OL + GB happy and edge cases.

## Acceptance criteria
- [ ] Fixtures: OL hit, OL miss + GB hit, both miss, malformed
- [ ] Tests assert merged result shape and cache state`,
    labels: [type_('test'), area('api'), epic('F'), wave(3)],
    deps: ['F-05'],
  },

  // =========================================================================
  // Epic G — Search/Add UX (W3)
  // =========================================================================
  {
    id: 'G-01',
    title: '[G-01] tRPC: catalog.search / byIsbn / books.createManual',
    body: `## Goal
Procedures backing search, scan, manual entry.

## Acceptance criteria
- [ ] All three procs wired
- [ ] Inputs validated via zod schemas
- [ ] Honors visibility filter for any user-content lookups`,
    labels: [type_('feature'), area('api'), epic('G'), wave(3)],
    deps: ['F-05', 'F-06'],
  },
  {
    id: 'G-02',
    title: '[G-02] Web /search page + Add Sheet',
    body: `## Goal
Search and add-to-shelf per docs/search-add-flow-spec.md.

## Acceptance criteria
- [ ] Search input handles title/author/ISBN
- [ ] Result cards show cover/title/author/year + existing user state
- [ ] Add Sheet with status + shelf + privacy + note`,
    labels: [type_('feature'), area('web'), epic('G'), wave(3)],
    deps: ['G-01'],
  },
  {
    id: 'G-03',
    title: '[G-03] Native search screen + Add Sheet',
    body: `## Goal
Native parity with web search/add.

## Acceptance criteria
- [ ] Search screen mirrors web behavior
- [ ] Add Sheet uses native sheet primitive`,
    labels: [type_('feature'), area('native'), epic('G'), wave(3)],
    deps: ['G-01'],
  },
  {
    id: 'G-04',
    title: '[G-04] Native ISBN scan via expo-camera',
    body: `## Goal
Camera barcode scan on iOS; manual ISBN entry on web.

## Acceptance criteria
- [ ] expo-camera + expo-barcode-scanner
- [ ] Scan result feeds into the same Add Sheet as search`,
    labels: [type_('feature'), area('native'), epic('G'), wave(3)],
    deps: ['G-03'],
  },
  {
    id: 'G-05',
    title: '[G-05] Web manual book creation form',
    body: `## Goal
Title + at least one author; optional ISBN/year/cover.

## Acceptance criteria
- [ ] \`source: 'manual'\` on the resulting Edition
- [ ] Validates required fields client + server`,
    labels: [type_('feature'), area('web'), epic('G'), wave(3)],
    deps: ['G-01'],
  },
  {
    id: 'G-06',
    title: '[G-06] Native manual book creation form',
    body: `## Goal
Native parity with web manual create.

## Acceptance criteria
- [ ] Same field set as web
- [ ] Submits to the same procedure`,
    labels: [type_('feature'), area('native'), epic('G'), wave(3)],
    deps: ['G-01'],
  },

  // =========================================================================
  // Epic H — Privacy & visibility filter (W2)
  // =========================================================================
  {
    id: 'H-01',
    title: '[H-01] Per-content-type default visibility on Profile',
    body: `## Goal
Profile carries per-entity defaults: review, shelf, ranking, list, current_reading.

## Acceptance criteria
- [ ] Profile entity has \`defaultVisibility: Record<ContentType, Visibility>\`
- [ ] Migration backfills with Posture C defaults`,
    labels: [type_('feature'), area('domain'), epic('H'), wave(2)],
    deps: ['C-01', 'B-01'],
  },
  {
    id: 'H-02',
    title: '[H-02] applyVisibilityFilter shared helper',
    body: `## Goal
One function used by every read that returns user content.

## Acceptance criteria
- [ ] \`applyVisibilityFilter(viewerCtx, items)\` in domain
- [ ] Composable with block filter
- [ ] Documented usage in every repository file's header comment`,
    labels: [type_('feature'), area('domain'), epic('H'), wave(2)],
    deps: ['C-04', 'B-02', 'B-03'],
  },
  {
    id: 'H-03',
    title: '[H-03] SQL viewer-scoped WHERE builder',
    body: `## Goal
Drizzle helper that builds the visibility-aware WHERE clause for any user-content query.

## Acceptance criteria
- [ ] Reusable in repositories
- [ ] Honors mutuals via follows join
- [ ] Honors block-against-viewer`,
    labels: [type_('feature'), area('db'), epic('H'), wave(2)],
    deps: ['H-02', 'B-16'],
  },
  {
    id: 'H-04',
    title: '[H-04] Privacy filter property tests (apps/api)',
    body: `## Goal
End-to-end tests through the tRPC layer cover the visibility matrix.

## Acceptance criteria
- [ ] Property tests: 4 visibilities × 6 viewer relationships per content type
- [ ] Failures show the offending pair`,
    labels: [type_('test'), area('api'), epic('H'), wave(2)],
    deps: ['H-02'],
  },
  {
    id: 'H-05',
    title: '[H-05] Block enforcement everywhere',
    body: `## Goal
Block applies to search, feed, recs, contacts, follow, list discovery.

## Acceptance criteria
- [ ] Each surfacing path calls \`removeBlocked\`
- [ ] Tests assert blocked users absent from each surface`,
    labels: [type_('feature'), area('domain'), epic('H'), wave(2)],
    deps: ['B-03', 'H-02'],
  },

  // =========================================================================
  // Epic I — Follow graph (W3)
  // =========================================================================
  {
    id: 'I-01',
    title: '[I-01] tRPC: follow.create / delete / list',
    body: `## Goal
Idempotent follow ops.

## Acceptance criteria
- [ ] Procs wired
- [ ] Block check on follow.create
- [ ] List paginated and visibility-filtered`,
    labels: [type_('feature'), area('api'), epic('I'), wave(3)],
    deps: ['B-02', 'D-01', 'H-05'],
  },
  {
    id: 'I-02',
    title: '[I-02] Mutual derivation view + cached count',
    body: `## Goal
Materialized or computed mutual count on profile.

## Acceptance criteria
- [ ] Mutual count exposed on profile read
- [ ] Updated on follow/unfollow`,
    labels: [type_('feature'), area('api'), epic('I'), wave(3)],
    deps: ['I-01'],
  },
  {
    id: 'I-03',
    title: '[I-03] tRPC: block.create / delete with cascade unfollow',
    body: `## Goal
Hard block flow.

## Acceptance criteria
- [ ] Severs follow both directions
- [ ] No auto-restore on unblock
- [ ] Visible in search/contacts surfaces immediately`,
    labels: [type_('feature'), area('api'), epic('I'), wave(3)],
    deps: ['B-03', 'I-01'],
  },
  {
    id: 'I-04',
    title: '[I-04] Web profile follow/unfollow + lists',
    body: `## Goal
Follow button + followers/following pages.

## Acceptance criteria
- [ ] Optimistic UI on follow/unfollow
- [ ] Public lists per Q10 lock`,
    labels: [type_('feature'), area('web'), epic('I'), wave(3)],
    deps: ['I-01', 'I-02'],
  },
  {
    id: 'I-05',
    title: '[I-05] Native profile follow/unfollow + lists',
    body: `## Goal
Native parity.

## Acceptance criteria
- [ ] Mirrors web behavior`,
    labels: [type_('feature'), area('native'), epic('I'), wave(3)],
    deps: ['I-01', 'I-02'],
  },

  // =========================================================================
  // Epic J — Contacts pipeline (W3)
  // =========================================================================
  {
    id: 'J-01',
    title: '[J-01] HMAC contact hash builder + libphonenumber',
    body: `## Goal
Server-side hashing per Q9 lock.

## Acceptance criteria
- [ ] HMAC-SHA-256 with rotating salt
- [ ] libphonenumber-js E.164 normalization
- [ ] Raw values never written to disk`,
    labels: [type_('feature'), area('api'), epic('J'), wave(3)],
    deps: ['B-12'],
  },
  {
    id: 'J-02',
    title: '[J-02] KMS salt management + monthly rotation cron',
    body: `## Goal
Salt rotated monthly via KMS.

## Acceptance criteria
- [ ] AWS KMS adapter (or local stub for dev)
- [ ] \`salts\` table with versions
- [ ] Cron rotates and re-hashes existing user phones`,
    labels: [type_('feature'), area('api'), epic('J'), wave(3)],
    deps: ['J-01'],
  },
  {
    id: 'J-03',
    title: '[J-03] tRPC: contacts.upload',
    body: `## Goal
Accept hashed batch of contacts from the device.

## Acceptance criteria
- [ ] Body validates current salt version
- [ ] Inserts into \`contacts_index\`
- [ ] Caps batch size`,
    labels: [type_('feature'), area('api'), epic('J'), wave(3)],
    deps: ['J-01', 'J-02'],
  },
  {
    id: 'J-04',
    title: '[J-04] tRPC: contacts.match',
    body: `## Goal
Query → list of profile_ids matching uploaded hashes; visibility-filtered.

## Acceptance criteria
- [ ] Joins \`contacts_index\` against \`phone_numbers\`
- [ ] Excludes blocked users
- [ ] Returns minimal public profile shape`,
    labels: [type_('feature'), area('api'), epic('J'), wave(3)],
    deps: ['J-03', 'H-02'],
  },
  {
    id: 'J-05',
    title: '[J-05] Email-index parallel pipeline',
    body: `## Goal
Same scheme on lowercased+trimmed email.

## Acceptance criteria
- [ ] Separate email-hash index
- [ ] Same upload + match procs accept email batches`,
    labels: [type_('feature'), area('api'), epic('J'), wave(3)],
    deps: ['B-12'],
  },
  {
    id: 'J-06',
    title: '[J-06] Disable + delete contacts',
    body: `## Goal
\`contacts.disableSync\` deletes the user's index rows within 24h.

## Acceptance criteria
- [ ] Soft delete + scheduled cleanup
- [ ] Cascade on account deletion`,
    labels: [type_('feature'), area('api'), epic('J'), wave(3)],
    deps: ['J-03'],
  },
  {
    id: 'J-07',
    title: '[J-07] Salt rotation + retention tests',
    body: `## Goal
Rotation correctness + 90-day retention behavior.

## Acceptance criteria
- [ ] Test: old salt version still matches in N-1 window
- [ ] Test: rows past retention purged
- [ ] Test: account deletion clears target hashes`,
    labels: [type_('test'), area('api'), epic('J'), wave(3)],
    deps: ['J-02'],
  },

  // =========================================================================
  // Epic K — Goodreads import (W3)
  // =========================================================================
  {
    id: 'K-01',
    title: '[K-01] Goodreads CSV parser',
    body: `## Goal
Tolerant parser for Goodreads export columns.

## Acceptance criteria
- [ ] Handles known column variants
- [ ] Normalizes status names
- [ ] Returns typed rows`,
    labels: [type_('feature'), area('api'), epic('K'), wave(3)],
    deps: ['D-01'],
  },
  {
    id: 'K-02',
    title: '[K-02] Match algorithm: ISBN + fuzzy title/author',
    body: `## Goal
ISBN-13 match → Matched; Levenshtein-bounded title+author → Needs review; else Unmatched.

## Acceptance criteria
- [ ] Levenshtein ≤ 2 title, ≤ 1 author surname
- [ ] Confidence score on each row`,
    labels: [type_('feature'), area('api'), epic('K'), wave(3)],
    deps: ['K-01', 'F-05'],
  },
  {
    id: 'K-03',
    title: '[K-03] Import job model + idempotency hash',
    body: `## Goal
Track import job state + dedupe re-uploads.

## Acceptance criteria
- [ ] \`imports.idempotency_hash = sha256(file)\`
- [ ] Status transitions tracked`,
    labels: [type_('feature'), area('api'), epic('K'), wave(3)],
    deps: ['B-11', 'K-01'],
  },
  {
    id: 'K-04',
    title: '[K-04] Conflict bucket for state mismatches',
    body: `## Goal
Goodreads vs Hone state diff → conflict bucket.

## Acceptance criteria
- [ ] Bucket separate from matched/needs-review/unmatched
- [ ] Default: keep Hone state`,
    labels: [type_('feature'), area('api'), epic('K'), wave(3)],
    deps: ['K-02', 'K-03'],
  },
  {
    id: 'K-05',
    title: '[K-05] Re-upload prompt logic',
    body: `## Goal
Q22 lock: hash match → prompt user.

## Acceptance criteria
- [ ] On match: returns three options to client
- [ ] Server enforces the chosen path`,
    labels: [type_('feature'), area('api'), epic('K'), wave(3)],
    deps: ['K-03'],
  },
  {
    id: 'K-06',
    title: '[K-06] ISBN+status dedup rule',
    body: `## Goal
Skip rows where (book_id, status) matches existing user state.

## Acceptance criteria
- [ ] Implemented in match phase
- [ ] Counted in \`conflict_count\``,
    labels: [type_('feature'), area('api'), epic('K'), wave(3)],
    deps: ['K-02'],
  },
  {
    id: 'K-07',
    title: '[K-07] Web import UI: upload + review + confirm',
    body: `## Goal
Per docs/search-add-flow-spec.md import UI.

## Acceptance criteria
- [ ] CSV upload
- [ ] Progress indicator
- [ ] Review screen with four buckets
- [ ] Confirm step commits the import`,
    labels: [type_('feature'), area('web'), epic('K'), wave(3)],
    deps: ['K-04'],
  },
  {
    id: 'K-08',
    title: '[K-08] Goodreads import fixture tests',
    body: `## Goal
5 fixture CSVs covering match buckets + re-upload + conflicts.

## Acceptance criteria
- [ ] Fixtures committed under \`packages/test-fixtures\`
- [ ] Tests assert bucket assignments`,
    labels: [type_('test'), area('api'), epic('K'), wave(3)],
    deps: ['K-02'],
  },

  // =========================================================================
  // Epic L — Ranking flow (W3)
  // =========================================================================
  {
    id: 'L-01',
    title: '[L-01] tRPC: ranking.startBucket',
    body: `## Goal
Capture the temporary 1-5 star bucket per docs/ranking-flow-spec.md.

## Acceptance criteria
- [ ] Stored privately on the ranking row, never visible after submission
- [ ] Validated 1..5`,
    labels: [type_('feature'), area('api'), epic('L'), wave(3)],
    deps: ['B-08', 'D-01'],
  },
  {
    id: 'L-02',
    title: '[L-02] Comparison candidate selection',
    body: `## Goal
Genre-aware candidate within the user's prior rankings.

## Acceptance criteria
- [ ] Bucket-narrowed nearest neighbor
- [ ] Falls back globally if genre overlap is empty`,
    labels: [type_('feature'), area('api'), epic('L'), wave(3)],
    deps: ['B-08'],
  },
  {
    id: 'L-03',
    title: '[L-03] Binary insertion: ranking.compare',
    body: `## Goal
Procedural binary search via repeated comparison procs.

## Acceptance criteria
- [ ] Returns next pair until insertion converges
- [ ] Server keeps state between calls`,
    labels: [type_('feature'), area('api'), epic('L'), wave(3)],
    deps: ['L-02'],
  },
  {
    id: 'L-04',
    title: '[L-04] Score derivation + frozen-at-publish',
    body: `## Goal
Score is derived from rank position; activity event captures snapshot.

## Acceptance criteria
- [ ] \`scoreFromRank(position, total)\` pure function
- [ ] On finished: insert ranking, compute score, write activity event with snapshot`,
    labels: [type_('feature'), area('api'), epic('L'), wave(3)],
    deps: ['L-03', 'B-10'],
  },
  {
    id: 'L-05',
    title: '[L-05] Score-unlock at 10 books',
    body: `## Goal
Hide score until threshold; reveal across surfaces once unlocked.

## Acceptance criteria
- [ ] \`isScoreUnlocked(profile)\` derived from finished count
- [ ] All read paths apply the gate`,
    labels: [type_('feature'), area('api'), epic('L'), wave(3)],
    deps: ['L-04'],
  },
  {
    id: 'L-06',
    title: '[L-06] Rerank procedure',
    body: `## Goal
User reorders an existing book; new feed event published, old retains frozen score.

## Acceptance criteria
- [ ] tRPC \`ranking.rerank\`
- [ ] Optimistic locking on the ranking row
- [ ] Activity event chain reflects the rerank`,
    labels: [type_('feature'), area('api'), epic('L'), wave(3)],
    deps: ['L-04'],
  },
  {
    id: 'L-07',
    title: '[L-07] Web ranking flow UI',
    body: `## Goal
Modal sequence per docs/ranking-flow-spec.md.

## Acceptance criteria
- [ ] Bucket → comparison → score
- [ ] Honors the unlock state`,
    labels: [type_('feature'), area('web'), epic('L'), wave(3)],
    deps: ['L-01', 'L-02', 'L-03', 'L-04'],
  },
  {
    id: 'L-08',
    title: '[L-08] Native ranking flow UI',
    body: `## Goal
Native parity with web.

## Acceptance criteria
- [ ] Same sequence and gating`,
    labels: [type_('feature'), area('native'), epic('L'), wave(3)],
    deps: ['L-01', 'L-02', 'L-03', 'L-04'],
  },
  {
    id: 'L-09',
    title: '[L-09] Ranking property tests',
    body: `## Goal
fast-check covers monotonicity and binary insertion correctness.

## Acceptance criteria
- [ ] Property: insertion converges in O(log n) comparisons
- [ ] Property: score monotonic in rank position
- [ ] Property: score in [0, 10]`,
    labels: [type_('test'), area('api'), epic('L'), wave(3)],
    deps: ['L-04'],
  },

  // =========================================================================
  // Epic M — Reviews (W3)
  // =========================================================================
  {
    id: 'M-01',
    title: '[M-01] tRPC: review.create',
    body: `## Goal
Optionally chained from ranking flow.

## Acceptance criteria
- [ ] Per-review visibility (default public)
- [ ] Wired into the ranking flow on finished`,
    labels: [type_('feature'), area('api'), epic('M'), wave(3)],
    deps: ['D-01', 'B-09'],
  },
  {
    id: 'M-02',
    title: '[M-02] tRPC: review.update with optimistic locking',
    body: `## Goal
409 on stale version, manual merge prompt on client.

## Acceptance criteria
- [ ] Version mismatch returns 409 with current value
- [ ] Tests cover conflict path`,
    labels: [type_('feature'), area('api'), epic('M'), wave(3)],
    deps: ['M-01'],
  },
  {
    id: 'M-03',
    title: '[M-03] tRPC: review.delete',
    body: `## Goal
Delete review and cascade activity event removal from feeds.

## Acceptance criteria
- [ ] Removes activity event refs
- [ ] Authz: only author can delete`,
    labels: [type_('feature'), area('api'), epic('M'), wave(3)],
    deps: ['M-01'],
  },
  {
    id: 'M-04',
    title: '[M-04] Web review compose',
    body: `## Goal
Component reused in ranking flow + standalone edit.

## Acceptance criteria
- [ ] Visibility selector
- [ ] Optimistic locking error handling`,
    labels: [type_('feature'), area('web'), epic('M'), wave(3)],
    deps: ['M-01'],
  },
  {
    id: 'M-05',
    title: '[M-05] Native review compose',
    body: `## Goal
Native parity.

## Acceptance criteria
- [ ] Same component contract`,
    labels: [type_('feature'), area('native'), epic('M'), wave(3)],
    deps: ['M-01'],
  },

  // =========================================================================
  // Epic N — Shelves & Lists (W2-W3)
  // =========================================================================
  {
    id: 'N-01',
    title: '[N-01] System shelves auto-create on profile create',
    body: `## Goal
Reading / Want-to-Read / Finished / Dropped seeded on signup.

## Acceptance criteria
- [ ] Profile creation hook creates the four system shelves
- [ ] Idempotent`,
    labels: [type_('feature'), area('api'), epic('N'), wave(2)],
    deps: ['B-06', 'E-06'],
  },
  {
    id: 'N-02',
    title: '[N-02] Custom shelf CRUD',
    body: `## Goal
Per-shelf privacy at creation.

## Acceptance criteria
- [ ] tRPC \`shelf.create / update / delete / list\`
- [ ] Visibility settable per shelf
- [ ] Authz on owner`,
    labels: [type_('feature'), area('api'), epic('N'), wave(3)],
    deps: ['N-01'],
  },
  {
    id: 'N-03',
    title: '[N-03] ShelfItem CRUD with notes + position',
    body: `## Goal
Per-item commentary; ordering for lists.

## Acceptance criteria
- [ ] tRPC \`shelfItem.upsert / move / delete\`
- [ ] Position defaults to append on add`,
    labels: [type_('feature'), area('api'), epic('N'), wave(3)],
    deps: ['B-07', 'N-01'],
  },
  {
    id: 'N-04',
    title: '[N-04] Lists: publish/unpublish on Shelf with kind=list',
    body: `## Goal
Promote a custom shelf into a published list.

## Acceptance criteria
- [ ] tRPC \`list.publish / unpublish\`
- [ ] Sets \`published_at\`
- [ ] Toggles list eligibility for Discover`,
    labels: [type_('feature'), area('api'), epic('N'), wave(3)],
    deps: ['N-02'],
  },
  {
    id: 'N-05',
    title: '[N-05] Internal editorial badge enforcement',
    body: `## Goal
Only verified accounts can publish with \`author_type=internal_editorial\`.

## Acceptance criteria
- [ ] Server-side role check
- [ ] Badge surfaces on the list page`,
    labels: [type_('feature'), area('api'), epic('N'), wave(3)],
    deps: ['N-04'],
  },
  {
    id: 'N-06',
    title: '[N-06] Algorithmic list framework + 5 launch queries',
    body: `## Goal
"Trending in Your Circle", "New on Hone", "Highly Ranked This Month", "Popular in Your Top Genre", "What Your Mutuals Are Reading Right Now".

## Acceptance criteria
- [ ] Query registry under \`packages/domain\`
- [ ] Daily refresh job
- [ ] Author label "Generated by Hone"`,
    labels: [type_('feature'), area('api'), epic('N'), wave(3)],
    deps: ['N-04', 'P-01'],
  },
  {
    id: 'N-07',
    title: '[N-07] Web shelf + list pages',
    body: `## Goal
Render shelves and lists with privacy-aware visibility.

## Acceptance criteria
- [ ] \`/u/{handle}/shelves/{slug}\` route
- [ ] \`/u/{handle}/lists/{slug}\` route
- [ ] Editorial / algorithmic lists discoverable on equal footing`,
    labels: [type_('feature'), area('web'), epic('N'), wave(3)],
    deps: ['N-02', 'N-03', 'N-04'],
  },
  {
    id: 'N-08',
    title: '[N-08] Native shelf + list screens',
    body: `## Goal
Native parity.

## Acceptance criteria
- [ ] Same routes/screens as web`,
    labels: [type_('feature'), area('native'), epic('N'), wave(3)],
    deps: ['N-02', 'N-03', 'N-04'],
  },

  // =========================================================================
  // Epic O — Feed (W3)
  // =========================================================================
  {
    id: 'O-01',
    title: '[O-01] Activity event publisher with score snapshot',
    body: `## Goal
Every state transition emits an event with frozen score.

## Acceptance criteria
- [ ] Helper used by ranking, status changes, list publish
- [ ] Snapshot fields populated
- [ ] No event emitted for unfinished ranking flows`,
    labels: [type_('feature'), area('api'), epic('O'), wave(3)],
    deps: ['B-10', 'L-04'],
  },
  {
    id: 'O-02',
    title: '[O-02] 30-min same-actor grouping',
    body: `## Goal
\`group_key = (actor_id, verb_family, floor(occurred_at/30m))\`.

## Acceptance criteria
- [ ] Set on insert
- [ ] Different verbs stay separate`,
    labels: [type_('feature'), area('api'), epic('O'), wave(3)],
    deps: ['B-10'],
  },
  {
    id: 'O-03',
    title: '[O-03] Chronological feed with cursor pagination on group boundaries',
    body: `## Goal
Cursor never splits a group.

## Acceptance criteria
- [ ] Cursor encodes (group_key, occurred_at) anchor
- [ ] Page boundaries align with groups`,
    labels: [type_('feature'), area('api'), epic('O'), wave(3)],
    deps: ['O-02', 'H-02'],
  },
  {
    id: 'O-04',
    title: '[O-04] Feed visibility + block filter',
    body: `## Goal
Apply \`applyVisibilityFilter\` and \`removeBlocked\` per item.

## Acceptance criteria
- [ ] Tests cover viewer relationships × content visibility`,
    labels: [type_('feature'), area('api'), epic('O'), wave(3)],
    deps: ['H-02', 'H-05'],
  },
  {
    id: 'O-05',
    title: '[O-05] Web feed with grouped cards',
    body: `## Goal
Render group cards with collapsed item details.

## Acceptance criteria
- [ ] "Maya finished 3 books" card with stacked covers
- [ ] Tap expands to individual events`,
    labels: [type_('feature'), area('web'), epic('O'), wave(3)],
    deps: ['O-03'],
  },
  {
    id: 'O-06',
    title: '[O-06] Native feed screen',
    body: `## Goal
Native parity.

## Acceptance criteria
- [ ] Pull-to-refresh
- [ ] Same grouping behavior as web`,
    labels: [type_('feature'), area('native'), epic('O'), wave(3)],
    deps: ['O-03'],
  },

  // =========================================================================
  // Epic P — Recommendations (W3)
  // =========================================================================
  {
    id: 'P-01',
    title: '[P-01] Heuristic scorer (weighted-sum)',
    body: `## Goal
Per Q16d: mutual_count, mutual_avg_score, taste_overlap (cosine), genre_match, recency, popularity_floor.

## Acceptance criteria
- [ ] \`scoreCandidate(viewer, candidate): { score, dominantSignal }\`
- [ ] Hand-tuned starting weights
- [ ] Documented in \`docs/recs.md\``,
    labels: [type_('feature'), area('api'), epic('P'), wave(3)],
    deps: ['B-15', 'I-02'],
  },
  {
    id: 'P-02',
    title: '[P-02] Candidate query',
    body: `## Goal
Fetch candidate book set: popular + followed-network + genre overlap.

## Acceptance criteria
- [ ] Top-K candidates per viewer
- [ ] Excludes already-finished or blocked sources`,
    labels: [type_('feature'), area('api'), epic('P'), wave(3)],
    deps: ['P-01'],
  },
  {
    id: 'P-03',
    title: '[P-03] Reason picker',
    body: `## Goal
One-line "why this?" per rec from dominant signal.

## Acceptance criteria
- [ ] \`reasonFor(dominantSignal, candidate)\` returns localized string`,
    labels: [type_('feature'), area('api'), epic('P'), wave(3)],
    deps: ['P-01'],
  },
  {
    id: 'P-04',
    title: '[P-04] Rec cache (5-minute TTL per (user, surface))',
    body: `## Goal
Avoid recomputing on every scroll.

## Acceptance criteria
- [ ] In-memory cache with key (user_id, surface)
- [ ] TTL configurable`,
    labels: [type_('feature'), area('api'), epic('P'), wave(3)],
    deps: ['P-01'],
  },
  {
    id: 'P-05',
    title: '[P-05] Cold-start ladder',
    body: `## Goal
<3 mutuals or <10 ranked → "Popular reads to get you started" path.

## Acceptance criteria
- [ ] Ladder: popular-on-Hone → editorial picks → OL global popularity
- [ ] Reason label reflects the cold-start state`,
    labels: [type_('feature'), area('api'), epic('P'), wave(3)],
    deps: ['P-02'],
  },
  {
    id: 'P-06',
    title: '[P-06] Web Discover tab + Book Detail rec rails',
    body: `## Goal
Two surfaces per Q15.

## Acceptance criteria
- [ ] Discover tab in nav
- [ ] Book Detail "you might also like" carousel`,
    labels: [type_('feature'), area('web'), epic('P'), wave(3)],
    deps: ['P-04'],
  },
  {
    id: 'P-07',
    title: '[P-07] Native Discover tab + Book Detail rec rails',
    body: `## Goal
Native parity.

## Acceptance criteria
- [ ] Same surfaces`,
    labels: [type_('feature'), area('native'), epic('P'), wave(3)],
    deps: ['P-04'],
  },
  {
    id: 'P-08',
    title: '[P-08] People-you-may-know surface (passive)',
    body: `## Goal
Contacts-match + 2nd-degree follow on the Discover tab; no push (Q4 lock).

## Acceptance criteria
- [ ] Query combines contacts-match + FoF
- [ ] Excludes mutuals + blocked`,
    labels: [type_('feature'), area('api'), epic('P'), wave(3)],
    deps: ['J-04', 'I-02'],
  },

  // =========================================================================
  // Epic Q — Notifications (W3)
  // =========================================================================
  {
    id: 'Q-01',
    title: '[Q-01] tRPC: notifications.list / markRead',
    body: `## Goal
In-app notifications surface.

## Acceptance criteria
- [ ] List paginated, newest first
- [ ] markRead is idempotent`,
    labels: [type_('feature'), area('api'), epic('Q'), wave(3)],
    deps: ['B-13', 'D-01'],
  },
  {
    id: 'Q-02',
    title: '[Q-02] Push token register/unregister + APNs adapter',
    body: `## Goal
iOS push first; FCM stub for parity.

## Acceptance criteria
- [ ] tRPC \`notifications.registerToken / unregister\`
- [ ] APNs send on the documented triggers`,
    labels: [type_('feature'), area('api'), epic('Q'), wave(3)],
    deps: ['B-13'],
  },
  {
    id: 'Q-03',
    title: '[Q-03] Notification settings CRUD + caps',
    body: `## Goal
Per-trigger toggle, per-channel, quiet hours, master pause.

## Acceptance criteria
- [ ] All settings persisted
- [ ] Caps enforced server-side (5/day per recipient, 3/day per actor)`,
    labels: [type_('feature'), area('api'), epic('Q'), wave(3)],
    deps: ['B-13'],
  },
  {
    id: 'Q-04',
    title: '[Q-04] Direct social events push (Q18 minimal posture)',
    body: `## Goal
Push fires only for: new follower, mutual follow back, mutual rates 8+, mutual finishes WTR book.

## Acceptance criteria
- [ ] Triggers wired
- [ ] Quiet hours respected`,
    labels: [type_('feature'), area('api'), epic('Q'), wave(3)],
    deps: ['Q-02'],
  },
  {
    id: 'Q-05',
    title: '[Q-05] Web notifications center',
    body: `## Goal
Bell icon + list view.

## Acceptance criteria
- [ ] Reads from \`notifications.list\`
- [ ] Mark as read on view`,
    labels: [type_('feature'), area('web'), epic('Q'), wave(3)],
    deps: ['Q-01'],
  },
  {
    id: 'Q-06',
    title: '[Q-06] Native notifications center + push registration',
    body: `## Goal
Native parity + APNs token registration on launch.

## Acceptance criteria
- [ ] Native list view
- [ ] Token registered after notifications permission grant`,
    labels: [type_('feature'), area('native'), epic('Q'), wave(3)],
    deps: ['Q-02', 'Q-05'],
  },

  // =========================================================================
  // Epic R — Account deletion + GDPR (W3)
  // =========================================================================
  {
    id: 'R-01',
    title: '[R-01] tRPC: account.requestDelete (soft-delete state)',
    body: `## Goal
30-day grace.

## Acceptance criteria
- [ ] Writes \`account_deletions\` row
- [ ] Marks profile soft-deleted across reads`,
    labels: [type_('feature'), area('api'), epic('R'), wave(3)],
    deps: ['B-14', 'D-05'],
  },
  {
    id: 'R-02',
    title: '[R-02] Hard-delete cron after 30-day grace',
    body: `## Goal
Daily job hard-deletes accounts past their grace.

## Acceptance criteria
- [ ] Deletes profile, reviews, lists, feed events, ranking signals
- [ ] Cleans up follower/following relationships`,
    labels: [type_('feature'), area('api'), epic('R'), wave(3)],
    deps: ['R-01', 'A-10'],
  },
  {
    id: 'R-03',
    title: '[R-03] GDPR export builder',
    body: `## Goal
Zipped JSON of profile + reviews + shelves + activity.

## Acceptance criteria
- [ ] tRPC \`account.requestExport\` returns a signed URL
- [ ] Archive contents documented in \`docs/runbook.md\``,
    labels: [type_('feature'), area('api'), epic('R'), wave(3)],
    deps: ['R-01'],
  },
  {
    id: 'R-04',
    title: '[R-04] Blocks-against-hash retention beyond hard delete',
    body: `## Goal
Blocks against deleted user retained 90 days against hashed phone.

## Acceptance criteria
- [ ] On hard delete, blocks-against migrate to \`blocks_against_hash\`
- [ ] Re-signup with same number re-applies the block`,
    labels: [type_('feature'), area('api'), epic('R'), wave(3)],
    deps: ['R-02', 'B-03'],
  },
  {
    id: 'R-05',
    title: '[R-05] Cancel-deletion within 30-day window',
    body: `## Goal
\`account.cancelDelete\` restores everything.

## Acceptance criteria
- [ ] Removes \`account_deletions\` row
- [ ] Restores visibility on all surfaces`,
    labels: [type_('feature'), area('api'), epic('R'), wave(3)],
    deps: ['R-01'],
  },

  // =========================================================================
  // Epic S — SEO + handle URLs (W3)
  // =========================================================================
  {
    id: 'S-01',
    title: '[S-01] Handle-based public routes',
    body: `## Goal
\`/u/{handle}\`, \`/u/{handle}/shelves/{slug}\`, \`/u/{handle}/reviews/{id}\`, \`/u/{handle}/lists/{slug}\`.

## Acceptance criteria
- [ ] All routes RSC/ISR
- [ ] Honors visibility for logged-out viewer`,
    labels: [type_('feature'), area('web'), epic('S'), wave(3)],
    deps: ['E-06'],
  },
  {
    id: 'S-02',
    title: '[S-02] 301 redirect on handle rename',
    body: `## Goal
\`handle_history\` table + middleware.

## Acceptance criteria
- [ ] Old handle 301 to current
- [ ] Retained for several years`,
    labels: [type_('feature'), area('web'), epic('S'), wave(3)],
    deps: ['S-01', 'B-01'],
  },
  {
    id: 'S-03',
    title: '[S-03] Sitemap generator (ISR-aware)',
    body: `## Goal
Includes profiles, books, lists.

## Acceptance criteria
- [ ] \`/sitemap.xml\` route
- [ ] Updated daily`,
    labels: [type_('feature'), area('web'), epic('S'), wave(3)],
    deps: ['S-01'],
  },
  {
    id: 'S-04',
    title: '[S-04] OpenGraph + meta tags per public page',
    body: `## Goal
Profile/book/list metadata for sharing.

## Acceptance criteria
- [ ] Title, description, image per page`,
    labels: [type_('feature'), area('web'), epic('S'), wave(3)],
    deps: ['S-01'],
  },
  {
    id: 'S-05',
    title: '[S-05] robots.txt + crawl rules',
    body: `## Goal
Public pages allowed; settings/onboarding/draft noindex.

## Acceptance criteria
- [ ] robots.txt exists
- [ ] Per-page \`<meta name="robots">\` where appropriate
- [ ] Followers/following pages with crawl-delay`,
    labels: [type_('feature'), area('web'), epic('S'), wave(3)],
    deps: ['S-01'],
  },
  {
    id: 'S-06',
    title: '[S-06] 410 Gone on hard-deleted profiles/content',
    body: `## Goal
After 30-day grace, deleted profiles return 410 (then 404 after 90 days).

## Acceptance criteria
- [ ] Middleware checks deletion state
- [ ] 410 with no body content`,
    labels: [type_('feature'), area('web'), epic('S'), wave(3)],
    deps: ['R-02', 'S-01'],
  },

  // =========================================================================
  // Epic T — Multi-device sync (W3)
  // =========================================================================
  {
    id: 'T-01',
    title: '[T-01] LWW resolution helpers (state changes)',
    body: `## Goal
Last-write-wins for status, position, follow, block, visibility toggle.

## Acceptance criteria
- [ ] Domain helpers resolve concurrent writes
- [ ] Tests for the conflict surface`,
    labels: [type_('feature'), area('domain'), epic('T'), wave(3)],
    deps: ['C-02'],
  },
  {
    id: 'T-02',
    title: '[T-02] 409 conflict response on review/list/profile version mismatch',
    body: `## Goal
Optimistic locking surface with manual merge prompt.

## Acceptance criteria
- [ ] Server returns 409 with current value
- [ ] Client error mapper exposes a typed error`,
    labels: [type_('feature'), area('api'), epic('T'), wave(3)],
    deps: ['B-09', 'D-02'],
  },
  {
    id: 'T-03',
    title: '[T-03] Two-client conflict simulation tests',
    body: `## Goal
Prove LWW vs optimistic-locking behaviors hold under concurrent writes.

## Acceptance criteria
- [ ] Test sequence simulates two clients
- [ ] Asserts deterministic LWW outcome
- [ ] Asserts 409 on review edit conflict`,
    labels: [type_('test'), area('api'), epic('T'), wave(3)],
    deps: ['T-02'],
  },

  // =========================================================================
  // Epic U — Affiliate links (W3)
  // =========================================================================
  {
    id: 'U-01',
    title: '[U-01] URL templater per locale + retailer',
    body: `## Goal
Bookshop, Amazon, Audible, Apple Books URLs from book + locale.

## Acceptance criteria
- [ ] Pure function in \`packages/domain\`
- [ ] Per-locale config (US/UK/etc.)`,
    labels: [type_('feature'), area('domain'), epic('U'), wave(3)],
    deps: ['C-02'],
  },
  {
    id: 'U-02',
    title: '[U-02] Web Book Detail affiliate row',
    body: `## Goal
Buy buttons on every Book Detail page.

## Acceptance criteria
- [ ] Renders configured retailers per locale
- [ ] Tracks click through analytics`,
    labels: [type_('feature'), area('web'), epic('U'), wave(3)],
    deps: ['U-01'],
  },
  {
    id: 'U-03',
    title: '[U-03] Native Book Detail affiliate row',
    body: `## Goal
Native parity.

## Acceptance criteria
- [ ] Apple Books deep link prioritized on iOS`,
    labels: [type_('feature'), area('native'), epic('U'), wave(3)],
    deps: ['U-01'],
  },

  // =========================================================================
  // Epic V — Observability + Ops (W2-W3)
  // =========================================================================
  {
    id: 'V-01',
    title: '[V-01] Sentry init in api, web, native',
    body: `## Goal
Each app initializes Sentry on startup.

## Acceptance criteria
- [ ] DSN read from \`@hone/config-env\`
- [ ] User context populated post-auth`,
    labels: [type_('infra'), area('api'), epic('V'), wave(2)],
    deps: ['A-09'],
  },
  {
    id: 'V-02',
    title: '[V-02] OpenTelemetry-light around tRPC handlers',
    body: `## Goal
Trace span per procedure with attributes.

## Acceptance criteria
- [ ] Span name = procedure path
- [ ] Attributes: viewer id, latency, error type`,
    labels: [type_('infra'), area('api'), epic('V'), wave(2)],
    deps: ['D-03'],
  },
  {
    id: 'V-03',
    title: '[V-03] docs/runbook.md',
    body: `## Goal
Operator doc: deploy, rollback, db migrations, salt rotation, hard-delete cron.

## Acceptance criteria
- [ ] Each runbook section has a "what to check first" subsection
- [ ] Salt rotation procedure documented`,
    labels: [type_('doc'), area('ci'), epic('V'), wave(3)],
    deps: ['A-11'],
  },
  {
    id: 'V-04',
    title: '[V-04] docs/deploy.md',
    body: `## Goal
Production deployment doc: api (Fly/Render), web (Vercel), native (EAS).

## Acceptance criteria
- [ ] Per-platform setup steps
- [ ] CI/CD wiring documented`,
    labels: [type_('doc'), area('ci'), epic('V'), wave(3)],
    deps: ['V-03'],
  },

  // =========================================================================
  // Epic W — Cross-cutting E2E (W4)
  // =========================================================================
  {
    id: 'W-01',
    title: '[W-01] E2E: signup → phone verify → handle → first book → ranking → publish',
    body: `## Goal
Web e2e covering the full activation flow.

## Acceptance criteria
- [ ] Playwright spec under \`apps/web/e2e/\`
- [ ] Asserts feed event published with correct score`,
    labels: [type_('test'), area('web'), epic('W'), wave(4)],
    deps: ['E-11', 'L-09'],
  },
  {
    id: 'W-02',
    title: '[W-02] E2E: import goodreads → conflict resolution → shelves populated',
    body: `## Goal
Web e2e covering import flow.

## Acceptance criteria
- [ ] Uses fixture CSV
- [ ] Conflict bucket interaction asserted`,
    labels: [type_('test'), area('web'), epic('W'), wave(4)],
    deps: ['K-08'],
  },
  {
    id: 'W-03',
    title: '[W-03] E2E: follow → feed → privacy filter',
    body: `## Goal
Web e2e covering follow + feed visibility.

## Acceptance criteria
- [ ] Two-user scenario
- [ ] Asserts mutuals see mutual-only items, non-mutuals do not`,
    labels: [type_('test'), area('web'), epic('W'), wave(4)],
    deps: ['O-03', 'I-01', 'H-04'],
  },
  {
    id: 'W-04',
    title: '[W-04] E2E: delete account → 30-day grace → hard delete + export',
    body: `## Goal
Web e2e covering deletion lifecycle (with mocked time advance).

## Acceptance criteria
- [ ] Asserts public review URL returns 410 after grace
- [ ] Asserts export archive present pre-deletion`,
    labels: [type_('test'), area('web'), epic('W'), wave(4)],
    deps: ['R-02', 'R-03'],
  },

  // =========================================================================
  // Epic Y — Caching infrastructure
  // =========================================================================
  {
    id: 'Y-01',
    title: '[Y-01] @hone/cache: Cache port + in-memory + Redis adapters',
    body: `## Goal
Shared cache abstraction usable by the rate limiter (D-04), rec engine (P-04), and any future cache consumer. Single port; in-memory adapter for dev/test; Redis adapter for prod.

## Acceptance criteria
- [ ] \`packages/cache\` package
- [ ] \`Cache\` port exposes \`get\`, \`set(value, ttlMs)\`, \`del\`, \`mget\`, \`mset\`, \`incr(key, by, ttlMs)\` (incr supports the rate limiter's token-bucket use case)
- [ ] In-memory adapter using a \`Map\` + per-key timeout for TTL
- [ ] Redis adapter using \`ioredis\` with a single shared connection
- [ ] Adapter selection at construction time; no global state
- [ ] Vitest tests cover both adapters; the Redis adapter test uses testcontainers (skipped if Docker unavailable)

## Files
- /home/user/Bookshelf/packages/cache/`,
    labels: [type_('infra'), area('domain'), epic('A'), wave(0)],
    deps: ['A-08'],
  },
  {
    id: 'Y-02',
    title: '[Y-02] Wire @hone/cache into apps/api + config-env',
    body: `## Goal
Add cache configuration to the env schema; expose a singleton \`cache\` instance on the tRPC context so handlers can use it without per-handler wiring. D-04 rate limiter and P-04 rec cache, when their issues are picked up, must consume \`ctx.cache\` rather than ad-hoc in-memory state.

## Acceptance criteria
- [ ] Add \`CACHE_DRIVER\` (\`memory\` | \`redis\`, default \`memory\`) and \`REDIS_URL\` (optional, required when driver=redis) to \`packages/config-env\`
- [ ] Single cache instance constructed at app startup based on \`CACHE_DRIVER\`
- [ ] \`apps/api/src/trpc/context.ts\` exposes \`ctx.cache: Cache\`
- [ ] Integration test: a tRPC procedure reads + writes via \`ctx.cache\`; runs once per driver in the test matrix
- [ ] Document in \`CLAUDE.md\` that any per-user/per-resource cache should use \`ctx.cache\`, never module-scoped \`Map\`s

## Files
- /home/user/Bookshelf/packages/config-env/
- /home/user/Bookshelf/apps/api/src/trpc/`,
    labels: [type_('infra'), area('api'), epic('A'), wave(2)],
    deps: ['Y-01', 'D-01'],
  },
];

export const issuesById: Record<string, IssueDef> = Object.fromEntries(
  issues.map((i) => [i.id, i]),
);
