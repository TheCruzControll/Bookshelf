# Hone PRD Backlog

Working doc tracking decisions made during the PRD grill-me review, defaults
recommended but not yet explicitly confirmed, and remaining open questions.

This is a living doc. Update as decisions are made or new branches surface.

## Locked Decisions

### Social Graph

- **Asymmetric follow.** Anyone can follow anyone. No acceptance gate. A
  mutual is when both users follow each other.
- **Friend discovery — option D.** Handle search, profile share link / QR
  code, iPhone Contacts sync (server-side hashed), and reverse-discovery via
  a passive `People you may know` surface.
- **Reverse-discovery — passive only.** When a new user's hashed contacts
  match an existing user, the existing user sees the new user in
  `People you may know`. No push notifications and no email on match. Push
  for reverse-match deferred to post-launch.
- **Phone required, gated post-signup.** Signup is one-tap Apple Sign-In,
  Google, or email magic-link. After signup, before reaching the home feed,
  the user must verify a phone number via Twilio Verify (SMS OTP). Phone is
  on every account and is the contacts-matching key.
- **Hard block, no report pipeline.** Blocking severs the follow in both
  directions, removes the blocker from the blocked user's handle search,
  contacts match surface, deep links, and feed. Unblock does not restore the
  prior follow. No structured `Report user` flow in v1.

### Privacy Model — Posture C

Posture C: **discoverable portfolio + intimate stream.** A stranger sees
Maya's static taste portfolio (reviews, scores, ranked list, finished shelf,
public custom shelves). Live reading state and the activity stream are
delivered only to followers. Mutuals see whatever Maya has gated to mutuals.

**Four visibility tiers per item:**

- `public` — anyone, including logged-out web and Google
- `followers` — anyone who follows Maya
- `mutuals` — people Maya follows back
- `private` — only Maya

**Default visibility per content type:**

| Thing | Default |
|---|---|
| Identity (handle, name, bio, avatar) | `public` |
| Follower & following counts | `public` |
| Follower list, following list | `public` |
| Reviews | `public` |
| Scores on ranked books | `public` |
| Finished shelf | `public` |
| Custom shelves | `public` (per-shelf override at creation) |
| Want-to-Read shelf | `followers` |
| Reading shelf (in-progress) | `followers` |
| Dropped shelf | `followers` |
| Current reading status (specific book) | `followers` |
| Activity stream (feed events) | `followers` (never on the public profile) |

**Inheritance rule.** A feed event's effective visibility is the *tighter* of
its own default (`followers`) and the underlying content's setting. Feed
events never loosen above `followers`.

**Block enforcement.** Block applies to every visibility check, every list
render, every search result, and every contacts-match surface.

### Catalog

- **Open Library primary, Google Books fallback.** OL's
  work/edition/author hierarchy maps onto Hone's `Book` and `Edition` types.
  CC0 metadata, free covers API, no rate limits.
- **GB fires on OL search miss.** OL search runs first; if zero results or
  all results below the relevance threshold, Hone fans out to Google Books
  and merges. Result cached so the next identical search is free.

### Contacts Matching

- **HMAC-SHA-256 with monthly rotating server salt.** Server hashes on
  receipt; raw values never written to disk. libphonenumber E.164
  normalization on signup phone and on every uploaded contact. KMS-managed
  HMAC key, rotated monthly via scheduled job. Hashed contact rows retained
  90 days, re-hashed on next salt rotation. Disabling sync deletes user's
  match-index rows within 24h. Account deletion deletes rows where the
  *target* hash matches the deleted user's phone. Parallel email-match index
  uses identical scheme on lowercased, trimmed email.

### Feed

- **Shape: chronological with grouping.** Newest first. Same actor + same
  verb-family within a 30-minute window collapses into one card
  ("Maya finished 3 books"). Different verbs stay separate even when
  back-to-back.
- **Source: pure social.** Activity from people you follow, gated by
  visibility rules. No recommendations interleaved (per monetization
  principles — see `monetization-strategy.md`).
- **Group cursor pagination.** Cursor lands on group boundaries; never
  paginates inside a group.
- **Tunable.** 30-minute group window is the v1 starting point; adjust on
  real engagement data post-launch.

### Recommendations

- **Three rec types in v1:** books, people-to-follow, lists.
- **Surfaces:** Discover tab + Book Detail "you might also like" carousel.
  Never in the home feed.
