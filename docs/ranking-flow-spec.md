# Hone Ranking Flow V1 Spec

## Summary

Hone's ranking flow is the core taste-profile mechanic. It is inspired by Beli's relative ranking behavior, but adapted for books. Users do not manually enter a 0-10 score. They finish books, provide a temporary 1-5 star bucket, answer binary taste comparisons, and Hone derives a global taste rank and score.

## Core Principles

- Ranking trains a global per-user taste profile.
- A user/book has one global taste position and one global 0-10 score.
- Genres are filters/views and candidate-selection hints, not separate scores.
- Rank order is the source of truth.
- The 0-10 score is derived from rank order and shown to 2 decimal places.
- Finished books affect taste ranking.
- Dropped books do not affect taste ranking.
- No manual drag/reorder is allowed for taste ranking.
- Ranking changes only through the comparison flow.

## Score Visibility

Numeric scores are locked until the user has **10 ranked finished books**.

Before unlock:

- Completed score slots show `?`.
- Book Detail score badge shows `?`.
- Feed score badge shows `?`.
- Taste Profile list score column shows `?`.
- Placement popup shows `?` and calibration progress, such as `8/10 ranked`.
- During comparisons, do not show scores, buckets, or `?`.

At exactly 10 ranked finished books:

- Show a special `Taste Scores Unlocked` popup.
- Existing `?` score slots become numeric throughout the app.
- The 10th book's score is shown in the popup.
- Closing the popup lands on updated Book Detail.

After unlock:

- Scores show as `0.00-10.00`.
- Existing comparison books may show their current score during comparisons.
- The new book never shows a provisional score during comparisons.

## Finished Review/Ranking Flow

This flow starts when a user marks a book `Finished`, or when they rerank/rereview a finished book from Book Detail.

Order:

1. User marks book `Finished`.
2. Hone asks for a temporary **1-5 star bucket**.
3. User adds optional short review/note.
4. Hone runs swipeable page-style binary comparisons.
5. Hone determines final placement.
6. Hone auto-saves the completed review/rank result.
7. Hone shows a popup with score state and optional note/review.
8. Closing popup lands on updated Book Detail.
9. Feed event publishes only after the full flow completes.

There is no final `Done` button after comparisons. Once Hone has enough placement information, the result is saved and the popup appears.

## Temporary 1-5 Star Bucket

The 1-5 star input is only an initial bucketing tool.

- It is never shown after submission.
- It is not visible to friends, public viewers, or the user after the flow.
- It should not appear in feed, Book Detail, public profile, or taste profile UI.
- It may be stored privately as ranking metadata for debugging, analytics, and recalibration.

Initial star-to-score starting ranges:

- `5 stars` -> `8.00-10.00`
- `4 stars` -> `6.00-8.00`
- `3 stars` -> `4.00-6.00`
- `2 stars` -> `2.00-4.00`
- `1 star` -> `0.00-2.00`

These ranges are flexible starting ranges, not strict boundaries. If comparisons contradict the initial bucket, the search can expand upward or downward.

## Comparison UI

The comparison interaction should feel like swiping/turning book pages, closer to Kindle/page flipping than Tinder cards.

Prompt:

`Which is more your taste?`

The UI shows:

- New book on one side/page.
- Existing comparison book on the other side/page.
- Cover, title, author.
- User note/review excerpt if available.
- Existing book score only when scores are unlocked.

The UI does not show:

- Provisional score for the new book.
- Scores or buckets while score system is locked.
- `Why this comparison?` labels.
- Nearby placement context.

User chooses the side/page that is more their taste.

## Candidate Selection

The comparison candidate pool is genre-aware first, with global fallback.

Candidate selection should prefer:

1. Books in the current star bucket/range.
2. Books with overlapping genres.
3. Books near the current binary-search midpoint.
4. Global nearby-score books if not enough genre overlap exists.

Genres do not create separate scores. If a book is both Fantasy and Sci-Fi, it has the same global score in both genre views.

## Ranking Algorithm

Use a binary-search-style insertion flow over the user's ranked finished books.

Behavior:

1. Star bucket selects an initial score/rank range.
2. Hone chooses a midpoint candidate in that range.
3. User answers `Which is more your taste?`
4. If the new book wins, search the higher half.
5. If the existing book wins, search the lower half.
6. Continue until the insertion position is determined.
7. If comparisons push beyond the starting band, expand outside the band.
8. Insert the book into the global rank order.
9. Derive visible score from the final rank order.

The number of comparisons should scale logarithmically with ranked-book count, not linearly.

