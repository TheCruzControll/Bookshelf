/**
 * Purge-disabled-contacts cron entry point (#98, J-06).
 *
 * Hard-deletes every `contacts_index` row that was soft-disabled by
 * `contacts.disableSync` more than 24h ago, satisfying the PRD J-06
 * SLA: "disabling sync deletes index rows within 24h."
 *
 * Designed to be invoked once per run by an external scheduler
 * (e.g. a Kubernetes CronJob, GitHub Actions schedule, or systemd
 * timer). This module intentionally does NOT pull in a scheduler
 * dependency.
 *
 * Recommended cadence: daily, off-peak (e.g. 03:30 UTC).
 *
 * Invocation (via pnpm):
 *
 *     pnpm --filter @hone/api run purge-disabled-contacts
 *
 * Requires the same env vars as the API server (notably
 * `DATABASE_URL`). The process exits 0 on success (printing the
 * number of purged rows) and 1 on failure.
 */
import { env } from "@hone/config-env";
import { createDb, createDrizzleRepositories } from "@hone/db";
import { ContactsService } from "@hone/domain";

export async function runPurgeDisabledContactsJob(): Promise<number> {
  const db = createDb(env.DATABASE_URL);
  const repos = createDrizzleRepositories(db);
  const service = new ContactsService(
    repos.contacts,
    repos.emailIndex,
    repos.blocks,
  );
  return service.purgeDisabled();
}

async function main() {
  try {
    const purged = await runPurgeDisabledContactsJob();
    console.log(JSON.stringify({ job: "purge-disabled-contacts", purged }));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({
      job: "purge-disabled-contacts",
      error: err instanceof Error ? err.message : String(err),
    }));
    process.exit(1);
  }
}

// Run only when invoked as a script (not when imported by tests).
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("purge-disabled-contacts.ts") === true ||
  process.argv[1]?.endsWith("purge-disabled-contacts.js") === true;
if (invokedDirectly) {
  void main();
}
