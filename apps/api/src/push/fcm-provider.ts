/**
 * FCM (Firebase Cloud Messaging) provider — stub for parity (#146).
 *
 * v1 ships iOS first; the FCM adapter records sends so Android-side
 * wiring can be added without changing the call sites. This stub
 * returns `{ ok: true }` synchronously and exposes the recorded sends
 * for tests / observability.
 */

import type { PushPayload, PushProvider, PushSendResult } from "@hone/domain";

export interface FcmSendRecord {
  token: string;
  payload: PushPayload;
  at: Date;
}

export class FcmProvider implements PushProvider {
  readonly supportedPlatforms = new Set(["fcm" as const]);
  readonly sent: FcmSendRecord[] = [];

  async send(input: {
    token: string;
    platform: "apns" | "fcm";
    payload: PushPayload;
  }): Promise<PushSendResult> {
    if (input.platform !== "fcm") {
      return { ok: false, reason: "unsupported_platform" };
    }
    this.sent.push({ token: input.token, payload: input.payload, at: new Date() });
    return { ok: true };
  }
}
