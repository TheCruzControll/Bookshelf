# Hone Search/Add Flow V1 Spec

## Summary

Search/Add is the entry point for turning a book into user taste data. It supports quick search, ISBN scan/manual ISBN lookup, and Goodreads CSV import. The flow must stay fast for casual users while still handling power-reader imports without polluting the feed or taste profile with unfinished data.

## Entry Points

- Mobile bottom nav `Add`
- Web nav/action `Add book` or `Save book`
- Onboarding `Add first books`
- Book Detail `Add to shelf`
- Public/web Book Detail `Save book`
- Goodreads import progress/sidebar resume

All entry points land in the same Add surface with context preserved. Example: saving from a public book detail should preselect that book and ask for status.

## Add Surface

V1 has three modes:

- `Search`: title, author, ISBN text input.
- `Scan`: mobile camera ISBN barcode scan; web shows manual ISBN entry instead.
- `Import`: Goodreads CSV upload and review.

Default mode:

- New user/onboarding: `Search`
- Mobile quick action: `Search`
- If device supports camera and user taps scan: `Scan`
- Web: `Search`, with `Import` visually available.

## Search Behavior

Search input accepts:

- Title
- Author
- ISBN-10
- ISBN-13
- Title + author combined

Result cards show:

- Cover if available
- Title
- Author(s)
- First published year if available
- Edition/source hint when relevant
- Existing user state if already saved: `Want to read`, `Reading`, `Finished`, `Dropped`

Primary catalog source:

- Open catalog metadata first.
- Normalize results into internal `books` and `editions`.
- Prefer merging editions under a canonical book when title/author/ISBN metadata is confident.

Fallback behavior:

- If no catalog result exists, allow `Create manual book`.
- Manual book requires title and at least one author name.
- Manual entries can be improved later when catalog metadata becomes available.

## Selecting A Book

After selecting a result, Hone shows an Add Sheet.

Required choice:

- `Want to read`
- `Reading`
- `Finished`
- `Dropped`

Optional choices:

- Add to an existing shelf
- Create a shelf
- Choose privacy: default `Friends`
- Add private note for `Want to read` or `Reading`

Status behavior:

- `Want to read`: saves the book; no ranking flow.
- `Reading`: saves the book; no ranking flow.
- `Finished`: starts the finished review/ranking flow.
- `Dropped`: starts the dropped reason flow.

## Finished Branch

Finished uses the canonical ranking flow in `docs/ranking-flow-spec.md`.

If the user cancels before placement is determined:

- No finished review/rank is saved.
- No feed event is published.
- The previous book state remains unchanged.

## Dropped Branch

Dropped uses the canonical dropped behavior in `docs/ranking-flow-spec.md`.

Dropped books do not affect taste ranking.

Flow:

1. User chooses `Dropped`.
2. Hone asks `Why did you stop?`
3. User chooses one or more structured reasons:
   - `Not for me`
   - `Wrong timing`
   - `Too slow`
   - `Did not like the writing`
   - `Might return later`
   - `Other`
4. Optional note.
5. Save Dropped state.
6. Publish dropped feed event after completion.

Dropped reasons are current-state data only while the book is Dropped. If the book later moves Dropped -> Finished, reasons disappear from current Book Detail but remain part of historical feed/action data. The old dropped feed event gets `Later finished`.

## Status Transitions

`Want to read -> Reading`

- Update status.
- Feed event optional in v1; default is publish only if user chooses to share.

`Want to read / Reading -> Finished`

- Start the Finished branch.
- Publish only after ranking completes.

`Want to read / Reading -> Dropped`

- Start Dropped branch.
- Publish only after dropped flow completes.

`Dropped -> Finished`

- Start full Finished branch from scratch.
- Current Book Detail becomes Finished after completion.
- Prior dropped reason is not visible on current Book Detail.
- Historical dropped event remains and is annotated `Later finished`.

`Finished -> Dropped`

