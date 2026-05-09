# Hone Production Deployment Guide

Covers first-time platform setup, environment wiring, and CI/CD configuration for all three Hone deployment targets: **API** (Fly.io or Render), **web** (Vercel), and **native** (Expo Application Services).

---

## Platform overview

| Target | Platform | Build artifact |
|---|---|---|
| `@hone/api` | Fly.io **or** Render | Node.js server (`tsx` entrypoint) |
| `@hone/web` | Vercel | Next.js (RSC / ISR) |
| `@hone/native` | Expo Application Services (EAS) | iOS `.ipa` / Android `.apk`/`.aab` |

All three targets share a single monorepo and a common Postgres 16 database. Migrations are applied separately from code deploys — see `docs/runbook.md §3` for the migration procedure.

---

## Prerequisites (all platforms)

- pnpm 10+ and Node.js 22 installed locally.
- A provisioned Postgres 16 instance (Supabase, Neon, Railway, or self-hosted). Confirm `DATABASE_URL` works: `psql "$DATABASE_URL" -c '\l'`.
- All secrets listed in `docs/runbook.md §6` sourced for the target environment.

---

## 1. API — Fly.io

### 1a. One-time setup

1. **Install the Fly CLI and authenticate:**

   ```sh
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create the app (run once from the repo root):**

   ```sh
   fly apps create hone-api --org <your-org>
   ```

3. **Set secrets:**

   ```sh
   fly secrets set \
     DATABASE_URL="<prod connection string>" \
     HMAC_KMS_KEY_ID="<kms key id>" \
     SUPABASE_URL="<url>" \
     SUPABASE_ANON_KEY="<anon key>" \
     SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
     PORT="8787" \
     --app hone-api
   ```

4. **Create `fly.toml`** in the repo root (commit it):

   ```toml
   app = "hone-api"
   primary_region = "iad"

   [build]
     [build.args]
       NODE_VERSION = "22"

   [[services]]
     protocol = "tcp"
     internal_port = 8787

     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]

     [[services.ports]]
       port = 80
       handlers = ["http"]

     [services.concurrency]
       type = "connections"
       hard_limit = 100
       soft_limit = 80

   [deploy]
     release_command = "pnpm db:migrate"
   ```

5. **Deploy:**

   ```sh
   fly deploy --app hone-api
   ```

6. **Verify:**

   ```sh
   fly status --app hone-api
   curl https://hone-api.fly.dev/health
   ```

### 1b. CI/CD wiring (Fly)

Add the following GitHub Actions job to `.github/workflows/ci.yml` (or a dedicated `deploy-api.yml`):

```yaml
deploy-api:
  needs: check
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: superfly/flyctl-actions/setup-flyctl@master
    - run: fly deploy --app hone-api --remote-only
      env:
        FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Required repo secret: `FLY_API_TOKEN` — generate via `fly tokens create deploy`.

---

## 2. API — Render (alternative to Fly)

### 2a. One-time setup

