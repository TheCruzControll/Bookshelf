# Hone

Hone is a social reading app inspired by Beli's ranked-list and friend-activity mechanics, built for iOS, Android, and web.

## Product Direction

- V1 focuses on trusted friend circles.
- The main feed is generated from library actions: finished books, dropped books, rankings, shelf updates, reviews, and want-to-read changes.
- Long-term growth includes public creator profiles, shareable shelves, public reviews, and SEO-friendly web pages.

## Architecture

- `apps/native`: Expo + React Native app for iOS and Android.
- `apps/web`: Next.js App Router app for web and public creator surfaces.
- `apps/api`: Hono API boundary for typed product actions.
- `packages/domain`: framework-independent product types, service contracts, and repository ports.
- `packages/db`: Postgres schema and Drizzle-based repository adapters.

Supabase is treated as an infrastructure provider for hosted Postgres/Auth/Storage, not as the core architecture. Business logic depends on app-owned interfaces so the app can migrate to self-managed Postgres later.

## Getting Started

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` or app-specific env files before connecting real infrastructure.

