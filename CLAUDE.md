# CLAUDE.md

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
