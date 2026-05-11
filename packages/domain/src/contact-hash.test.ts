import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  normalizePhone,
  normalizeEmail,
  hmacHash,
  hashPhone,
  hashEmail,
  type SaltVersion,
} from "./contact-hash";

const testSalt: SaltVersion = {
  version: "2026-05",
  key: "test-secret-key-for-hmac-hashing",
};

const altSalt: SaltVersion = {
  version: "2026-06",
  key: "different-secret-key-for-next-month",
};

describe("normalizePhone", () => {
  it("normalizes a US number with country code to E.164", () => {
    expect(normalizePhone("+1 (415) 555-1234")).toBe("+14155551234");
  });

  it("normalizes a US number without country code using default country", () => {
    expect(normalizePhone("(415) 555-1234", "US")).toBe("+14155551234");
  });

  it("normalizes a UK number", () => {
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
  });

  it("normalizes a number with dashes and spaces", () => {
    expect(normalizePhone("415-555-1234", "US")).toBe("+14155551234");
  });

  it("returns null for an invalid phone number", () => {
    expect(normalizePhone("not-a-phone")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for a too-short number", () => {
    expect(normalizePhone("123", "US")).toBeNull();
  });

  it("handles numbers with leading/trailing whitespace", () => {
    expect(normalizePhone("  +14155551234  ")).toBe("+14155551234");
  });
});

describe("normalizeEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeEmail("USER@Example.COM")).toBe("user@example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("handles already-normalized email", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });
});

describe("hmacHash", () => {
  it("returns a hex string of 64 characters (SHA-256)", () => {
    const result = hmacHash("+14155551234", testSalt);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("includes the salt version in the result", () => {
    const result = hmacHash("+14155551234", testSalt);
    expect(result.saltVersion).toBe("2026-05");
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = hmacHash("+14155551234", testSalt);
    const hash2 = hmacHash("+14155559999", testSalt);
    expect(hash1.hash).not.toBe(hash2.hash);
  });

  it("produces different hashes for the same input with different salts", () => {
    const hash1 = hmacHash("+14155551234", testSalt);
    const hash2 = hmacHash("+14155551234", altSalt);
    expect(hash1.hash).not.toBe(hash2.hash);
  });

  it("produces the same hash for the same input and salt", () => {
    const hash1 = hmacHash("+14155551234", testSalt);
    const hash2 = hmacHash("+14155551234", testSalt);
    expect(hash1.hash).toBe(hash2.hash);
  });
});

describe("hashPhone", () => {
  it("returns a ContactHash for a valid phone", () => {
    const result = hashPhone("+14155551234", testSalt);
    expect(result).not.toBeNull();
    expect(result!.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result!.saltVersion).toBe("2026-05");
  });

  it("returns null for an invalid phone", () => {
    const result = hashPhone("invalid", testSalt);
    expect(result).toBeNull();
  });

  it("produces the same hash regardless of input formatting", () => {
    const hash1 = hashPhone("+1 (415) 555-1234", testSalt);
    const hash2 = hashPhone("4155551234", testSalt, "US");
    const hash3 = hashPhone("415-555-1234", testSalt, "US");
    expect(hash1).not.toBeNull();
    expect(hash2).not.toBeNull();
    expect(hash3).not.toBeNull();
    expect(hash1!.hash).toBe(hash2!.hash);
    expect(hash1!.hash).toBe(hash3!.hash);
  });

  it("uses the default country when no country code is provided", () => {
    const result = hashPhone("4155551234", testSalt, "US");
    expect(result).not.toBeNull();
    expect(result!.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("hashEmail", () => {
  it("returns a ContactHash for an email", () => {
    const result = hashEmail("user@example.com", testSalt);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.saltVersion).toBe("2026-05");
  });

  it("produces the same hash regardless of case and whitespace", () => {
    const hash1 = hashEmail("user@example.com", testSalt);
    const hash2 = hashEmail("  USER@Example.COM  ", testSalt);
    expect(hash1.hash).toBe(hash2.hash);
  });

  it("produces different hashes for different emails", () => {
    const hash1 = hashEmail("user1@example.com", testSalt);
    const hash2 = hashEmail("user2@example.com", testSalt);
    expect(hash1.hash).not.toBe(hash2.hash);
  });
});

describe("contact hash property tests", () => {
  it("same input + same salt version = same hash (deterministic)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (input) => {
        const hash1 = hmacHash(input, testSalt);
        const hash2 = hmacHash(input, testSalt);
        return hash1.hash === hash2.hash;
      }),
    );
  });

  it("different salt versions produce different hashes", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (input) => {
        const hash1 = hmacHash(input, testSalt);
        const hash2 = hmacHash(input, altSalt);
        return hash1.hash !== hash2.hash;
      }),
    );
  });

  it("hash output is always 64 hex characters", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = hmacHash(input, testSalt);
        return /^[a-f0-9]{64}$/.test(result.hash);
      }),
    );
  });

  it("hash output always carries the salt version", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = hmacHash(input, testSalt);
        return result.saltVersion === testSalt.version;
      }),
    );
  });

  it("normalizeEmail is idempotent", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const once = normalizeEmail(email);
        const twice = normalizeEmail(once);
        return once === twice;
      }),
    );
  });

  it("email hashing is case-insensitive", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const lower = hashEmail(email.toLowerCase(), testSalt);
        const upper = hashEmail(email.toUpperCase(), testSalt);
        return lower.hash === upper.hash;
      }),
    );
  });
});
