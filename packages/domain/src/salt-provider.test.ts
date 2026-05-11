import { describe, it, expect } from "vitest";
import { LocalSaltKeyProvider, createSaltKeyProvider } from "./salt-provider";

describe("LocalSaltKeyProvider", () => {
  it("generates a 64-char hex string (32 bytes)", async () => {
    const provider = new LocalSaltKeyProvider();
    const key = await provider.generateKey();

    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates unique keys on each call", async () => {
    const provider = new LocalSaltKeyProvider();
    const key1 = await provider.generateKey();
    const key2 = await provider.generateKey();

    expect(key1).not.toBe(key2);
  });

  it("generates keys of consistent length", async () => {
    const provider = new LocalSaltKeyProvider();
    const keys = await Promise.all(
      Array.from({ length: 10 }, () => provider.generateKey())
    );

    for (const key of keys) {
      expect(key).toHaveLength(64);
    }
  });
});

describe("createSaltKeyProvider", () => {
  it("returns LocalSaltKeyProvider when no KMS_REGION is set", () => {
    const provider = createSaltKeyProvider();
    expect(provider).toBeInstanceOf(LocalSaltKeyProvider);
  });

  it("returns LocalSaltKeyProvider when env is undefined", () => {
    const provider = createSaltKeyProvider(undefined);
    expect(provider).toBeInstanceOf(LocalSaltKeyProvider);
  });

  it("returns LocalSaltKeyProvider when KMS_REGION is empty", () => {
    const provider = createSaltKeyProvider({ KMS_REGION: "" });
    expect(provider).toBeInstanceOf(LocalSaltKeyProvider);
  });

  it("returns KmsSaltKeyProvider when KMS_REGION is set", () => {
    const provider = createSaltKeyProvider({ KMS_REGION: "us-east-1" });
    // We can't check instanceof KmsSaltKeyProvider since it's not exported directly,
    // but we can verify it's not a LocalSaltKeyProvider
    expect(provider).not.toBeInstanceOf(LocalSaltKeyProvider);
  });

  it("returns KmsSaltKeyProvider when KMS_REGION is provided", () => {
    const provider = createSaltKeyProvider({
      KMS_REGION: "us-west-2",
    });
    expect(provider).not.toBeInstanceOf(LocalSaltKeyProvider);
  });
});
