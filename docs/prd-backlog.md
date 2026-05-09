# Hone PRD Backlog

Working doc tracking decisions made during the PRD grill-me review, defaults
recommended but not yet explicitly confirmed, and remaining open questions in
rough dependency order.

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
  for reverse-match is deferred to post-launch.
- **Phone required, gated post-signup.** Signup is one-tap Apple Sign-In,
  Google, or email magic-link. After signup, before reaching the home feed,
  the user must verify a phone number via Twilio Verify (SMS OTP). Phone is
  on every account and is the contacts-matching key.
- **Hard block, no report pipeline.** Blocking severs the follow in both
  directions, removes the blocker from the blocked user's handle search,
  contacts match surface, deep links, and feed. Unblock does not restore the
  prior follow. No structured `Report user` flow in v1 (deferred until ops
  capacity exists).

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
its own default (`followers`) and the underlying content's setting. If Maya
marks her review `mutuals`, the feed event tightens to `mutuals` too. Feed
events never loosen above `followers`.

**Block enforcement.** Block applies to every visibility check, every list
render, every search result, and every contacts-match surface. A blocked
user sees nothing of the blocker.

### Catalog

- **Open Library primary, Google Books fallback.** OL's
  work/edition/author hierarchy maps onto Hone's `Book` and `Edition` types.
  CC0 metadata, free covers API, no rate limits.
- **GB fires on OL search miss.** OL search runs first; if zero results or
  all results below the relevance threshold, Hone fans out to Google Books
  and merges. Result cached so the next identical search is free. Typical
  query pays only OL latency; gap queries pay both.

### Contacts Matching

- **Hashing scheme — HMAC-SHA-256 with monthly rotating server salt.**
  Server hashes on receipt; raw phone numbers and emails are never written
  to disk. libphonenumber E.164 normalization on signup phone and on every
  uploaded contact. Master HMAC key in KMS, rotated monthly via scheduled
  job (re-hashes existing user phones with new salt; old salt destroyed).
  Hashed contact rows retained 90 days then re-hashed on next salt rotation.
  Disabling sync deletes user's match-index rows within 24h. Account
  deletion deletes rows where the *target* hash matches the deleted user's
  phone, so the deleted user disappears from everyone's `People you may
  know`. Parallel email-match index uses identical scheme on lowercased,
  trimmed email. Privacy disclosure required at the contacts permission
  prompt and in the privacy policy.

## Defaults Pending Approval

These are recommendations stated during the grill but not yet explicitly
confirmed.

- **Search relevance.** Layered re-ranker over OL solr default in Hone's
  API: exact-title boost, exact-author boost, edition-count weight, language
  preference matching user locale, publish-year as tiebreak. Replaceable by
  Postgres FTS or a hosted search engine once query logs justify it.
- **Goodreads import match algorithm.** Normalized ISBN-13 lookup is the
  primary signal. ISBN match → `Matched`. Title plus author fuzzy match
  (lowercase, punctuation-stripped, Levenshtein ≤ 2 on title and ≤ 1 on
  author surname) → `Needs review`. Below threshold → `Unmatched`. The user
  confirms every `Needs review` row before the import commits.
- **Catalog data refresh policy.** First-fetch is canonical. No automatic
  re-sync in v1. Admin-only `Refresh from source` tool for stale records.
- **ISBN normalization.** All ISBNs canonicalized to ISBN-13 at write time.
  `Edition.isbn10` retained for display compatibility but every lookup,
  dedup, and import match uses ISBN-13.

## Open Questions

### Active

- **Q14 — Home feed shape.** Pure chronological / chronological with
  same-actor grouping / algorithmically ranked by friend trust / two-tab
  Following + For You.

### Upcoming, in rough dependency order

- **Q15 — Recommendation surfaces.** Home feed inline / a separate Discover
  tab / Book Detail `friends like this` / all of the above.
- **Q16 — Recommendation algorithm v1.** Concrete SQL function over friend
  overlap, shelf rankings, review sentiment, and reading-status events.
  Cold start handling for users with under 10 ranked books or under 3
  mutuals. Sentiment classifier choice (lexical vs LLM; PRD says no AI recs
  but sentiment scoring may straddle the line).
- **Q17 — Notifications.** Push vs email vs in-app. Granularity (per-verb,
  per-actor, digest cadence). Default opt-in posture.
- **Q18 — Onboarding flow.** Order of: phone verify, contacts match, first
  books seeded, follow suggestions. Minimum first-N books to show the home
  feed without it feeling empty.
- **Q19 — API contract style.** REST via Hono (current setup) / tRPC /
  GraphQL. Cross-client schema sharing strategy between web, native, and
  the domain package.
- **Q20 — Account deletion.** Soft delete vs hard delete. Disposition of
  public reviews and historical feed events authored by a deleted account.
- **Q21 — Web public pages SEO.** Indexable URL structure, canonical paths,
  OpenGraph metadata, robots policy. What does Google index?
- **Q22 — Goodreads import idempotency.** Re-uploading the same CSV — dedupe
  by row hash / by ISBN plus status / always prompt user before merging.
- **Q23 — Multi-device conflict semantics.** Two clients change the same
  book's status concurrently. Last-write-wins, vector clock, or per-field
  merge?
- **Q24 — Score recalculation propagation.** When a user's rank order shifts
  after a new ranking, do historical feed events update their score badge to
  the latest score, or stay frozen at publish time?

## V2 / Deferred

- AI-driven recommendations.
- Push notification for reverse-discovery contact matches.
- Structured `Report user` flow plus admin review queue.
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
