/**
 * Push notification port + sender service (Q-02, #146).
 *
 * The actual delivery to APNs / FCM is performed by adapters wired in
 * `apps/api`. This module owns the port contract and the sender
 * coordinator that loads tokens for a recipient and dispatches a single
 * payload across each registered token using the platform-appropriate
 * provider.
 */

import type { NotificationRepository } from "./ports";
import type { EntityId, NotificationPlatform, NotificationToken } from "./types";
import type { NotificationTriggerInput } from "./schemas/notifications";

/** Generic push payload shared across APNs and FCM. */
export interface PushPayload {
  /** Localizable notification title. */
  title: string;
  /** Notification body. */
  body: string;
  /** Trigger associated with this push — surfaces to clients via custom data. */
  trigger: NotificationTriggerInput;
  /** Arbitrary key/value data the client app may surface. */
  data?: Record<string, string>;
}

/**
 * Provider contract implemented by APNs and FCM adapters. A single provider
 * may implement either platform; `supportedPlatforms` lets the sender skip
 * tokens it cannot deliver. Implementations should not throw on transient
 * upstream failures — return `{ ok: false, ... }` so the sender can record
 * the outcome per-token without aborting the rest of the batch.
 */
export interface PushProvider {
  readonly supportedPlatforms: ReadonlySet<NotificationPlatform>;
  send(input: {
    token: string;
    platform: NotificationPlatform;
    payload: PushPayload;
  }): Promise<PushSendResult>;
}

export type PushSendResult =
  | { ok: true }
  | { ok: false; reason: PushFailureReason; status?: number; message?: string };

export type PushFailureReason =
  | "invalid_token"
  | "rate_limited"
  | "unsupported_platform"
  | "upstream_error"
  | "no_provider";

export interface PushDispatchOutcome {
  token: string;
  platform: NotificationPlatform;
  result: PushSendResult;
}

/**
 * Service that loads tokens for a recipient and dispatches a payload
 * across each token. Invalid-token results are best-effort cleaned up so
 * the next send doesn't keep retrying a stale device.
 */
export class PushSender {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly providers: PushProvider[],
  ) {}

  /**
   * Register a push token for a profile. Idempotent on (profile, platform, token).
   */
  async registerToken(input: {
    profileId: EntityId;
    platform: NotificationPlatform;
    token: string;
  }): Promise<NotificationToken> {
    return this.notifications.registerToken(input);
  }

  /**
   * Unregister a push token. Idempotent on (profile, token).
   */
  async unregisterToken(input: { profileId: EntityId; token: string }): Promise<void> {
    await this.notifications.removeToken(input);
  }

  /**
   * Fetch tokens for a recipient and dispatch a payload through whichever
   * provider supports each token's platform. Best-effort: per-token failures
   * are reported in the outcome list, not thrown.
   */
  async sendToProfile(input: {
    recipientId: EntityId;
    payload: PushPayload;
  }): Promise<PushDispatchOutcome[]> {
    const tokens = await this.notifications.listTokensForProfile(input.recipientId);
    const outcomes: PushDispatchOutcome[] = [];

    for (const t of tokens) {
      const provider = this.providers.find((p) => p.supportedPlatforms.has(t.platform));
      if (!provider) {
        outcomes.push({
          token: t.token,
          platform: t.platform,
          result: { ok: false, reason: "no_provider" },
        });
        continue;
      }
      const result = await provider.send({
        token: t.token,
        platform: t.platform,
        payload: input.payload,
      });
      outcomes.push({ token: t.token, platform: t.platform, result });

      if (result.ok === false && result.reason === "invalid_token") {
        // Stale device — drop it so we don't keep retrying.
        await this.notifications.removeToken({
          profileId: input.recipientId,
          token: t.token,
        });
      }
    }

    return outcomes;
  }
}
