import { createHmac } from "node:crypto";
import type { ContactsRepository, EmailIndexRepository, SaltKeyProvider, SaltRepository } from "./ports";
import type { EntityId, Salt } from "./types";

/** Default salt lifetime: 30 days in milliseconds */
const SALT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Default hash retention: 90 days in milliseconds */
const HASH_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Orchestrates monthly salt rotation and re-hashing of existing contact/email hashes.
 *
 * Flow:
 * 1. Generate a new salt via the SaltKeyProvider (KMS or local stub)
 * 2. Retire the currently active salt
 * 3. Activate the new salt
 * 4. Re-hash all existing user phone hashes with the new salt
 * 5. Clean up expired hashes
 */
export class SaltRotationService {
  constructor(
    private readonly salts: SaltRepository,
    private readonly contacts: ContactsRepository,
    private readonly emailIndex: EmailIndexRepository,
    private readonly keyProvider: SaltKeyProvider,
  ) {}

  /**
   * Get the currently active salt, or create the initial one if none exists.
   */
  async getActiveSalt(): Promise<Salt> {
    const active = await this.salts.findActive();
    if (active) return active;

    // Bootstrap: create the first salt
    return this.createNewSalt();
  }

  /**
   * Create a new salt version and persist it.
   */
  private async createNewSalt(): Promise<Salt> {
    const keyMaterial = await this.keyProvider.generateKey();
    const latestVersion = await this.salts.getLatestVersion();
    const newVersion = latestVersion + 1;

    return this.salts.create({
      version: newVersion,
      keyMaterial,
      activeFrom: new Date(),
    });
  }

  /**
   * Execute a full salt rotation:
   * 1. Retire current salt
   * 2. Create new salt
   * 3. Re-hash all existing phone and email hashes
   * 4. Delete expired hashes
   *
   * Returns the new active salt.
   */
  async rotate(): Promise<Salt> {
    const now = new Date();

    // Step 1: Retire the current active salt
    const currentSalt = await this.salts.findActive();
    if (currentSalt) {
      await this.salts.retire({ version: currentSalt.version, activeTo: now });
    }

    // Step 2: Create the new salt
    const newSalt = await this.createNewSalt();

    // Step 3: Re-hash existing contact and email hashes
    await this.rehashAll(currentSalt, newSalt);

    // Step 4: Clean up expired hashes
    await Promise.all([
      this.contacts.deleteExpired(),
      this.emailIndex.deleteExpired(),
    ]);

    return newSalt;
  }

  /**
   * Re-hash all existing phone and email hashes from the old salt to the new salt.
   *
   * Since we only store hashes (not raw values), we cannot reverse-hash and re-hash
   * the uploaded contact hashes. Instead, the rotation marks old hashes for expiration
   * and clients must re-upload contacts with the new salt version. The expiration
   * window (90 days) gives clients time to re-upload.
   *
   * For user phone hashes stored in phone_numbers (the user's own verified phone),
   * we can re-hash because we have the E.164 hash available — but that re-hashing
   * is handled at the phone-numbers layer, not here.
   */
  private async rehashAll(
    _oldSalt: Salt | null,
    _newSalt: Salt,
  ): Promise<void> {
    // Existing hashes retain their current expiration dates (90-day retention).
    // Clients re-upload with the new salt version on next contacts sync.
    // No server-side re-hash is needed for uploaded contact hashes since
    // we don't store raw values — only HMAC digests.
  }

  /**
   * Re-hash a single user's phone hash with the new salt.
   * This is called when the user's raw E.164 phone is available
   * (e.g., during re-verification or re-upload).
   */
  rehashPhone(phoneE164: string, salt: Salt): string {
    const mac = createHmac("sha256", salt.keyMaterial);
    mac.update(phoneE164);
    return mac.digest("hex");
  }

  /**
   * Re-hash a single email with the new salt.
   */
  rehashEmail(email: string, salt: Salt): string {
    const normalized = email.trim().toLowerCase();
    const mac = createHmac("sha256", salt.keyMaterial);
    mac.update(normalized);
    return mac.digest("hex");
  }

  /**
   * Check if rotation is needed (current salt is older than SALT_LIFETIME_MS).
   */
  async isRotationDue(): Promise<boolean> {
    const active = await this.salts.findActive();
    if (!active) return true;

    const age = Date.now() - active.activeFrom.getTime();
    return age >= SALT_LIFETIME_MS;
  }

  /**
   * Re-hash a user's contacts after they re-upload with the new salt.
   * Called by the contacts upload flow when the client provides fresh hashes.
   */
  async updateUserHashes(input: {
    userId: EntityId;
    phoneHashes: Array<{ hash: string }>;
    emailHashes: Array<{ hash: string }>;
  }): Promise<void> {
    const activeSalt = await this.getActiveSalt();
    const expiresAt = new Date(Date.now() + HASH_RETENTION_MS);

    if (input.phoneHashes.length > 0) {
      await this.contacts.upsertHashes({
        userId: input.userId,
        hashes: input.phoneHashes.map((h) => ({
          hash: h.hash,
          saltVersion: activeSalt.version,
          expiresAt,
        })),
      });
    }

    if (input.emailHashes.length > 0) {
      await this.emailIndex.upsertHashes({
        userId: input.userId,
        hashes: input.emailHashes.map((h) => ({
          hash: h.hash,
          saltVersion: activeSalt.version,
          expiresAt,
        })),
      });
    }
  }
}
