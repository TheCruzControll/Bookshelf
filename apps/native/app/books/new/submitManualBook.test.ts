import { describe, it, expect } from "vitest";
import { submitManualBook } from "./submitManualBook";

describe("submitManualBook (native, G-06, #80 — defense in depth)", () => {
  it("resolves for a valid minimal payload", async () => {
    await expect(
      submitManualBook({
        title: "Foundation",
        authors: ["Isaac Asimov"],
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves for a payload that includes every optional field", async () => {
    await expect(
      submitManualBook({
        title: "Dune",
        authors: ["Frank Herbert"],
        isbn: "9780553293357",
        year: 1965,
        coverUrl: "https://example.com/dune.jpg",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects an empty title (server-side defense in depth)", async () => {
    await expect(
      submitManualBook({
        // Cast through unknown to bypass the compile-time guard so we
        // can prove the runtime schema also rejects the call. This is
        // the same surface a hand-crafted call would hit.
        ...{
          title: "",
          authors: ["Isaac Asimov"],
        },
      } as unknown as Parameters<typeof submitManualBook>[0]),
    ).rejects.toThrow();
  });

  it("rejects an empty authors array", async () => {
    await expect(
      submitManualBook({
        ...{
          title: "Foundation",
          authors: [],
        },
      } as unknown as Parameters<typeof submitManualBook>[0]),
    ).rejects.toThrow();
  });

  it("rejects a payload missing the title key entirely", async () => {
    await expect(
      submitManualBook({
        ...{ authors: ["Isaac Asimov"] },
      } as unknown as Parameters<typeof submitManualBook>[0]),
    ).rejects.toThrow();
  });

  it("rejects a malformed cover URL", async () => {
    await expect(
      submitManualBook({
        ...{
          title: "Dune",
          authors: ["Frank Herbert"],
          coverUrl: "not-a-url",
        },
      } as unknown as Parameters<typeof submitManualBook>[0]),
    ).rejects.toThrow();
  });

  it("rejects a year above the schema's upper bound", async () => {
    await expect(
      submitManualBook({
        ...{
          title: "Dune",
          authors: ["Frank Herbert"],
          year: 10000,
        },
      } as unknown as Parameters<typeof submitManualBook>[0]),
    ).rejects.toThrow();
  });
});