1. Go to [render.com](https://render.com) → **New Web Service** → connect the GitHub repo.
2. Configure the service:
   - **Environment:** Node
   - **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @hone/api build`
   - **Start command:** `node --import tsx/esm apps/api/src/server.ts`
   - **Region:** choose nearest to your database
3. Add environment variables in the Render dashboard (same keys as listed in `docs/runbook.md §6`).
4. Under **Pre-Deploy Command**, set: `pnpm db:migrate` — Render runs this before each deploy, ensuring migrations precede the code rollout.
5. Enable **Auto-Deploy** on the `main` branch.

### 2b. CI/CD wiring (Render)

Render's auto-deploy on push to `main` is the primary trigger. To deploy manually or from GitHub Actions:

```yaml
deploy-api-render:
  needs: check
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - name: Trigger Render deploy
      run: |
        curl -X POST "$RENDER_DEPLOY_HOOK_URL"
      env:
        RENDER_DEPLOY_HOOK_URL: ${{ secrets.RENDER_DEPLOY_HOOK_URL }}
```

Required repo secret: `RENDER_DEPLOY_HOOK_URL` — found in the Render service dashboard under **Settings → Deploy Hook**.

---

## 2. Web — Vercel

### 2a. One-time setup

1. **Install the Vercel CLI and authenticate:**

   ```sh
   pnpm add -g vercel
   vercel login
   ```

2. **Link the project (run once from `apps/web`):**

   ```sh
   cd apps/web
   vercel link
   ```

   - Framework preset: **Next.js**
   - Root directory: `apps/web`
   - Build command: `cd ../.. && pnpm --filter @hone/web build`
   - Output directory: `.next`

3. **Set environment variables** in the Vercel dashboard (Project → Settings → Environment Variables):

   | Variable | Environment |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | Production, Preview |
   | `DATABASE_URL` | Production (for RSC data fetching if used server-side) |
   | `SUPABASE_URL` | Production, Preview |
   | `SUPABASE_ANON_KEY` | Production, Preview |
   | `SUPABASE_SERVICE_ROLE_KEY` | Production only |

4. **Deploy:**

   ```sh
   vercel --prod
   ```

5. **Verify:**
   - `GET https://hone.app/` returns HTTP 200.
   - `GET https://hone.app/u/<handle>` returns correct OpenGraph metadata.
   - Check ISR revalidation: make a data change via the API, wait for the revalidation interval, confirm the public page updates.

### 2b. CI/CD wiring (Vercel)

Vercel's GitHub integration is the primary CI/CD path — install the Vercel GitHub App on the repo and it will:
- Build and deploy a **preview** on every PR.
- Build and deploy **production** on every push to `main`.

To add explicit gate (run after the `ci` check passes), add to your workflow:

```yaml
deploy-web:
  needs: check
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Enable corepack
      run: corepack enable
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @hone/web build
    - uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
        vercel-args: '--prod'
```

Required repo secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — found via `vercel env ls` or the Vercel dashboard.

---

## 3. Native — Expo Application Services (EAS)

### 3a. One-time setup

1. **Install the EAS CLI and authenticate:**

   ```sh
   pnpm add -g eas-cli
   eas login
   ```

2. **Create the EAS project (run once from `apps/native`):**

   ```sh
   cd apps/native
   eas init --id <your-expo-project-id>
   ```

3. **Configure EAS builds** — create `apps/native/eas.json`:

   ```json
   {
     "cli": {
       "version": ">= 14.0.0"
     },
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       },
       "preview": {
         "distribution": "internal",
         "env": {
           "EXPO_PUBLIC_API_URL": "https://hone-api-staging.fly.dev"
         }
       },
       "production": {
         "autoIncrement": true,
         "env": {
           "EXPO_PUBLIC_API_URL": "https://hone-api.fly.dev"
         }
       }
     },
     "submit": {
       "production": {
         "ios": {
           "appleId": "<your-apple-id>",
           "ascAppId": "<app-store-connect-app-id>",
           "appleTeamId": "<team-id>"
         },
         "android": {
           "serviceAccountKeyPath": "./google-service-account.json",
           "track": "production"
         }
       }
     }
   }
   ```

4. **Set EAS secrets** (substitutes for `.env` in CI):

   ```sh
   eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://hone-api.fly.dev" --type string
   ```

5. **Trigger a production build:**

   ```sh
   eas build --platform all --profile production
   ```

6. **Submit to stores:**

   ```sh
   eas submit --platform all --profile production --latest
   ```

### 3b. CI/CD wiring (EAS)

Add to `.github/workflows/` (e.g. `deploy-native.yml`):

```yaml
name: deploy-native
on:
  push:
    branches: [main]
    paths:
      - "apps/native/**"
      - "packages/domain/**"

jobs:
  build-and-submit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Enable corepack
        run: corepack enable
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - name: Build and submit (iOS + Android)
        working-directory: apps/native
        run: eas build --platform all --profile production --non-interactive --auto-submit
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

Required repo secret: `EXPO_TOKEN` — generate at [expo.dev](https://expo.dev) → Account → Access Tokens.

---

## 4. Environment variables reference

Full variable list is in `docs/runbook.md §6`. The table below maps each variable to its required deployment target.

| Variable | API | Web | Native |
|---|---|---|---|
| `DATABASE_URL` | Yes | If server-side DB access needed | No |
| `HMAC_KMS_KEY_ID` | Yes | No | No |
| `SUPABASE_URL` | Yes | Yes | No |
| `SUPABASE_ANON_KEY` | Yes | Yes | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Production only | No |
| `NEXT_PUBLIC_API_URL` | No | Yes | No |
| `EXPO_PUBLIC_API_URL` | No | No | Yes (build-time) |
| `PORT` | No (defaults to `8787`) | No | No |

---

## 5. CI/CD workflow summary

All code changes flow through the agent swarm before reaching `main`. The CI gate (`ci.yml`) runs typecheck, lint, and tests on every PR. Auto-merge fires only after Reviewer approval and a green `agent-tester` check.

```
PR opened
  → agent-tester: typecheck + lint + test (affected packages)
  → agent-reviewer: diff review
  → auto-merge to main (squash)
  → [deploy triggers fire per platform]
```

**API (Fly):** `fly deploy` via `FLY_API_TOKEN` on push to `main`. The `release_command` in `fly.toml` runs `pnpm db:migrate` before traffic shifts.

**API (Render):** Auto-deploy on push to `main` via Render's GitHub integration. Pre-deploy command runs `pnpm db:migrate`.

**Web (Vercel):** Vercel GitHub App deploys preview on every PR, production on merge to `main`. No extra workflow step required when using the GitHub App.

**Native (EAS):** `eas build --auto-submit` on push to `main` when `apps/native/**` or `packages/domain/**` changes. Store review latency (1–3 days) is the bottleneck; over-the-air (OTA) updates via `eas update` can ship JS-only changes instantly without a full store submission.

---

## 6. Post-deploy smoke tests

After any production deploy, run these checks:

| Check | Expected |
|---|---|
| `GET https://hone-api.fly.dev/health` | HTTP 200 |
| `GET https://hone.app/` | HTTP 200, `<title>` present |
| `GET https://hone.app/u/<handle>` | HTTP 200, OpenGraph tags present |
| Sign in with test account | Home feed loads |
| Add a book via search | Book appears on shelf |
| Public profile accessible logged-out | Content visible per `public` visibility tier |

For detailed rollback, migration, and secret rotation procedures, see `docs/runbook.md`.