- **Algorithm shape: heuristic weighted-sum.** Signals: mutual-finished
  count, mutual average score, taste-overlap (cosine similarity on shared
  ranked books), genre match, recency, popularity floor. Each rec carries a
  one-line "why this?" picked from the dominant signal.
- **Cold start fallback.** Users with under 3 mutuals or under 10 ranked
  books see "popular reads to get you started" sourced from
  popularity-on-Hone → editorial picks → global Open Library popularity.
- **Refresh cadence.** Computed on-read with 5-minute per-(user, surface)
  cache.
- **Implementation freedom.** Not SQL-bound; offline jobs, caches, in-memory
  structures all permitted. Constraints kept from PRD: explainable, no
  AI/ML in v1.
- **Sentiment.** Use score on ranked book as sentiment proxy; do not parse
  review text.

### Lists

- **Data model: lists are custom shelves with extra fields.** Single `Shelf`
  entity with added fields: `description`, `kind` (system | custom | list),
  `author_type` (user | internal_editorial | algorithmic), `curator_tier`,
  `published_at`. `ShelfItem` gets `notes` for per-book commentary.
- **Authorship types at launch:** user, internal editorial, algorithmic.
  External curators deferred to v1.5.
- **Internal editorial:** Hone team uses regular list-creation flow with a
  `verified` badge. Day 1 needs ~5–10 published editorial lists; ongoing
  weekly cadence minimum.
- **Algorithmic lists:** hand-written SQL queries refreshed on schedule.
  v1 set: "Trending in Your Circle," "New on Hone," "Highly Ranked This
  Month," "Popular in Your Top Genre," "What Your Mutuals Are Reading Right
  Now." Cold-start fallback: "Trending in Your Circle" with no mutuals
  shows "Trending on Hone" instead.
- **Discovery parity.** Editorial and algorithmic lists do not auto-rank
  higher than user lists in Discover. Quality + follower counts drive
  ranking.
- **Following a list = watch for updates.** Follower sees the list update
  on Discover (badge) and (eventually) in their notifications surface
  (Q17/Q18 notifications spec). No "snapshot" / "save" alternative in v1.

### Onboarding

Required order:

1. Apple/Google/email signup
2. Phone verify (SMS OTP)
3. Handle + display name
4. *(Optional)* Add first book OR Goodreads CSV import — both skippable
5. *(Optional)* Contacts permission + immediate match surfacing
6. *(Optional)* Follow suggestions
7. *(Optional)* Notifications permission, soft-prompt-first
8. Home feed

- Empty home feed (user skipped first book + follow suggestions) renders
  algorithmic + editorial lists as the cold-start surface.
- Notifications permission: don't trigger the iOS dialog on step 7
  directly. Show a soft in-app prompt; only call the OS dialog after a soft
  yes.

### Notifications

- **Push posture: minimal.** Push fires only for direct-social events:
  new follower, mutual follows back, mutual rates a book 8+, mutual
  finishes a book on user's Want-to-Read shelf, security/account events.
- **Caps.** 5 pushes per recipient per day max; 3 pushes per source actor
  per day max. Quiet hours 10pm–8am local time, security exempt.
- **In-app notifications surface.** Bell icon / nav tab shows everything
  regardless of push status — muting push doesn't lose data.
- **Email.** Transactional only in v1 (signup verify, password reset,
  security alerts). No digest emails.
- **Customization.** In-app settings panel allows per-trigger toggle,
  per-channel choice (in-app vs push), configurable quiet hours, and a
  master pause-all toggle. Per-actor and per-list mute lives on the
  actor/list itself, not in the settings panel.

### API Contract

- **tRPC end-to-end.** TypeScript-only contract, types flow from server to
  client by import. No schema files, no codegen.
- **Hono backend.** tRPC handler mounted via Hono adapter. Existing zod
  validators reused as tRPC input schemas.
- **Shared types in `@hone/domain`.** Input/output schemas live alongside
  domain types so all clients import from one place.
- **REST exposure path reserved.** If a non-TypeScript client (third-party
  API, data team) becomes necessary, a REST adapter layer can be added on
  top of the same handlers without rewriting the API.

### Account Deletion

- **30-day soft delete grace, then hard delete.** User can recover by
  signing back in within 30 days. After 30 days, all personal data is
  permanently erased.
