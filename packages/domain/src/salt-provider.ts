import { randomBytes } from "node:crypto";
import type { SaltKeyProvider } from "./ports";

/**
 * Local development stub for SaltKeyProvider.
 * Generates cryptographically random key material using Node.js crypto.
 * Suitable for development and testing — NOT for production use.
 */
export class LocalSaltKeyProvider implements SaltKeyProvider {
  async generateKey(): Promise<string> {
    return randomBytes(32).toString("hex");
  }
}

/**
 * AWS KMS adapter for SaltKeyProvider.
 * Generates HMAC key material via KMS GenerateRandom.
 *
 * In production, this uses AWS KMS to generate cryptographically secure
 * random bytes for HMAC keys. The key material is returned as a hex string
 * and stored encrypted-at-rest in the salts table.
 *
 * Requires:
 * - AWS credentials configured (IAM role, env vars, or shared credentials)
 * - KMS permissions: kms:GenerateRandom
 * - @aws-sdk/client-kms installed as a peer dependency in the deploying app
 */
export class KmsSaltKeyProvider implements SaltKeyProvider {
  private readonly region: string;
  private readonly kmsKeyId: string | undefined;

  constructor(region: string, kmsKeyId?: string) {
    this.region = region;
    this.kmsKeyId = kmsKeyId;
  }

  async generateKey(): Promise<string> {
    // Dynamic import avoids bundling @aws-sdk/client-kms in dev/test.
    // The module is only required at runtime in production deployments.
    const kms: Record<string, unknown> = await (Function(
      'return import("@aws-sdk/client-kms")',
    )() as Promise<Record<string, unknown>>);

    const KMSClient = kms.KMSClient as new (
      config: { region: string },
    ) => { send: (cmd: unknown) => Promise<{ Plaintext?: Uint8Array }> };

    const GenerateRandomCommand = kms.GenerateRandomCommand as new (
      input: { NumberOfBytes: number },
    ) => unknown;

    const client = new KMSClient({ region: this.region });
    const command = new GenerateRandomCommand({ NumberOfBytes: 32 });

    const response = await client.send(command);
    if (!response.Plaintext) {
      throw new Error("KMS GenerateRandom returned no plaintext");
    }

    return Buffer.from(response.Plaintext).toString("hex");
  }
}

/**
 * Factory to create the appropriate SaltKeyProvider based on environment.
 *
 * When KMS_REGION is set, uses KMS. Otherwise falls back to local random.
 */
export function createSaltKeyProvider(env?: {
  KMS_REGION?: string;
  KMS_KEY_ID?: string;
}): SaltKeyProvider {
  if (env?.KMS_REGION) {
    return new KmsSaltKeyProvider(env.KMS_REGION, env.KMS_KEY_ID);
  }
  return new LocalSaltKeyProvider();
}
