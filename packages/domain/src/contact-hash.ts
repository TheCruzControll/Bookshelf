import { createHmac } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Represents a salt version used for HMAC hashing.
 * The version rotates monthly; older hashes must be re-computed when the salt changes.
 */
export interface SaltVersion {
  /** Opaque version identifier (e.g. "2026-05") */
  version: string;
  /** The secret key material — must never be logged or persisted in plaintext */
  key: string;
}

/**
 * Result of hashing a contact identifier.
 */
export interface ContactHash {
  /** The HMAC-SHA-256 hex digest */
  hash: string;
  /** The salt version used to produce this hash */
  saltVersion: string;
}

/**
 * Normalizes a phone number to E.164 format using libphonenumber-js.
 *
 * @param phone - Raw phone string (may include country code, spaces, dashes, parens)
 * @param defaultCountry - ISO 3166-1 alpha-2 fallback country code (default: "US")
 * @returns E.164 string (e.g. "+14155551234") or null if the number is invalid
 */
export function normalizePhone(
  phone: string,
  defaultCountry: string = "US",
): string | null {
  const parsed = parsePhoneNumberFromString(
    phone,
    defaultCountry as Parameters<typeof parsePhoneNumberFromString>[1],
  );
  if (!parsed || !parsed.isValid()) {
    return null;
  }
  return parsed.format("E.164");
}

/**
 * Normalizes an email for hashing: lowercase + trim.
 *
 * @param email - Raw email string
 * @returns Normalized email string
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Computes an HMAC-SHA-256 hash of the given value using the provided salt.
 * This is the core hashing primitive — callers should normalize inputs first.
 *
 * @param value - The normalized identifier (E.164 phone or lowercased email)
 * @param salt - The current salt version containing the HMAC key
 * @returns ContactHash with the hex digest and salt version
 */
export function hmacHash(value: string, salt: SaltVersion): ContactHash {
  const mac = createHmac("sha256", salt.key);
  mac.update(value);
  return {
    hash: mac.digest("hex"),
    saltVersion: salt.version,
  };
}

/**
 * Hashes a phone number for contact matching.
 * Normalizes to E.164 first, then applies HMAC-SHA-256.
 *
 * @param phone - Raw phone string
 * @param salt - Current salt version
 * @param defaultCountry - Fallback country code for parsing (default: "US")
 * @returns ContactHash or null if phone is invalid
 */
export function hashPhone(
  phone: string,
  salt: SaltVersion,
  defaultCountry: string = "US",
): ContactHash | null {
  const normalized = normalizePhone(phone, defaultCountry);
  if (normalized === null) {
    return null;
  }
  return hmacHash(normalized, salt);
}

/**
 * Hashes an email for contact matching.
 * Normalizes (trim + lowercase) then applies HMAC-SHA-256.
 *
 * @param email - Raw email string
 * @param salt - Current salt version
 * @returns ContactHash
 */
export function hashEmail(email: string, salt: SaltVersion): ContactHash {
  const normalized = normalizeEmail(email);
  return hmacHash(normalized, salt);
}