- **Per-asset disposition after grace:**
  - Public reviews: removed; URLs return HTTP 410 (Gone), then 404 after
    90 days once de-indexing confirmed.
  - Feed events: removed from all followers' feeds.
  - Lists authored by user: removed; followers see "this list is no longer
    available."
  - Ranking signals: pulled from rec engine; other users' recs recalculate
    organically.
  - Following / followers relationships: removed both sides.
  - Blocks user placed: removed.
  - Blocks placed *against* user: retained 90 days against hashed phone;
    re-signups with the same number re-trigger blocks.
  - Hashed contacts: deleted within 24h of soft-delete trigger.
- **GDPR data export.** Available on request before deletion. CSV/JSON of
  all personal data.
- **Re-signup with same identifier inside grace = recovery.** Outside grace
  = fresh account, no content carry-over.

### Public URLs and SEO

- **Handle-based URLs:** `hone.app/u/maya` (profile),
  `hone.app/u/maya/lists/best-sci-fi-2024` (list),
  `hone.app/book/the-way-of-kings-12345` (book).
- **301 redirect on handle rename.** Historical handles tracked and
  redirected to current; redirect retained for several years.
- **Rendering.** Next.js RSC / ISR for all public pages. Static where
  possible, revalidate on data change.
- **OpenGraph metadata.** Profile: `title="<name> on Hone"`, description =
  bio truncated, image = avatar. Book: title, description, cover. List:
  title, description, hero image (first book cover or curated).
- **Canonical URLs.** Slug-id pattern (`/book/the-way-of-kings-12345`)
  survives title or handle changes.
- **Sitemap.** Auto-generated daily; submitted to Google Search Console.
  Includes every public profile, every cached book, every public list.
- **robots.** Profile / book / list pages indexable. Settings, account,
  draft, search-result, onboarding pages `noindex`. Following / follower
  list pages allowed but with crawl-delay against scraper-driven load.
- **Locale.** v1 ships English-only. URLs unlocalized. Locale prefix added
  when v2 launches a second language.

### Goodreads Import Idempotency

- **D + C combination.** On upload, hash the CSV and compare against the
  user's previous import-job hashes. If a match is found, modal asks the
  user to choose:
  - **Process from scratch** — full review queue, all rows.
  - **Merge changes only** — only books not previously imported, plus any
    books whose Goodreads status differs from current Hone status, hit the
    review queue.
  - **Cancel.**
- **Conflict bucket.** State mismatches (e.g., Goodreads `read` for a book
  Hone has as `dropped`) appear in a `Conflict` bucket alongside
  `Matched` / `Needs review` / `Unmatched`. Default action: keep Hone
  state, ignore CSV value. User can override.

### Multi-Device Conflict Resolution

- **Hybrid: LWW for state, optimistic locking for authored content.**
  Status changes, shelf moves, follows, blocks, visibility toggles, and
  ranking-flow saves: last-write-wins. Review text edits, list description
  edits, profile field edits: optimistic locking with version numbers; 409
  on mismatch triggers manual merge prompt.
- **Offline.** v1: simple offline queue on iPhone. Actions queued during
  airplane mode; replay on reconnect; same conflict rules apply.
- **No realtime cross-device sync in v1.** No websockets. Refresh on app
  foreground / pull-to-refresh.

### Genre Data

- **Source:** OL `subjects` and GB `categories`, mapped through a
  Hone-owned static mapping table to a controlled vocabulary of ~30
  canonical genres (e.g. `Fiction`, `Sci-Fi`, `Fantasy`, `Romance`,
  `Mystery`, `Horror`, `Literary Fiction`, `History`, `Biography`).
  The mapping table is seeded from the top OL subjects + GB categories
  in the catalog snapshot and grows over time. Books that don't map to
  anything get the `Uncategorized` placeholder.
- **No hard cap on genres per book.** A book carries every canonical
  genre it maps to. In practice most books end up with 2–4 genres
  because the mapping table collapses noisy near-duplicates.
- **Normalized contribution in recommendation math.** Each genre signal
  is weighted `1/N` where N = the book's total genre count, so
  multi-genre books participate in more signals but weaker each, and
  cannot single-handedly dominate any one taste profile.
