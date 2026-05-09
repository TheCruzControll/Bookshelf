# CLAUDE.md

## Domain Utilities

### Goodreads CSV Parser

The `parseGoodreadsCsv()` function in `packages/domain/src/goodreads.ts` parses
Goodreads library exports into typed `GoodreadsRow[]` records. It:

- Handles known column variants via `COLUMN_ALIASES` lookup table
- Normalizes Goodreads shelf names to Hone `ReadingStatus` values (`finished`, `reading`, `want_to_read`, `dropped`)
- Strips Excel-escape ISBN formatting (`=\"...\"`)
- Returns typed rows with parsed dates, numeric fields, and a `status` field

Used by the import service to prepare Goodreads data for matching and merging.

## Cache usage

Any per-user or per-resource cache **must** use `ctx.cache` from the tRPC context.
Never use module-scoped `Map`s or other module-level singletons for caching.

`ctx.cache` is a `Cache` instance (`@hone/cache`) wired at app startup based on
the `CACHE_DRIVER` env variable (`memory` | `redis`). Procedures access it via:

```ts
const value = await ctx.cache?.get<MyType>("some-key");
await ctx.cache?.set("some-key", value, ttlMs);
```

The driver is configured in `packages/config-env` via `CACHE_DRIVER` (default:
`memory`). When `CACHE_DRIVER=redis`, `REDIS_URL` is required.
