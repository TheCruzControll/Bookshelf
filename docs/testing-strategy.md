# Hone Testing Strategy

## Goal

Verify Hone v1 functionality without manual click-through. Every locked
behavior in `docs/prd-backlog.md`, `docs/product-spec.md`,
`docs/ranking-flow-spec.md`, and `docs/search-add-flow-spec.md` should be
covered by an automated test that fails when the behavior breaks.

The Tester agent runs all of this on every PR; auto-merge is gated on a
green Tester check.

## Test pyramid

```
         /\
        /  \      end-to-end (~30 tests)        Playwright (web), Maestro (native)
       /----\
      /      \    integration (~150 tests)      Vitest + supertest + testcontainers
     /--------\
    /          \  unit (~600+ tests)            Vitest, fast-check
   /------------\
```

Numbers are targets at v1 launch, not floors. Some features (privacy
filter, ranking math) lean heavily on unit + property tests; others
(onboarding, import) lean heavily on integration + e2e.

## Test types by layer

### Unit tests (~600+)

**Where they live:** colocated `*.test.ts` next to the unit they cover.

| Package | Targets | Framework |
|---|---|---|
| `packages/domain` | pure functions (visibility filter, ranking math, ISBN normalization, feed grouping), services with stubbed ports, schemas, `Depends on:` parser | Vitest + fast-check |
| `packages/db` | mappers (row → domain), pure SQL builders, ISBN-13 helpers | Vitest |
| `apps/api` | tRPC procedure handlers with mocked services, error mapping middleware, rate-limit logic | Vitest |
| `apps/web` | React components rendered in isolation, hooks, utils | Vitest + @testing-library/react |
| `apps/native` | React Native components, hooks, util modules | Vitest with `jsdom` env or `@testing-library/react-native` |

**Property-based tests (fast-check):**
- Visibility filter (implemented in `packages/domain/src/visibility.ts`): for any (viewer, target, content_visibility), the filter result is consistent with the Posture C access matrix; all four visibility tiers and all viewer relationships verified.
- Block enforcement: blocked users never appear in any query result, regardless of input shape.
- Ranking binary insertion: monotonic — inserting N books with deterministic comparisons produces the same ordering as a reference quicksort over the comparison oracle.
- ISBN normalization: idempotent — `normalize(normalize(x)) == normalize(x)`; ISBN-10 and ISBN-13 forms of the same edition map to the same canonical key.
- HMAC contact hashing: same input + same salt version = same hash; different salt versions = different hash.
- Feed grouping: same-actor + same-verb events within a 30-min window collapse to one card; different verbs stay separate.
- Score derivation from rank order: monotonic in rank position, bounded `[0, 10]`, never negative, never NaN.

### Integration tests (~150)

**Where they live:** `apps/api/src/**/*.integration.test.ts` and `packages/db/src/**/*.integration.test.ts`.

Spin up a real Postgres via testcontainers (or the CI service container).
Run migrations. Hit tRPC procedures via the in-process tRPC caller (no
HTTP layer required for most). Use real repositories.

**Coverage targets:**

- Every tRPC procedure: at least one happy-path test, at least one
  authorization-failure test (no session, blocked user, insufficient
  visibility), at least one validation-failure test.
- Every domain service: tests against real repositories with seeded data.
- Every privacy enforcement path: happy + every visibility tier × every
  viewer relationship.
- Every state transition (status change, rerank, dropped→finished, etc.)
  per `docs/ranking-flow-spec.md`.
- Goodreads import: 5 fixture CSVs covering matched / needs-review /
  unmatched / conflict / re-upload merge paths.
- Catalog: nock-recorded fixtures for OL hit, OL miss + GB hit, OL+GB
  miss, malformed responses.
- Contacts: hash + match + salt rotation + deletion-on-account-delete.
- Account deletion: soft → grace expiry → hard delete + GDPR export
  archive contents.
- Feed: chronological ordering, grouping window edges (29 min, 30 min,
  31 min), visibility filtering across viewer relationships.
- Recommendations: scoring monotonicity, cold-start ladder fallback,
  cache hit/miss.
- Multi-device conflict: two clients editing a review concurrently
  trigger a 409; LWW state changes succeed regardless of order.

### End-to-end tests (~30)

**Web (Playwright) — `apps/web/e2e/*.spec.ts`:**

Smoke flows that exercise the full stack against a deployed-locally
Next.js + Hono + Postgres (docker compose).

