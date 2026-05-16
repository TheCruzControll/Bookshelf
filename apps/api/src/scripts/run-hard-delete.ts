/**
 * Hard-delete cron entry point (#152, R-02).
 *
 * Hard-deletes every account whose 30-day grace period has elapsed.
 * Designed to be invoked once per run by an external scheduler
 * (e.g. a Kubernetes CronJob, GitHub Actions schedule, or systemd
 * timer). This module intentionally does NOT pull in a scheduler
 * dependency.
 *
 * Recommended cadence: daily, off-peak (e.g. 03:00 UTC).
 *
 * Invocation (via pnpm):
 *
 *     pnpm --filter @hone/api run hard-delete
 *
 * Requires the same env vars as the API server (notably
 * `DATABASE_URL`). The process exits 0 on success (printing the
 * number of purged accounts) and 1 on failure.
 */
import { env } from "@hone/config-env";
import { createDb, createDrizzleRepositories } from "@hone/db";
import { AccountDeletionService } from "@hone/domain";

export async function runHardDeleteJob(): Promise<number> {
  const db = createDb(env.DATABASE_URL);
  const repos = createDrizzleRepositories(db);
  const service = new AccountDeletionService(
    repos.accountDeletions,
    repos.sessions,
  );
  return service.runHardDelete();
}

async function main() {
  try {
    const purged = await runHardDeleteJob();
    console.log(JSON.stringify({ job: "hard-delete", purged }));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({
      job: "hard-delete",
      error: err instanceof Error ? err.message : String(err),
    }));
    process.exit(1);
  }
}

// Run only when invoked as a script (not when imported by tests).
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("run-hard-delete.ts") === true ||
  process.argv[1]?.endsWith("run-hard-delete.js") === true;
if (invokedDirectly) {
  void main();
}