## Score Calculation

Rank order is the source of truth. The score is a projection of that order.

Rules:

- User does not manually enter a 0-10 score.
- Score is calculated from final rank position.
- Score displays up to 2 decimal places.
- If a book moves because of rerank/rereview or status transition, scores may recalculate.
- If scores are locked, UI shows `?` in completed score slots.

V1 can use a simple position-derived scoring model. Advanced confidence modeling and normalization can be deferred.

## Popup After Placement

After placement is determined, Hone auto-saves and shows a popup.

If scores are unlocked:

- Show only the new score, e.g. `8.74`.
- Include optional note/review text if provided.

If scores are locked:

- Show `?`.
- Show calibration progress, e.g. `8/10 ranked`.
- Include optional note/review text if provided.

Do not show:

- Nearby placement context.
- Previous score.
- Score diff.
- Star bucket.
- Final `Done` button.

Closing the popup always lands on updated Book Detail.

## Rerank / Rereview

Rerank is available only from finished Book Detail.

Behavior:

- Rerank restarts the full finished review/ranking flow.
- Edit Review also restarts the full finished review/ranking flow.
- Review and rank are one process.
- No drafts.
- No partial persistence.
- No recovery if app is closed mid-flow.
- Old review/rank remains unchanged until replacement completes.
- If canceled or interrupted, nothing changes.
- If completed, replacement saves atomically and publishes a feed event.

Rerank feed event:

- Copy direction: `Maya updated their take on The Fifth Season`.
- Show only the new score, or `?` if score is locked.
- Do not show previous score.
- Do not show score delta.

## Dropped Flow

Dropped books do not affect taste ranking.

Dropped flow:

1. User marks book `Dropped`.
2. Hone asks `Why did you stop?`
3. User chooses one or more structured reasons:
   - `Not for me`
   - `Wrong timing`
   - `Too slow`
   - `Did not like the writing`
   - `Might return later`
   - `Other`
4. User may add optional note.
5. Hone saves Dropped state.
6. Hone publishes dropped feed event after completion.

Dropped reasons are current-state data only while the book is Dropped.

## Status Transitions

`Dropped -> Finished`

- Start full Finished review/ranking flow.
- Current Book Detail becomes Finished after completion.
- Prior dropped reason is not visible on current Book Detail.
- Historical dropped event remains in feed/action history.
- Historical dropped event gets `Later finished` annotation.

`Finished -> Dropped`

- Require confirmation.
- Remove book from active taste ranking.
- Start Dropped flow.
- Prior finished review/rank becomes historical, not current.
- Historical finished event gets `Later marked dropped` annotation.
- Current Book Detail becomes Dropped after completion.

`Want to read / Reading -> Finished`

- Start full Finished review/ranking flow.
- Publish feed only after ranking completes.

`Want to read / Reading -> Dropped`

- Start Dropped flow.
- Publish feed only after dropped flow completes.

## Feed Rules

Finished feed event publishes only after the full review/ranking flow completes.

Do not publish feed events when:

- User taps Finished.
- User selects stars.
- User writes note.
- User answers comparisons.
- User cancels or exits before placement.

Completed Finished feed event shows:

- Actor
- Book title
- Status: `finished`
- Optional note excerpt
- Score badge:
  - numeric score if unlocked
  - `?` if locked

Never show the 1-5 star bucket in feed.

## V1 Scope

Build:

- Temporary star bucket input.
- Optional note/review.
- Swipeable binary comparison UI.
- Genre-aware candidate selection with global fallback.
- Binary-search-style insertion.
- Global rank order.
- Position-derived score.
- Score unlock at 10 ranked finished books.
- `?` score placeholders before unlock.
- Dropped flow separated from ranking.
- Rerank from Book Detail only.
- Feed events after completed flow.

Defer:

- Manual reorder.
- Draft/recovery flows.
- Previous score diffs.
- Explanation labels.
- Advanced confidence modeling.
- Advanced genre weighting beyond candidate selection.

## Acceptance Criteria

- A finished book cannot publish a feed event until ranking completes.
- A completed finished book appears in the user's global rank order.
- A completed finished book shows `?` instead of score before 10 ranked finished books.
- The 10th ranked finished book unlocks numeric scores.
- After unlock, scores show to 2 decimal places.
- Rerank is only available from finished Book Detail.
- Rerank replaces old review/rank only after completion.
- Dropped books do not affect active taste ranking.
- Finished -> Dropped removes the book from active taste ranking.
- Dropped -> Finished runs the full finished ranking flow.

