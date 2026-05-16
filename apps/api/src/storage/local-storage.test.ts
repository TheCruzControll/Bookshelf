/**
 * Unit tests for the local-filesystem `StorageProvider` dev adapter
 * (issue #153). The real production adapter uses presigned URLs on
 * an object store; this one writes to a temp directory and returns a
 * `file://` URL — the contract that callers depend on is identical.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalFileStorageProvider } from "./local-storage";

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "hone-export-test-"));
});

describe("LocalFileStorageProvider", () => {
  it("writes the supplied bytes to the storage key and returns a file:// URL", async () => {
    const storage = new LocalFileStorageProvider({ rootDir });
    const body = new TextEncoder().encode("hello");

    const { url, expiresAt } = await storage.putObject({
      key: "exports/u1/test.bin",
      body,
      contentType: "application/octet-stream",
      expiresInMs: 60_000,
    });

    expect(url.startsWith("file://")).toBe(true);
    const filePath = fileURLToPath(url);
    expect(filePath).toBe(join(rootDir, "exports/u1/test.bin"));
    const onDisk = await readFile(filePath);
    expect(onDisk.equals(Buffer.from(body))).toBe(true);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    await rm(filePath);
  });

  it("honours the injected clock when computing expiresAt", async () => {
    const fixed = new Date("2026-05-16T12:00:00Z");
    const storage = new LocalFileStorageProvider({ rootDir, now: () => fixed });
    const { expiresAt } = await storage.putObject({
      key: "exports/u2/test.bin",
      body: new Uint8Array([1, 2, 3]),
      contentType: "application/octet-stream",
      expiresInMs: 10_000,
    });

    expect(expiresAt.getTime()).toBe(fixed.getTime() + 10_000);
  });

  it("creates nested directories on demand", async () => {
    const storage = new LocalFileStorageProvider({ rootDir });
    const { url } = await storage.putObject({
      key: "deeply/nested/path/file.bin",
      body: new Uint8Array([42]),
      contentType: "application/octet-stream",
      expiresInMs: 1000,
    });
    const filePath = fileURLToPath(url);
    expect(filePath).toBe(join(rootDir, "deeply/nested/path/file.bin"));
    const bytes = await readFile(filePath);
    expect(bytes).toEqual(Buffer.from([42]));
  });
});