- **Primary genre.** Each mapping rule carries a confidence weight; a
  book's primary genre is the one with the highest mapping confidence.
  Used for "Popular in Your Top Genre" algorithmic list and as the
  first-priority signal in ranking candidate selection.
- **User's top genre = the most frequent primary genre across the
  user's finished books.**

### Score Derivation (formula and ties)

- **V1 formula: bucket-anchored linear interpolation.** Each star bucket
  maps to a fixed score band (1★ → 0.00–2.00 ... 5★ → 8.00–10.00). Books
  inside a band are evenly spaced by rank position within the band. See
  `docs/ranking-flow-spec.md` for the precise rule.
- **Crossover allowed.** If comparisons push a book above the top of its
  starting band, it crosses into the next band and is scored there. The
  starting star is an anchor, not a hard cap.
- **Comparison UI: 3 outcomes.** Left wins, right wins, can't decide.
- **`Can't decide` triggers one disambiguation attempt** against a
  different candidate from the same bucket and approximate position. If
  still undecided, the new book is placed at a tied rank with the most
  recent comparison candidate; both share the same derived score. Future
  ranking flows on either tied book can naturally break the tie.

### Score Recalculation Propagation

- **Frozen at publish time on feed events.** Feed event row stores
  `score_at_publish` and `score_locked_at_publish`. Subsequent rank shifts
  do not mutate past feed events.
- **Profile remains live.** Ranked list on the profile shows current
  score; this is independent of any historical feed event.
- **Mental model.** Feed = "what happened then." Profile = "what's true
  now."
- **Explicit rerank/rereview events** (per ranking spec) publish a NEW
  feed event with the new score; old event retains its frozen score.

## Defaults Pending Approval

These are recommendations stated during the grill but not yet explicitly
confirmed.

- **Search relevance.** Layered re-ranker over OL solr default in Hone's
  API: exact-title boost, exact-author boost, edition-count weight,
  language preference matching user locale, publish-year as tiebreak.
  Replaceable by Postgres FTS or a hosted search engine once query logs
  justify it.
- **Goodreads import match algorithm.** Normalized ISBN-13 lookup is the
  primary signal. ISBN match → `Matched`. Title plus author fuzzy match
  (lowercase, punctuation-stripped, Levenshtein ≤ 2 on title and ≤ 1 on
  author surname) → `Needs review`. Below threshold → `Unmatched`. The
  user confirms every `Needs review` row before the import commits.
- **Catalog data refresh policy.** First-fetch is canonical. No automatic
  re-sync in v1. Admin-only `Refresh from source` tool for stale records.
- **ISBN normalization.** All ISBNs canonicalized to ISBN-13 at write
  time. `Edition.isbn10` retained for display compatibility but every
  lookup, dedup, and import match uses ISBN-13.
- **Cold-start rec ladder.** Popular-on-Hone → editorial picks → global
  Open Library popularity. Recs surface labeled "Popular reads to get you
  started" rather than "Mutuals loved this."
- **Editorial cadence.** Day 1 needs 5–10 published editorial lists; weekly
  publishing minimum thereafter.

## Open Questions

None remaining from the original PRD grill backlog. Rec-system specifics
(exact weights, signal tuning, algorithmic-list query SQL) are
implementation-level rather than PRD-level decisions.

## V2 / Deferred

- AI-driven recommendations.
- Item-item collaborative filtering layered over the heuristic rec engine
  once user-book ranking data accumulates.
- Push notification for reverse-discovery contact matches.
- Structured `Report user` flow plus admin review queue.
- External curator program (application + verification + contracts +
  payouts).
- Manual rank reorder for taste ranking.
- Draft and recovery flow for interrupted Finished or rerank flows.
- Previous-score diff display in feed and Book Detail.
- Comments and reactions on feed items.
- Direct messages.
- Advanced confidence modeling on ranking.
- Advanced genre weighting beyond candidate selection.
- Server-side automatic catalog re-sync.
- Outsourced or self-hosted search engine (Algolia, MeiliSearch, Typesense)
  once query logs justify upgrading from OL solr plus the in-app re-ranker.
- Realtime cross-device sync (websockets / SSE).
- Internationalization: locale prefix on URLs, translated UI, locale-aware
  affiliate routing.
- Rec digest emails / push.
- Web-based Hone Pro purchase flow (after iOS subscription rollout).