1. Sign up via email magic-link → handle setup → home feed renders.
2. Sign up → phone verify → handle → first book add → ranking flow → score appears.
3. Sign up → import Goodreads CSV → review conflicts → confirm → shelves populated.
4. Logged-out visitor browses public profile → sees taste portfolio, not Want-to-Read.
5. Logged-out visitor on `/u/maya` after handle rename → 301 redirects to new handle.
6. Block flow: A blocks B → B can't see A's profile, search, feed events.
7. Follow flow: A follows B → A's feed shows B's finished events; mutuals see mutual-only items.
8. Privacy flow: change a review from public to mutuals-only → stranger sees `not available`, mutual still sees content.
9. Rerank flow: re-rank a finished book → new feed event, old event retains frozen score.
10. Account deletion: request → 30-day grace → cancellation works; full hard-delete on second account works (with mocked time advance).
11. List flow: create user list → publish → followed by other user → list update creates discovery surface change.
12. Discover tab: at least one rec card with reason label per signal type.
13. SEO smoke: book detail page returns 200 with OpenGraph + canonical URL.
14. Sitemap: `/sitemap.xml` lists profile, book, list URLs.
15. Hard-deleted profile URL returns 410 Gone.

**Native (Maestro) — `apps/native/e2e/*.yaml`:**

Maestro is the recommended mobile e2e tool — declarative YAML flows that
work on both iOS simulator and Android emulator.

1. Cold launch → onboarding signup → handle → feed render.
2. Search → add book → ranking flow → finished + score visible.
3. Camera ISBN scan (simulator-mocked) → match → add to shelf.
4. Pull-to-refresh on feed → new events appear.
5. Tap profile → followers list → tap user → follow → mutual badge appears.
6. Open Discover tab → tap rec → land on book detail → "you might also like" rail.
7. Goodreads import via file picker → review screen → confirm → shelves populated.

**Test isolation:**
- Each e2e test runs against a fresh DB seeded only with the data it
  needs. Test parallelism is bounded by Postgres connection pool.
- Use a dedicated test user pool — every test acquires a fresh user from
  the pool, runs, releases.

## Tooling

| Layer | Framework | Why |
|---|---|---|
| Unit (TS) | Vitest | Fast, ESM-native, jest-compatible API, native TS |
| Property | fast-check | Generators + shrinking |
| Integration (TS) | Vitest + testcontainers + supertest | Real Postgres, real HTTP if needed |
| Web e2e | Playwright | Multi-browser, fast, great traces |
| Native e2e | Maestro | Cross-platform mobile, YAML-declarative |
| Mocks | nock (HTTP), msw (fetch) | Replay recorded provider responses |
| Test data | Custom factories in `packages/test-fixtures` | Type-safe, composable |

## Test data strategy

A new package `packages/test-fixtures` (issue WX-01 below) exports:

- **Factories** — `makeProfile()`, `makeBook()`, `makeRanking()`, etc. Each accepts a partial override; defaults are realistic and parameterized.
- **Seed scenes** — composed scenarios like `seedFollowGraph({ users: 5, mutualPairs: 3 })`, `seedCatalog({ books: 100, withCovers: true })`, `seedRankingState({ user, ranks: 15 })`.
- **Recorded HTTP fixtures** — `fixtures/openlibrary/*.json`, `fixtures/google-books/*.json`, `fixtures/goodreads/*.csv` — used by nock and CSV import tests.
- **Time control** — `useFakeTimers()` helpers that work around the 30-day deletion grace, score-unlock-at-10, salt-rotation-monthly, and feed-grouping-30-min windows without waiting in real time.

## Coverage expectations

- `packages/domain`: 90%+ line coverage. The pure-logic core must be
  near-completely tested.
- `packages/db`: 80%+ line coverage. Mappers and SQL builders covered;
  raw migration files exempt.
- `apps/api`: 80%+ line coverage. Every tRPC procedure has a happy + a
  failure path test.
- `apps/web` and `apps/native`: 60%+ component-level. UI snapshots are
  brittle and not counted; logic in hooks and utils is.

Coverage measured via `vitest --coverage` (c8). Thresholds enforced in
`vitest.config.ts`. CI fails if coverage drops below thresholds.

Coverage is a guard, not a goal — the listed property and integration
scenarios must all exist regardless of whether coverage is "high enough."

## CI integration

The Tester runs only the tests *associated with the files changed in the
PR*, not the full suite. Two layers of narrowing combine:

1. **Turbo filter** — `pnpm turbo run test --filter=...[origin/<base>]`
   limits to packages whose dependency graph is touched by the diff. The
   `...` prefix includes dependents, so a change to `packages/domain`
   pulls in `apps/api`, `apps/web`, and `apps/native` automatically.
2. **Vitest `--changed`** — within each filtered package, Vitest restricts
   to test files whose source files appear in the diff. A package with
   one changed source file runs only that source's associated tests.

This means a typical PR that touches one file in `packages/domain` runs:
- Typecheck on `packages/domain`, `apps/api`, `apps/web`, `apps/native` (transitive).
- Lint on the same set.
- Tests on only the test file colocated with the changed source.