- Require confirmation.
- Remove book from active taste ranking.
- Start Dropped branch.
- Historical finished event is annotated `Later marked dropped`.
- Current Book Detail becomes Dropped after completion.

`Finished -> Rerank / Edit Review`

- Available only from Book Detail, not from Search/Add.
- Restarts the full review/ranking process.
- No drafts, no partial persistence, no recovery.
- Old review/rank remains until replacement completes.
- Completed rerank publishes feed event with only new score, or `?` if locked.

## Goodreads CSV Import

Import mode is a guided review process, not a blind bulk save.

Steps:

1. User uploads Goodreads CSV.
2. Hone parses rows client-side where possible, then creates an import job.
3. Hone matches rows against internal books/editions and catalog sources.
4. User reviews import groups:
   - `Matched`
   - `Needs review`
   - `Unmatched`
5. User chooses which Goodreads shelves map to Hone statuses/shelves.
6. User confirms import.

Default mappings:

- Goodreads `to-read` -> `Want to read`
- Goodreads `currently-reading` -> `Reading`
- Goodreads `read` -> prompt user to review/rank later, not automatically Finished-ranked

Important v1 rule:

- Imported read books do not automatically enter the taste ranking.
- They create a backlog: `Ready to rank`.
- User can rank imported finished books one by one through the normal Finished branch.

Why: bulk-imported star ratings should not silently create Hone taste scores. Hone scores come from comparisons.

## Feed Rules

Search/Add publishes feed events only when an action is complete.

- Want to read: publish `saved to Want to read` if sharing is enabled.
- Reading: publish `started reading` if sharing is enabled.
- Finished: publish only after full review/ranking flow completes.
- Dropped: publish only after dropped reason flow completes.
- Import: no per-row feed spam. Optionally publish one summary after user explicitly confirms sharing.

Feed score display:

- If score unlocked: show numeric score, e.g. `8.74`.
- If score locked: show `?`.
- Never show 1-5 star bucket.

## Data Requirements

Search/Add needs these app-level concepts:

- Book canonical record
- Edition records with ISBN/source metadata
- User book state
- User shelves
- Import job and import rows
- Ranking metadata for private initial star bucket
- Activity events

The API should expose app-owned operations, not direct Supabase calls:

- `searchBooks(query)`
- `lookupBookByIsbn(isbn)`
- `createManualBook(input)`
- `saveBookState(input)`
- `startFinishedFlow(input)`
- `completeFinishedRanking(input)`
- `saveDroppedBook(input)`
- `createImportJob(file)`
- `reviewImportMatches(importId)`
- `confirmImport(importId, mappings)`

## Error And Empty States

- No search results: offer manual book creation.
- Ambiguous edition: show edition picker only if ISBN/source metadata materially differs.
- Catalog unavailable: allow retry and manual creation.
- ISBN scan fails: let user enter ISBN manually.
- Duplicate saved book: show current state and actions to update status.
- Import parse failure: explain accepted CSV source and let user re-upload.
- Import match uncertainty: put row in `Needs review`, never silently create questionable records.

## V1 Non-Goals

- No automatic ranking from Goodreads stars.
- No bulk feed events from imports.
- No AI metadata enrichment.
- No social comments in Search/Add.
- No manual score entry.
- No draft recovery for unfinished Finished/rerank flows.

## Acceptance Criteria

- A user can search by title/author and save a book as Want to read.
- A user can scan or enter ISBN and reach the same Add Sheet.
- A user can mark a searched book Finished and complete the ranking flow.
- A user can mark a searched book Dropped and choose structured reasons.
- A user with fewer than 10 ranked finished books sees `?` instead of score after completed ranking.
- A user with at least 10 ranked finished books sees a 0-10 score to 2 decimals.
- A Goodreads CSV import creates reviewable matches and does not auto-rank books.
- Duplicate book saves update existing user book state rather than creating duplicate user entries.
