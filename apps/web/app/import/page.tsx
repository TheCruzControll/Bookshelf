import type { Metadata } from "next";
import { Nav } from "../components/Nav";
import { ImportFlow } from "./ImportFlow";

export const metadata: Metadata = {
  title: "Import · Hone",
  description:
    "Import your Goodreads library: upload a CSV, review matches, then commit.",
};

/**
 * /import — the Goodreads CSV import surface (K-07).
 *
 * The web app has no tRPC client yet (mirrors /search and /discover), so
 * `ImportFlow` defaults to a stub backend that returns canned matches.
 * When the `import.parseAndMatch` and `import.commit` procedures land,
 * swap the stub for a thin shim that forwards to the tRPC client — the
 * `ImportBackend` contract is the seam. Critically, the RSC entry does
 * NOT pass a backend prop, because Next.js forbids passing functions
 * across the server/client boundary; the client component picks the
 * default itself.
 */
export default function ImportPage() {
  return (
    <main className="shell importShell">
      <Nav currentPath="/import" />
      <section className="hero">
        <p className="eyebrow">Import</p>
        <h1>Bring your books over.</h1>
        <p className="lede">
          Upload a Goodreads CSV, review what we matched, then commit.
          Imported books never auto-rank: finished books land in a backlog
          you can rank one-by-one later.
        </p>
      </section>
      <section className="board" aria-label="Goodreads import">
        <ImportFlow />
      </section>
    </main>
  );
}