A PR that touches `tools/orchestrator/labels.json` runs nothing
(no test associations) and the Tester check passes trivially. A PR that
touches the root `tsconfig.base.json` runs everything (every package
depends on root config).

| Check | Scope | Auto-merge gate? |
|---|---|---|
| `agent-tester` typecheck (affected) | turbo-filtered packages | yes |
| `agent-tester` lint (affected, skipped doc-only) | turbo-filtered packages | yes |
| `agent-tester` test (affected, `--changed`) | filtered packages × diff-related test files | yes |
| `agent-tester` web e2e | every PR touching `apps/web`, `packages/domain`, or `apps/api` (path-filtered) | yes |
| `agent-tester` native e2e | nightly + manual dispatch | no — too slow for per-PR |
| Coverage threshold | reported on full-suite nightly run | not per-PR; nightly only |
| Snapshot tests | run with affected unit tests | yes |

The Tester PR comment lists which test files actually executed, so
reviewers can confirm coverage of the change. If a PR's diff has no
associated tests (e.g. a new module without tests), the comment surfaces
that explicitly — and the Reviewer flags it as a missing-test gap.

Doc-only PRs skip lint+test entirely (typecheck only, also affected-only).
Path detection happens in the workflow's first step.

**Full-suite runs:** scheduled nightly to catch drift the per-PR filter
might miss (e.g. a transitive type break that turbo's affected detection
underestimates). Failures open an issue labeled `priority:p0` for the
next Implementer dispatch.

## Test scenarios catalog

### Auth & onboarding

- Apple Sign-In with valid token → session created, profile linked.
- Apple Sign-In with expired token → 401, no session.
- Google Sign-In with valid id_token → session created.
- Email magic-link sent + redeemed → session created.
- Magic-link expired → 410, prompt re-send.
- Phone verify happy path: start → confirm with correct code → home feed unlocked.
- Phone verify wrong code 3x → rate-limited, error surfaced.
- Phone verify SMS pumping protection: 5 starts in 1 minute → 429.
- Handle reservation: collision → 409, suggested alternatives returned.
- Handle reserved-list (admin, root, etc.) → rejected.
- Profile creation: `profile.createProfile` auto-seeds four system shelves (Reading `followers`, Want to Read `followers`, Finished `public`, Dropped `followers`) with correct PRD visibility defaults; idempotent on repeated calls.
- Onboarding skip-all path → home feed renders algorithmic + editorial lists.
- First-book optional: skip → no `Add a book` blocker; complete → ranking flow follows.

### Catalog

- OL search returns ≥1 result → re-ranker applies title/author boost; result ordering verified.
- OL search returns 0 results + GB has match → GB result merged + cached.
- OL+GB both return 0 → empty result set + create-manual prompt.
- ISBN-10 lookup → normalized to ISBN-13 → finds same edition as ISBN-13 lookup.
- Edition merge: two ISBN variants of the same work merge to one Book.
- Manual book create → minimal title+author → record persisted with `source: manual`.

### Search/Add

- Search by exact title → top result is the exact match.
- Search by author → results filtered to author.
- Search by ISBN → single result matching that edition.
- Add to shelf preserves edition selection.
- Duplicate add (same book, same status) → idempotent (no duplicate row).
- Add `Finished` → triggers ranking flow start.
- Add `Dropped` → triggers dropped-reason flow start.
- Cancel ranking flow mid-way → no `Finished` state, no feed event published.

### Ranking

- 1-star bucket → comparisons against bottom-rank books.
- 5-star bucket → comparisons against top-rank books.
- Binary insertion converges to position in O(log N) comparisons.
- Score derivation monotonic in rank position.
- Score-unlock at 10 books: 9 ranked → score hidden, 10th → unlocks system-wide.
- Rerank flow: rank shifts; new feed event publishes with new score; old event retains frozen score.
- Dropped → Finished: full ranking flow runs from scratch.
- Finished → Dropped: book removed from active rank order; historical event annotated `Later marked dropped`.

### Reviews

- Create review with text → persisted.
- Edit review → version increments; concurrent edit → 409.
- Delete review → removed from feed, profile.
- Visibility tighten: review marked `mutuals` → stranger sees nothing.

### Privacy & blocks

- Visibility matrix tests (4 viewer × 4 visibility) for every content type.
- Blocked user: search by handle → not found; deep link → 404.
- Blocked user: feed event from blocker → not delivered.
- Block survives account deletion of blocker for 90 days.
- Re-signup after delete with same phone → blocks re-trigger.

### Follow graph

- Follow / unfollow idempotent.
- Mutual derivation: A follows B + B follows A → mutual=true.
- Block on existing follow severs both directions.
- Unblock does not auto-restore follow.

### Contacts

- Upload contacts → server hashes → match returns existing users with phone.
- Salt rotation: new salt generated → existing user phones re-hashed → old hashes purged.
- Deletion: disable contacts sync → user's index rows deleted within 24h.
- Account deletion → rows targeting deleted user's phone deleted.
- Email-index parallel pipeline: lowercased + trimmed match works.

