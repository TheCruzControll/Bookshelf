# CLAUDE.md

## API Surface

### tRPC Procedures

**Health:**
- `health` — query that returns `{ ok: true, service: "hone-api" }` for health checks and readiness probes

**Auth:**
- `auth.appleSignIn(identityToken, nonce)` — validate Apple identity token via JWKS (RS256), enforce issuer/audience/expiry claims, handle private relay emails, create or link `OAuthIdentity`, and return `{ sessionToken, expiresAt, isNewUser }`

**Profile:**
- `profile.checkHandle(handle)` — validate handle availability
- `profile.setHandle(handle)` — set a user's handle (idempotent)
- `profile.createProfile(handle, displayName, defaultVisibility)` — create profile and auto-seed four system shelves (Reading, Want to Read, Finished, Dropped) with PRD-spec visibility defaults

**Shelf:**
- `shelf.update(id, version, name?, visibility?, description?)` — update shelf metadata with optimistic locking (version must match current; stale version returns 409)

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
