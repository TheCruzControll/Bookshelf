# Hone Operator Runbook

Operational procedures for deploying, rolling back, migrating, rotating secrets, and running scheduled maintenance on the Hone v1 stack.

**Stack summary:** Next.js (web) · Hono + Node.js (API) · PostgreSQL 16 (Drizzle ORM, `pnpm db:migrate`) · KMS-managed HMAC key for contacts matching.

---

## 1. Deploy

### What to check first

Before starting a deploy:

- Confirm `main` is green: check the `ci` and `agent-tester` GitHub Actions runs.
- Confirm the migration plan: run `pnpm db:generate --dry-run` (if supported) or review `packages/db/drizzle/` for any pending SQL files not yet applied to prod.
- Confirm no other deploy is in progress (check the deploy log or your platform's activity tab).
- Confirm the `DATABASE_URL` secret is set correctly for the target environment.
- If a migration is part of this deploy, read Section 3 (DB Migrations) first — migrations run before the new code rolls out.

### Procedure

1. **Merge the PR to `main`.** The `ci` workflow runs typecheck, lint, and tests automatically.

2. **Apply migrations (if any):**

   ```sh
   DATABASE_URL="<prod connection string>" pnpm db:migrate
   ```

   Verify the migration completed without errors. Check that the expected tables/columns exist in prod before continuing.

3. **Deploy the API (`@hone/api`):**

   ```sh
   pnpm --filter @hone/api build
   # Upload or restart the API service via your platform (e.g. Railway, Fly, Render)
   ```

4. **Deploy the web app (`@hone/web`):**

   ```sh
   pnpm --filter @hone/web build
   # Deploy static/RSC output via your platform (e.g. Vercel, Netlify)
   ```

5. **Smoke-test prod:**
   - `GET /` on the web domain returns HTTP 200.
   - `GET /health` (or equivalent) on the API returns HTTP 200.
   - Sign in with a test account; confirm the home feed loads.
   - Confirm a known public profile page (`/u/<handle>`) loads with correct OpenGraph metadata.

6. **Tag the release:**

   ```sh
   git tag v<semver> main
   git push origin v<semver>
   ```

---

## 2. Rollback

### What to check first

- Identify which commit introduced the regression. Use `git log --oneline` and the Actions run history.
- Determine whether the broken deploy included a DB migration. If yes, a schema rollback may be needed — see Section 3.
- Check whether any cached or queued data (feed events, recommendation cache, contacts hash rows) may be affected by the bad deploy.

### Procedure (no schema change)

1. **Identify the last good release tag or commit SHA.**

2. **Re-deploy the previous version:**

   ```sh
   git checkout <last-good-tag-or-sha>
   pnpm --filter @hone/api build
   # Re-deploy the API image/bundle via your platform
   pnpm --filter @hone/web build
   # Re-deploy the web output
   ```

3. **Smoke-test** using the steps in Section 1, step 5.

4. **Open a postmortem issue** in the repo describing what broke and why. Label it `priority:p0`.

### Procedure (with schema change — additive migrations)

For additive-only migrations (new table, new nullable column, new enum value):

1. Rollback the application code as above. Additive schema changes are safe to leave in place — the previous code ignores unknown columns.
2. Monitor error rates; if stable, leave the schema in place and create a follow-up issue to clean up the unused column/table in a future release.

### Procedure (with schema change — destructive or column-rename)

For destructive changes (column removed, type changed, enum value removed):

1. Stop the API service to prevent further writes.
2. Restore the database from the most recent backup taken before the migration ran.
3. Re-deploy the previous application version.
4. Verify data integrity by spot-checking affected tables.
5. Open a postmortem issue labeled `priority:p0`.

> **Note:** Drizzle ORM does not auto-generate rollback scripts. Always take a DB backup immediately before applying any migration in production.

---

## 3. DB Migrations

### What to check first

- Confirm `DATABASE_URL` points to the correct environment (do not run prod migrations against staging and vice versa).
- Take a database backup before running any migration:

  ```sh
  pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M%S).sql
  ```

- Review the pending migration SQL in `packages/db/drizzle/` — inspect each `.sql` file that is newer than the last applied migration.
- Confirm the API is in a maintenance window or that the migration is backward-compatible with the currently deployed code.

### Generating a migration

After editing `packages/db/src/schema.ts`:

```sh
pnpm db:generate
```

This writes a new SQL file to `packages/db/drizzle/`. Commit it alongside the schema change.

### Applying a migration

```sh
DATABASE_URL="<connection string>" pnpm db:migrate
```

Drizzle applies all unapplied SQL files in `packages/db/drizzle/` in filename order and records applied migrations in the `__drizzle_migrations` table.

### Verifying a migration

```sh
psql "$DATABASE_URL" -c "\d+ <table_name>"
```

Confirm the expected columns, types, and indexes are present.

#### Example: Migration 0002 (`follows` restructure)

Migration `0002_follows_replace_friendships` is a destructive schema migration that:
- Drops the `friendships` table entirely
- Removes the surrogate `id` column from `follows`
- Changes `follows` primary key to composite `(follower_id, followee_id)`
- Adds direction indexes for query performance

**Before deploying this migration in production:**
1. Ensure `DATABASE_URL` is correct for the environment
2. Take a full database backup
3. Test the migration against a staging environment first
4. Coordinate the schema change with the API deployment — code reading `follows` must be deployed before or with this migration

This migration is not backward-compatible with code written for the old `friendships` table. Rollback requires database restore.

### Rollback

See Section 2 — Rollback (with schema change).

---

## 4. Salt Rotation

The contacts-matching index uses HMAC-SHA-256 with a KMS-managed server salt. Per the locked spec, the salt rotates monthly via a scheduled job. This section describes what happens automatically and what operators must do manually if the scheduled job fails.

### What to check first

- Confirm the scheduled salt-rotation job completed in the last 30 days. Check its most recent run in the platform job scheduler or CI cron log.
- Confirm there are no in-flight contact-upload or contact-match requests during the rotation window (pick a low-traffic window, typically overnight).
- Confirm the KMS key policy allows the API's service account to generate a new HMAC key version.
- Confirm `packages/db` has no pending migrations that touch the contacts-hash tables before starting rotation.

### How the rotation works

1. **New salt version generated.** The rotation job calls KMS to create a new HMAC key version. The new version becomes the **active** version for all future incoming contact uploads.
2. **Old hashes re-hashed.** All rows in the contacts-match index that carry the previous salt version are re-hashed against the new salt and updated in place.
3. **Old salt version retired.** Once all rows are updated, the old KMS key version is disabled (not destroyed — retained for audit).
4. **Hashed rows older than 90 days are purged.** The job deletes any contact-match rows whose `created_at` is more than 90 days ago, regardless of salt version.

### Manual rotation procedure (if the scheduled job fails)

Run the rotation job manually from the platform's job runner or via:

```sh
# Replace with the actual invocation for your job runner
pnpm --filter @hone/api tsx tools/jobs/rotate-contact-salt.ts
```

Monitor the job output for:
- `[salt-rotation] new salt version: <version>` — confirms KMS step succeeded.
- `[salt-rotation] re-hashed <N> rows` — confirms bulk update completed.
- `[salt-rotation] purged <N> rows older than 90 days` — confirms cleanup completed.
- `[salt-rotation] complete` — confirms the job finished without errors.

If the job fails partway through:

1. **Check which step failed** in the job log.
2. **If KMS step failed:** the new salt was not activated. Re-run the job — it is idempotent for this step.
3. **If re-hash step failed:** some rows may carry the old salt version. The old KMS key version is still enabled. Re-run the job — it picks up rows that still carry the old version.
4. **If purge step failed:** stale rows remain. Re-run the purge step directly:

   ```sh
   psql "$DATABASE_URL" -c "DELETE FROM contact_hashes WHERE created_at < NOW() - INTERVAL '90 days';"
   ```

5. Open an incident issue labeled `priority:p0` if you cannot complete rotation within 48 hours of the scheduled time.

### Email-match index

The email contacts index uses the same HMAC scheme on lowercased, trimmed email addresses. The same rotation job handles both phone and email hash tables. Steps and verification are identical.

### What not to do

- Do not destroy the old KMS key version immediately — retain it (disabled) for 90 days in case an audit requires reproducing a past hash.
- Do not rotate outside of a planned maintenance window if there are more than 10 000 rows to re-hash; the bulk update can spike DB CPU.
- Do not trigger rotation while a Goodreads import or contacts-sync job is in flight — those jobs write new hashes with the current active salt version, which may be invalidated mid-run.

---

## 5. Hard-Delete Cron

Accounts requested for deletion enter a 30-day soft-delete grace period. After the grace expires, a scheduled cron job permanently removes all personal data.

### What to check first

- Confirm the hard-delete cron ran within the last 24 hours. Check the platform's job scheduler or cron log.
- Confirm the job completed without errors. A partial run can leave orphaned rows in related tables.
- If a GDPR export was requested for a user in the batch, confirm the export archive was generated and made available before the hard delete ran.

### What the cron deletes (per expired account)

In order:

1. Public reviews — rows deleted; platform returns HTTP 410 on the old URLs for 90 days, then 404.
2. Feed events — removed from all followers' cached and live feeds.
3. Lists authored by the user — deleted; followers see "this list is no longer available."
4. Ranking signals — removed from the recommendation engine input; downstream recs recalculate organically.
5. Following / follower relationships — both directions removed.
6. Blocks placed by the user — removed.
7. Hashed contacts rows for the deleted user's phone/email (as the *target*) — deleted.
8. Profile row — deleted.

Blocks placed *against* the deleted user are **retained** for 90 days against the user's hashed phone so that re-signups with the same number re-trigger the block.

### Running the cron manually

```sh
# Replace with the actual invocation for your job runner
pnpm --filter @hone/api tsx tools/jobs/hard-delete-expired-accounts.ts
```

Monitor output for:
- `[hard-delete] processing account_id=<id> deleted_at=<date>` — one line per account.
- `[hard-delete] deleted <N> accounts` — summary on completion.
- Any `ERROR` lines — investigate before re-running.

### If the cron fails partway through

The cron processes accounts in batches and marks each account `hard_deleted_at` upon completion. A failed run can be re-run safely — already-processed accounts are skipped.

1. Check the last successfully processed account in the logs.
2. Re-run the cron. It will pick up accounts that still have `deleted_at < NOW() - INTERVAL '30 days'` and `hard_deleted_at IS NULL`.
3. If a specific account is stuck (repeated failures), inspect the account row directly:

   ```sh
   psql "$DATABASE_URL" -c "SELECT id, deleted_at, hard_deleted_at FROM profiles WHERE id = '<account_id>';"
   ```

4. Open an incident issue labeled `priority:p0` if more than 5 accounts are stuck for more than 24 hours past their grace expiry.

### GDPR export verification

Before hard delete, confirm an export archive exists for users who requested it:

```sh
# List pending export requests not yet fulfilled
psql "$DATABASE_URL" -c "SELECT id, email, gdpr_export_requested_at FROM profiles WHERE gdpr_export_requested_at IS NOT NULL AND gdpr_export_fulfilled_at IS NULL AND deleted_at IS NOT NULL;"
```

Do not hard-delete an account with an unfulfilled GDPR export request. Resolve the export first.

---

## 6. Secrets and Environment Variables

| Variable | Required | Rotation | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | On breach only | PostgreSQL connection string for prod |
| `HMAC_KMS_KEY_ID` | Yes | Monthly (automated) | KMS key identifier for contact hashing |
| `SUPABASE_URL` | Yes | On breach only | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | On breach only | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | On breach only | Never expose to clients |
| `NEXT_PUBLIC_API_URL` | Yes (web) | On URL change | API base URL for the web client |
| `EXPO_PUBLIC_API_URL` | Yes (native) | On URL change | API base URL for the native client |
| `PORT` | No | N/A | Defaults to `8787` |

For the agent swarm secrets (`CLAUDE_CODE_OAUTH_TOKEN`, `BOT_PAT`), see `docs/agent-runbook.md`.
