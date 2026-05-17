import { describe, it, expect } from "vitest";
import { submitManualBookAction } from "./submitManualBook";

describe("submitManualBookAction (G-05, #79 — server validation)", () => {
  it("resolves for a valid payload", async () => {
    await expect(
      submitManualBookAction({
        title: "Foundation",
        authors: ["Isaac Asimov"],
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves for a payload that includes every optional field", async () => {
    await expect(
      submitManualBookAction({
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
      submitManualBookAction({
        // Cast through unknown to bypass the compile-time guard so we
        // can prove the runtime schema also rejects the call. This is
        // the same surface a hand-crafted POST would hit.
        ...{
          title: "",
          authors: ["Isaac Asimov"],
        },
      } as unknown as Parameters<typeof submitManualBookAction>[0]),
    ).rejects.toThrow();
  });

  it("rejects an empty authors array", async () => {
    await expect(
      submitManualBookAction({
        ...{
          title: "Foundation",
          authors: [],
        },
      } as unknown as Parameters<typeof submitManualBookAction>[0]),
    ).rejects.toThrow();
  });

  it("rejects a payload missing the title key entirely", async () => {
    await expect(
      submitManualBookAction({
        ...{ authors: ["Isaac Asimov"] },
      } as unknown as Parameters<typeof submitManualBookAction>[0]),
    ).rejects.toThrow();
  });
});
