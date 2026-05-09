import { describe, it, expect } from "vitest";
import { fetchCurrentHandleForOldHandle } from "./handle-redirect";

describe("fetchCurrentHandleForOldHandle", () => {
  it("returns null when no redirect exists for the handle", async () => {
    const result = await fetchCurrentHandleForOldHandle("oldhandle");
    expect(result).toBeNull();
  });

  it("returns null for an empty string handle", async () => {
    const result = await fetchCurrentHandleForOldHandle("");
    expect(result).toBeNull();
  });
});
