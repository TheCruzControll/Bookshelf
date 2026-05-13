/**
 * Twilio Verify provider (#66 [E-11]).
 *
 * Implements the @hone/domain SmsProvider port by POSTing to Twilio
 * Verify's "create verification" endpoint. The phone-verify flow in
 * the domain layer manages its own code state (hashed code + expiry)
 * in the phone_verifications table, so this provider only needs to
 * trigger Twilio to deliver the SMS.
 *
 * Twilio API:
 *   POST https://verify.twilio.com/v2/Services/{ServiceSid}/Verifications
 *   Auth: Basic <AccountSid>:<AuthToken>
 *   Body (form-encoded): To=<E.164>, Channel=sms
 *
 * The fetch implementation is injectable for testing.
 */

import type { SmsProvider } from "@hone/domain";

export interface TwilioSmsProviderConfig {
  /** Twilio Account SID (e.g. "ACxxxx..."). */
  accountSid: string;
  /** Twilio Auth Token. Treated as a secret. */
  authToken: string;
  /** Twilio Verify Service SID (e.g. "VAxxxx..."). */
  verifyServiceSid: string;
  /** Base URL override (for testing/staging). Defaults to production. */
  baseUrl?: string;
  /** Fetch implementation override (testing). */
  fetchImpl?: typeof globalThis.fetch;
}

export class TwilioVerifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "TwilioVerifyError";
  }
}

export class TwilioSmsProvider implements SmsProvider {
  constructor(private readonly config: TwilioSmsProviderConfig) {}

  async sendVerificationCode(input: { to: string; code: string }): Promise<void> {
    const fetchImpl = this.config.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new TwilioVerifyError("fetch is not available", 0);
    }
    const baseUrl = this.config.baseUrl ?? "https://verify.twilio.com";
    const url = `${baseUrl}/v2/Services/${this.config.verifyServiceSid}/Verifications`;
    const credentials = Buffer.from(
      `${this.config.accountSid}:${this.config.authToken}`,
      "utf8",
    ).toString("base64");

    const body = new URLSearchParams({
      To: input.to,
      Channel: "sms",
      // Twilio Verify expects to manage its own codes, but for parity with
      // the locally-managed code flow we pass a CustomCode so the user
      // receives the same digits we hashed in our DB. This keeps the two
      // verification paths consistent and removes provider lock-in.
      CustomCode: input.code,
    });

    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (res.status === 201 || res.status === 200) return;

    let code: number | undefined;
    let message = `Twilio Verify returned ${res.status}`;
    try {
      const json = (await res.json()) as { code?: number; message?: string };
      if (typeof json.code === "number") code = json.code;
      if (typeof json.message === "string") message = json.message;
    } catch {
      // ignore body parse failure
    }
    const err = new TwilioVerifyError(message, res.status, code);
    throw err;
  }
}
