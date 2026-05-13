/**
 * APNs (Apple Push Notification service) provider (Q-02, #146).
 *
 * Uses Apple's HTTP/2 provider API with token-based authentication
 * (signed ES256 JWT). The implementation is portable to any runtime
 * that supports the WebCrypto subtle API and `fetch`.
 *
 * Apple's docs:
 *   https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/sending_notification_requests_to_apns
 *
 * Provider tokens are short-lived (Apple recommends ≤ 60 minutes) and
 * are cached in-memory. Re-signing is automatic on TTL expiry.
 */

import { subtle } from "node:crypto";
import type { PushPayload, PushProvider, PushSendResult } from "@hone/domain";

const APNS_PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes; safely under Apple's 60-minute cap

export interface ApnsProviderConfig {
  /** Apple Developer Team ID, e.g. "ABCD1E2F3G". */
  teamId: string;
  /** APNs Auth Key ID, e.g. "K1234ABCD5". */
  keyId: string;
  /** PKCS#8-encoded ES256 private key (PEM string). */
  privateKeyPem: string;
  /** App bundle id, e.g. "com.hone.app". Sent as `apns-topic`. */
  bundleId: string;
  /** APNs host. Defaults to production. */
  host?: "https://api.push.apple.com" | "https://api.sandbox.push.apple.com";
  /** Optional fetch implementation override (testing). */
  fetchImpl?: typeof globalThis.fetch;
  /** Optional clock override (testing). */
  now?: () => number;
}

interface CachedToken {
  jwt: string;
  expiresAt: number;
}

/**
 * The node:crypto `subtle` typing differs slightly from lib.dom's `SubtleCrypto`
 * (extra `encapsulateBits` etc.). We treat the imported key as opaque so the
 * import/sign types stay aligned with node's implementation.
 */
type OpaqueCryptoKey = Awaited<ReturnType<typeof subtle.importKey>>;

function base64UrlEncode(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
  return Buffer.from(bin, "binary").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): Uint8Array {
  const stripped = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(Buffer.from(stripped, "base64"));
}

export class ApnsProvider implements PushProvider {
  readonly supportedPlatforms = new Set(["apns" as const]);
  private cachedToken: CachedToken | null = null;
  private cryptoKey: OpaqueCryptoKey | null = null;

  constructor(private readonly config: ApnsProviderConfig) {}

  /** Build (and cache) a signed ES256 provider JWT. */
  private async getProviderToken(): Promise<string> {
    const now = (this.config.now ?? Date.now)();
    if (this.cachedToken && now < this.cachedToken.expiresAt) {
      return this.cachedToken.jwt;
    }

    if (!this.cryptoKey) {
      this.cryptoKey = await subtle.importKey(
        "pkcs8",
        pemToPkcs8(this.config.privateKeyPem),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
    }

    const header = { alg: "ES256", kid: this.config.keyId };
    const payload = { iss: this.config.teamId, iat: Math.floor(now / 1000) };
    const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const signingInput = `${headerB64}.${payloadB64}`;

    const cryptoKey: OpaqueCryptoKey = this.cryptoKey;
    const signature = await subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      new TextEncoder().encode(signingInput),
    );
    const sigB64 = base64UrlEncode(new Uint8Array(signature));
    const jwt = `${signingInput}.${sigB64}`;

    this.cachedToken = { jwt, expiresAt: now + APNS_PROVIDER_TOKEN_TTL_MS };
    return jwt;
  }

  async send(input: {
    token: string;
    platform: "apns" | "fcm";
    payload: PushPayload;
  }): Promise<PushSendResult> {
    if (input.platform !== "apns") {
      return { ok: false, reason: "unsupported_platform" };
    }
    const fetchImpl = this.config.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      return { ok: false, reason: "upstream_error", message: "fetch is not available" };
    }

    const providerToken = await this.getProviderToken();
    const host = this.config.host ?? "https://api.push.apple.com";
    const body = JSON.stringify({
      aps: {
        alert: { title: input.payload.title, body: input.payload.body },
        sound: "default",
      },
      trigger: input.payload.trigger,
      ...(input.payload.data ?? {}),
    });

    const res = await fetchImpl(`${host}/3/device/${input.token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${providerToken}`,
        "apns-topic": this.config.bundleId,
        "apns-push-type": "alert",
        "content-type": "application/json",
      },
      body,
    });

    if (res.status === 200) return { ok: true };

    // 400 + BadDeviceToken / 410 Gone → invalid token (Apple's docs).
    if (res.status === 410) {
      return { ok: false, reason: "invalid_token", status: res.status };
    }
    if (res.status === 400) {
      let reason: PushSendResult = { ok: false, reason: "upstream_error", status: res.status };
      try {
        const json = (await res.json()) as { reason?: string };
        if (json.reason === "BadDeviceToken" || json.reason === "DeviceTokenNotForTopic") {
          reason = { ok: false, reason: "invalid_token", status: res.status, message: json.reason };
        } else if (json.reason) {
          reason = { ok: false, reason: "upstream_error", status: res.status, message: json.reason };
        }
      } catch {
        // ignore parse failure; fall through to generic upstream_error
      }
      return reason;
    }
    if (res.status === 429) {
      return { ok: false, reason: "rate_limited", status: res.status };
    }
    return { ok: false, reason: "upstream_error", status: res.status };
  }
}
