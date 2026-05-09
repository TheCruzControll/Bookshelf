## Summary

<!-- one or two sentences -->

## Linked issue

Closes #

## Acceptance criteria

<!-- mirror the issue's checklist; check items as you complete them -->

- [ ]
- [ ]

## Test plan

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] Manual verification (describe)

## Spec compliance

<!-- delete sections not relevant; cite locked decisions from docs/prd-backlog.md -->

- Visibility / privacy: Posture C 4-tier on touched entities
- Hexagonal layering: types → ports → services → repos
- API: tRPC procedures only (no plain Hono routes after Epic D)
- Schemas: zod schemas live in `packages/domain/src/schemas/`