### Goodreads import

- 5 fixture CSVs → matched/needs-review/unmatched/conflict buckets correct.
- Re-upload same CSV → prompt; choose `merge changes only` → new + status-changed only.
- Conflict: Goodreads `read` vs Hone `dropped` → conflict bucket; user keeps Hone state by default.
- Idempotency hash → recognizes same file across uploads.

### Feed

- Chronological order verified.
- Grouping: same actor + same verb in 30-min window → 1 card.
- Window edge: 30:01 since prior event → separate card.
- Different verbs in window → separate cards.
- Cursor pagination at group boundaries — never splits a group.
- Visibility + block filtering applied per item.

### Recommendations

- Heuristic scorer: each signal contributes correctly to the final score.
- Reason picker: dominant signal returns the matching reason string.
- Cold start: <3 mutuals → "popular reads to get you started" path.
- Cache: identical query within 5 min returns cached recs.
- People-you-may-know: contacts-match + 2nd-degree follow surface.
- Discover tab returns at least N recs given seed data.
- Book Detail "you might also like" returns ≥5 recs given enough data.

### Notifications

- Push fires for direct social events only.
- Cap: 6th push in 24h → not sent.
- Quiet hours: push during 11pm local → suppressed.
- In-app notifications surface includes events that didn't fire push.
- Settings change: toggle off "mutual finishes book" → no push for that trigger.
- Per-actor mute → no push from that user.

### Lists

- Create user list → public default, mutuals override.
- Editorial list: only verified accounts can publish.
- Algorithmic lists: each of 5 launch queries returns expected shape.
- Follow a list → updates appear on Discover.
- List item add → followers see updated list.

### Account deletion

- Soft delete: profile invisible immediately to other users.
- Grace recovery: sign back in within 30 days → full restore.
- Hard delete after 30 days: profile, reviews, lists, feed events removed.
- Public review URL after hard delete → 410 Gone.
- GDPR export: archive contains profile + reviews + shelves + activity in JSON/CSV.
- Blocks-against-hash retention: still applied to fresh signup with same phone for 90 days.

### SEO + handle URLs

- `/u/{handle}` returns 200 with full RSC render.
- Handle rename → old URL 301 to new.
- Sitemap includes profile, book, list URLs.
- OpenGraph metadata present + valid.
- robots.txt: settings/draft/onboarding `noindex`.
- Hard-deleted profile → 410.

### Multi-device

- LWW: status change from device A wins over earlier change from device B.
- Optimistic locking: review edit from B with stale version → 409.
- Offline queue: actions during airplane mode replay in order on reconnect.

### Affiliate links

- URL templater builds correct affiliate URL for each program.
- Locale routing: US user → Bookshop.org US; UK user → Bookshop.org UK.

## DAG additions

The following issues should be added to the v1 DAG (extending Epic A and
adding Epic X for tests):

- A-04 already covers Vitest scaffolding for api/domain/db.
- **A-20** [W0] `type:infra area:ci` — `packages/test-fixtures`: factory + seed scene + HTTP fixture pkg. Deps: A-04.
- **A-21** [W0] `type:infra area:ci` — Playwright setup in `apps/web/e2e/` with docker-compose-driven backend; CI workflow path-filtered. Deps: A-06.
- **A-22** [W0] `type:infra area:native` — Maestro setup in `apps/native/e2e/` with iOS simulator on macOS runner; nightly schedule. Deps: A-04.
- **A-23** [W0] `type:infra area:ci` — `vitest.config.ts` coverage thresholds (90/80/80/60). Deps: A-04.
- **X-01..X-30** [W3-W4] `type:test area:*` — one issue per scenario family above (auth, catalog, ranking, privacy, feed, recs, lists, deletion, SEO, multi-device). Deps: feature epics they cover.

## Verification

The testing strategy itself is verified by:

1. Run `pnpm test` from the root after Wave 0 — coverage report exists, baseline tests pass.
2. After Wave 1 — visibility filter property tests run on every PR.
3. After Wave 3 — at least one e2e test per feature epic exists.
4. Tester agent's check on a real PR shows typecheck + lint + unit + integration green.
5. Coverage threshold violation produces a failed Tester check.
6. A scenario from this catalog can be removed and an automated test for it confirms the behavior break.

## What this strategy does NOT cover

- Manual exploratory QA — recommended pre-launch but not automated.
- Performance / load testing — deferred to v1.5 when usage data informs targets.
- Visual regression on screenshots — deferred; UI snapshot tests cover structure but not pixel-level rendering.
- Penetration / security testing — separate engagement, not in this doc.
- Accessibility audit — separate effort using axe-core; v1 scope is "no critical violations."
