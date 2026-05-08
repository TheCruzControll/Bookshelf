# Hone Product Requirements

## Summary

Hone is a Beli-like app for books. Users build ranked shelves, follow friends, and discover books through activity from people they trust.

The name comes from `hon`, the Japanese word for book, and the English verb "hone": to sharpen. The product promise is to help readers hone their taste through books and trusted social signals.

## V1 Audience

The first audience is trusted friend circles. Power-reader workflows and public creator growth are supported by the data model, but the first product experience should feel social and personal before it feels like a publishing platform.

## Core Loop

1. Add books through search, ISBN scanning, or Goodreads CSV import. See `docs/search-add-flow-spec.md`.
2. Place books on shelves such as Want to Read, Reading, Finished, Dropped, Favorites, or custom shelves.
3. Rank finished books through the Beli-like taste comparison flow. See `docs/ranking-flow-spec.md`.
4. See friends' reading and ranking activity in a feed.
5. Use friend taste signals to discover what to read next.

## Privacy

The default visibility is friends-only. The model must support future public profiles, public shelves, and public reviews for creator growth.

## Recommendations

V1 recommendations are SQL-based and explainable: friend overlap, shelf rankings, review sentiment, and reading-status events. AI recommendations are deferred.

## Platform Requirements

- Native iOS and Android app.
- Web app with SEO-capable public pages.
- Shared domain types and API contracts across clients.

## Non-Goals For V1

- No graph database.
- No graph projection/read model.
- No launch-time AI recommendation engine.
- No direct Supabase business-data calls from UI screens.
