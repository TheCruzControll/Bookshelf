# CLAUDE.md

## API Surface

### tRPC Procedures

**Health:**
- `health` — query that returns `{ ok: true, service: "hone-api" }` for health checks and readiness probes

**Auth:**
- `auth.appleSignIn(identityToken, nonce)` — validate Apple identity token via JWKS (RS256), enforce issuer/audience/expiry claims, handle private relay emails, create or link `OAuthIdentity`, and return `{ sessionToken, expiresAt, isNewUser }`
- `auth.googleSignIn(idToken)` — validate Google `id_token` via JWKS (RS256), enforce issuer/audience/expiry claims, create or link `OAuthIdentity`, and return `{ sessionToken, expiresAt, isNewUser }`

**Profile:**
- `profile.checkHandle(handle)` — validate handle availability
- `profile.setHandle(handle)` — set a user's handle (idempotent)
- `profile.createProfile(handle, displayName)` — create profile and auto-seed four system shelves (Reading, Want to Read, Finished, Dropped) with PRD-spec visibility defaults. Default visibility for all content types is always set to `POSTURE_C_DEFAULTS` on the server; clients cannot override.

**Shelf:**
- `shelf.update(id, version, name?, visibility?, description?)` — update shelf metadata with optimistic locking (version must match current; stale version returns 409)

**Account:**
- `account.requestDelete()` — soft-delete: insert an `account_deletions` row with 30-day grace, revoke all sessions, return the deletion record. Idempotent.
- `account.cancelDelete()` — remove the `account_deletions` row if it exists and the grace period has not yet expired.
- `account.requestExport()` — build a gzipped JSON archive of every user-scoped row owned by the viewer and return `{ url, expiresAt }`. Signed URL lifetime defaults to 24h; archive layout documented in `docs/runbook.md`. Returns 501 if no `StorageProvider` is wired.

**Discover:**
- `discover.peopleYouMayKnow(limit?)` — passive People-You-May-Know surface (P-08, Q4-locked: no push, no email). Returns a ranked list of suggested profiles for the viewer, combining contacts-match (phone-hash overlap) and friend-of-friend (FoF) candidate sources. Excludes the viewer, mutuals, blocked users in both directions, and soft-deleted profiles. Each suggestion carries `source: "contacts" | "fof" | "both"` for client-side chrome. Limit defaults to 20, capped at 50.

### Domain Ports

**Catalog:**
- `CatalogProvider.search(query, limit)` — search catalog by title/author; returns `BookSearchResult[]` (see `packages/domain/src/ports.ts` for contract). Downstream adapters (Open Library and Google Books clients) implement this port.
- `CatalogProvider.lookupByIsbn(isbn)` — lookup book by ISBN-10 or ISBN-13; returns `BookSearchResult | null`.

`BookSearchResult` covers both Open Library and Google Books response shapes (see `packages/domain/src/types.ts`), with source field indicating `"open_library" | "google_books"`.

**Storage:**
- `StorageProvider.putObject({ key, body, contentType, expiresInMs })` — upload a binary blob and return `{ url, expiresAt }` where `url` is a time-limited URL that ceases to be valid by `expiresAt`. Production uses a presigned-URL adapter (S3 / GCS / R2); dev uses `LocalFileStorageProvider` (`apps/api/src/storage/local-storage.ts`) which writes to a temp directory and returns a `file://` URL.

## Cache usage

Any per-user, per-resource, or infrastructure cache **must** use `ctx.cache` from the tRPC context or app dependencies.
Never use module-scoped `Map`s or other module-level singletons for caching.

`ctx.cache` is a `Cache` instance (`@hone/cache`) wired at app startup based on
the `CACHE_DRIVER` env variable (`memory` | `redis`). Procedures and middleware access it via:

```ts
const value = await ctx.cache?.get<MyType>("some-key");
await ctx.cache?.set("some-key", value, ttlMs);
```

The driver is configured in `packages/config-env` via `CACHE_DRIVER` (default:
`memory`). When `CACHE_DRIVER=redis`, `REDIS_URL` is required.
