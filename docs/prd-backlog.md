# Hone PRD Backlog

Working doc tracking decisions made during the PRD grill-me review, defaults
recommended but not yet explicitly confirmed, and remaining open questions in
rough dependency order.

This is a living doc. Update as decisions are made or new branches surface.

## Locked Decisions

### Social Graph

- **Asymmetric follow.** Anyone can follow anyone. No acceptance gate. A
  mutual is when both users follow each other.
- **Per-content visibility (three tiers).** Each shelf, review, and activity
  event carries its own visibility setting:
  - `public` (default for all user-generated content)
  - `mutuals-only` (visible only to users the author follows back)
  - `private` (visible only to the author)
  - The `public` tier is also used for catalog data.
- **Friend discovery — option D.** Handle search, profile share link / QR
  code, iPhone Contacts sync (server-side hashed), and reverse-discovery via a
  passive surface.
- **Reverse-discovery — passive only.** When a new user's hashed contacts
  match an existing user, the existing user sees the new user in
  `People you may know`. No push notifications and no email on match. Push
  notifications for reverse-match are deferred to post-launch.
- **Phone required, gated post-signup.** Signup is one-tap Apple Sign-In,
  Google, or email magic-link. After signup, before reaching the home feed,
  the user must verify a phone number via Twilio Verify (SMS OTP). Phone is
  the contacts-matching key and is on every account.
- **Hard block, no report pipeline.** Blocking severs the follow in both
  directions, removes the blocker from the blocked user's handle search,
  contacts match surface, deep links, and feed. Unblock does not restore the
  prior follow. No structured `Report user` flow in v1 (deferred until ops
  capacity exists to triage reports).

### Catalog

- **Open Library primary, Google Books as fallback.** OL's
  work/edition/author hierarchy maps cleanly onto Hone's `Book` and `Edition`
  domain types. CC0 metadata, free covers API, no rate limits. GB is used as
  a fallback to cover OL's gaps (trigger policy is the active open question;
  see Q8).

## Defaults Pending Approval

These are recommendations stated during the grill but not yet explicitly
confirmed. Treat as the path of least resistance; flag during the next pass
if any should be revisited.

- **Search relevance.** Layered re-ranker on top of OL solr default in Hone's
  API: exact-title boost, exact-author boost, edition-count weight, language
  preference matching user locale, publish-year as tiebreak. Replaceable by
  Postgres FTS or a hosted search engine once query logs justify it.
- **Goodreads import match algorithm.** Normalized ISBN-13 lookup is the
  primary signal: a clean ISBN match goes to `Matched`. Title plus author
  fuzzy match (lowercase, punctuation-stripped, Levenshtein at most 2 on
  title and at most 1 on author surname) goes to `Needs review`. Anything
  below threshold goes to `Unmatched`. The user confirms every `Needs review`
  row before the import commits.
- **Catalog data refresh policy.** First-fetch is canonical. No automatic
  re-sync in v1. Admin-only `Refresh from source` tool for stale records.
- **ISBN normalization.** All ISBNs are canonicalized to ISBN-13 at write
  time. `Edition.isbn10` is retained for display compatibility but every
  lookup, dedup, and import match uses ISBN-13.

## Open Questions

### Active

- **Q8 — Google Books fallback trigger.** ISBN-only fallback / GB fires on OL
  search miss / always parallel. Recommendation: GB fires on OL search miss,
  cache merged result.

### Upcoming, in rough dependency order

- **Q9 — Contacts hashing scheme.** SHA-256 with server-side rotating salt vs
  PHE; retention policy; deletion-on-disable mechanics; international phone
  normalization (E.164).
- **Q10 — Following and follower list visibility.** Public by default (matches
  the per-content default) or different rule for these list surfaces?
- **Q11 — Activity event visibility model.** Per-event setting, or inherited
  from the content the event references (review, shelf item, ranking)?
- **Q12 — Score visibility under public default.** With public default, is the
  user's full ranked list world-visible after the 10-book unlock? Or do
  scores default to mutuals-only even when other content defaults to public?
- **Q13 — Public profile shape for logged-out viewers.** What does an SEO
  crawler or unauthenticated visitor see at `hone.app/u/maya`? Which fields
  render server-side? OpenGraph metadata strategy.
- **Q14 — Home feed shape.** Pure chronological / chronological with
  same-actor grouping / algorithmically ranked by friend trust / two-tab.
- **Q15 — Recommendation surfaces.** Home feed inline / a separate Discover
  tab / Book Detail `friends like this` / all of the above.
- **Q16 — Recommendation algorithm v1.** Concrete SQL function over friend
  overlap, shelf rankings, review sentiment, and reading-status events. Cold
  start handling for users with under 10 ranked books or under 3 mutuals.
  Sentiment classifier choice (lexical vs LLM; PRD says no AI recs but
  sentiment scoring may straddle the line).
- **Q17 — Notifications.** Push vs email vs in-app. Granularity (per-verb,
  per-actor, digest cadence). Default opt-in posture.
- **Q18 — Onboarding flow.** Order of: phone verify, contacts match, first
  books seeded, follow suggestions. Minimum first-N books to show the home
  feed without it feeling empty.
- **Q19 — API contract style.** REST via Hono (current setup) / tRPC /
  GraphQL. Cross-client schema sharing strategy between web, native, and the
  domain package.
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
