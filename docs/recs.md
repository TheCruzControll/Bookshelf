# Recommendation Scoring — Heuristic Weighted-Sum

## Overview

Hone v1 recommendations use a heuristic weighted-sum scorer. No ML, no
collaborative filtering — just six explainable signals combined with
hand-tuned weights.

The scorer is a pure function: `scoreCandidate(signals, weights?)` in
`packages/domain/src/heuristic-scorer.ts`. It takes pre-computed signal
values and returns a `{ score, dominantSignal }` result. The dominant
signal drives the one-line "why this?" shown on the recommendation card.

## Signals

| Signal | Raw range | Normalization | Default weight | Rationale |
|---|---|---|---|---|
| `mutual_count` | 0 .. N | saturates at 5 | 0.30 | Strongest social proof — friends finished it |
| `mutual_avg_score` | 0-10 (or null) | linear /10; null = 0 | 0.25 | Quality signal from trusted circle |
| `taste_overlap` | 0 .. 1 | clamped [0,1] | 0.20 | Cosine similarity on shared ranked books |
| `genre_match` | 0 .. 1 | clamped [0,1] | 0.10 | Fraction of viewer's top genres matching book |
| `recency` | 0 .. 1 | clamped [0,1] | 0.10 | Decay factor; 1.0 = finished today |
| `popularity_floor` | 0 .. N | saturates at 50 | 0.05 | Prevents ultra-niche; intentionally small |

Default weights sum to 1.0. The final score is the weighted average of
normalized signals and is bounded to [0, 1].

## Dominant signal

The signal whose weighted contribution (`normalized * weight`) is
largest becomes `dominantSignal`. This maps to a human-readable reason
via `reasonForSignal()`:

| Signal | Reason text |
|---|---|
| `mutual_count` | Popular among your friends |
| `mutual_avg_score` | Highly rated by your friends |
| `taste_overlap` | Matches your reading taste |
| `genre_match` | Fits your favorite genres |
| `recency` | Recently read by your friends |
| `popularity_floor` | Widely read on Hone |

### Candidate-aware reason picker (P-03)

`reasonFor(dominantSignal, candidate, locale = "en")` picks the
"why this?" line and enriches it with candidate data when available:

| Dominant signal | Enriched output |
|---|---|
| `mutual_count` (>0) | `"N friend(s) finished this"` |
| `genre_match` (with genres) | `"Fits your taste in <first genre>"` |
| `popularity_floor` (>0) | `"Widely read on Hone — N reader(s)"` |
| all others / empty data | Falls back to the static reason above |

`locale` is currently restricted to `"en"`; the renderer table is
keyed by locale so additional locales can be added without changing
callers.

## Weight tuning

Weights are passed as an optional second argument to `scoreCandidate`.
The default set (`DEFAULT_WEIGHTS`) is hand-tuned. Future iterations may
A/B test different weight vectors; the scorer itself is weight-agnostic.

## Cold start

When a viewer has fewer than 3 mutuals or fewer than 10 ranked books,
the recommendation surface falls back to "popular reads to get you
started" (see PRD). The scorer is not called in the cold-start path.

## Dependencies

- **taste_vectors** table (#41) — stores per-user cosine vectors for
  `taste_overlap`.
- **Mutual derivation view** (#89) — provides `mutual_count` and
  `mutual_avg_score` aggregation per candidate book.
