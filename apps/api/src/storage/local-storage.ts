/**
 * Local filesystem-backed `StorageProvider` for dev and tests.
 *
 * Writes the supplied blob to a temporary directory (defaulting to
 * `os.tmpdir()/hone-exports`) under the caller-supplied key and
 * returns a `file://` URL plus an expiry timestamp computed from
 * `expiresInMs`.
 *
 * This adapter does NOT enforce the expiry — it merely reports it.
 * Real expiry enforcement requires an object store that supports
 * presigned URLs (S3 / GCS / R2 / Supabase Storage). In production,
 * swap this implementation out for a presigning adapter; see the
 * `StorageProvider` port in `packages/domain/src/ports.ts`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { StorageProvider } from "@hone/domain";

export interface LocalStorageOptions {
  /** Root directory for blob writes. Defaults to `os.tmpdir()/hone-exports`. */
  rootDir?: string;
  /** Override the clock — primarily for tests. */
  now?: () => Date;
}

export class LocalFileStorageProvider implements StorageProvider {
  private readonly rootDir: string;
  private readonly now: () => Date;

  constructor(options: LocalStorageOptions = {}) {
    this.rootDir = options.rootDir ?? join(tmpdir(), "hone-exports");
    this.now = options.now ?? (() => new Date());
  }

  async putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    expiresInMs: number;
  }): Promise<{ url: string; expiresAt: Date }> {
    const target = join(this.rootDir, input.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.body);
    const expiresAt = new Date(this.now().getTime() + input.expiresInMs);
    return { url: pathToFileURL(target).toString(), expiresAt };
  }
}
