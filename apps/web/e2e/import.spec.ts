import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

/**
 * E2E: import goodreads → conflict resolution → confirm (#173).
 *
 * Drives the /import flow end-to-end through the stub backend that ships
 * with #106 (the real `import.parseAndMatch` / `import.commit` tRPC
 * procedures do not exist yet). The stub returns the same canned 5-row
 * preview regardless of the uploaded file contents, so we still upload
 * the real `conflict.csv` fixture from #107 to satisfy the AC ("uses
 * fixture CSV") without depending on server-side parsing.
 *
 * AC coverage (issue #173):
 *  - "Uses fixture CSV" — packages/test-fixtures/.../goodreads/conflict.csv.
 *  - "Conflict bucket interaction asserted" — toggling the overwrite
 *    checkbox on the conflict row flips the per-row decision state and
 *    is reflected in the confirm summary (`Conflicts overwritten` count).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_CSV = path.resolve(
  HERE,
  "../../../packages/test-fixtures/src/fixtures/goodreads/conflict.csv",
);

test.describe("/import — Goodreads CSV → review → conflict toggle → commit", () => {
  test("uploads the fixture, asserts buckets, overrides conflict, commits", async ({
    page,
  }) => {
    // 1. Load the import page.
    await page.goto("/import");
    await expect(page.getByTestId("import-flow")).toBeVisible();
    await expect(page.getByTestId("import-upload-step")).toBeVisible();

    // 2. Upload the conflict fixture CSV. The stub backend ignores the
    //    file body and always returns the canned 5-row preview, but we
    //    still pass the real fixture to satisfy AC ("uses fixture CSV").
    await page.getByTestId("import-csv-input").setInputFiles(FIXTURE_CSV);

    // 3. Wait for the review screen. The progress step may flash too
    //    quickly to assert reliably in CI, so we go straight to review.
    await expect(page.getByTestId("import-review-step")).toBeVisible();
    await expect(page.getByTestId("import-progress-label")).toHaveText(
      "Ready for review.",
    );

    // 4. All four buckets render with their canned counts:
    //    matched=2, needs_review=1, conflict=1, unmatched=1.
    await expect(page.getByTestId("import-bucket-matched")).toBeVisible();
    await expect(page.getByTestId("import-bucket-needs_review")).toBeVisible();
    await expect(page.getByTestId("import-bucket-conflict")).toBeVisible();
    await expect(page.getByTestId("import-bucket-unmatched")).toBeVisible();

    await expect(page.getByTestId("import-bucket-matched-count")).toHaveText(
      "(2)",
    );
    await expect(
      page.getByTestId("import-bucket-needs_review-count"),
    ).toHaveText("(1)");
    await expect(page.getByTestId("import-bucket-conflict-count")).toHaveText(
      "(1)",
    );
    await expect(page.getByTestId("import-bucket-unmatched-count")).toHaveText(
      "(1)",
    );

    // 5. Conflict bucket interaction — gr-4 (Dune).
    //    Default decision: apply=false, overwriteConflict=false.
    //    Toggle "include in import" on, then toggle the overwrite checkbox
    //    on, and assert both checkboxes reflect the new state.
    const conflictRow = page.getByTestId("import-row-gr-4");
    await expect(conflictRow).toBeVisible();
    await expect(
      page.getByTestId("import-row-gr-4-current-status"),
    ).toHaveText("reading");

    const conflictApply = page.getByTestId("import-row-gr-4-apply");
    const conflictOverwrite = page.getByTestId("import-row-gr-4-overwrite");
    await expect(conflictApply).not.toBeChecked();
    await expect(conflictOverwrite).not.toBeChecked();

    await conflictApply.check();
    await conflictOverwrite.check();
    await expect(conflictApply).toBeChecked();
    await expect(conflictOverwrite).toBeChecked();

    // 6. Continue to confirm step and assert the summary reflects the
    //    overwrite decision. The canned data has 2 matched rows applied
    //    by default plus the conflict row we just opted-in to, for 3
    //    applied total and 1 conflict overwritten.
    await page.getByTestId("import-review-continue").click();
    await expect(page.getByTestId("import-confirm-step")).toBeVisible();
    await expect(page.getByTestId("import-confirm-applied")).toHaveText("3");
    await expect(page.getByTestId("import-confirm-overwrites")).toHaveText(
      "1",
    );

    // 7. Commit and assert success state.
    await page.getByTestId("import-confirm-submit").click();
    await expect(page.getByTestId("import-done-step")).toBeVisible();
    await expect(page.getByTestId("import-progress-label")).toHaveText(
      "Import complete.",
    );
    await expect(page.getByTestId("import-done-restart")).toBeVisible();
  });
});
