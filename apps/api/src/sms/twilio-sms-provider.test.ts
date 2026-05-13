import { describe, it, expect, vi } from "vitest";
import { TwilioSmsProvider, TwilioVerifyError } from "./twilio-sms-provider";

function makeProvider(fetchImpl: typeof globalThis.fetch) {
  return new TwilioSmsProvider({
    accountSid: "AC123",
    authToken: "secret-token",
    verifyServiceSid: "VA456",
    fetchImpl,
  });
}

describe("TwilioSmsProvider", () => {
  it("POSTs to the Twilio Verify endpoint with the correct URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    const provider = makeProvider(fetchImpl);
    await provider.sendVerificationCode({ to: "+15551234567", code: "123456" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://verify.twilio.com/v2/Services/VA456/Verifications",
    );
  });

  it("uses Basic auth with the account sid + auth token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    const provider = makeProvider(fetchImpl);
    await provider.sendVerificationCode({ to: "+15551234567", code: "123456" });
    const headers = fetchImpl.mock.calls[0]![1].headers as Record<string, string>;
    const expected = `Basic ${Buffer.from("AC123:secret-token").toString("base64")}`;
    expect(headers.authorization).toBe(expected);
  });

  it("sends form-encoded To, Channel, and CustomCode", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    const provider = makeProvider(fetchImpl);
    await provider.sendVerificationCode({ to: "+15551234567", code: "987654" });
    const init = fetchImpl.mock.calls[0]![1] as { headers: Record<string, string>; body: URLSearchParams };
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const params = init.body;
    expect(params.get("To")).toBe("+15551234567");
    expect(params.get("Channel")).toBe("sms");
    expect(params.get("CustomCode")).toBe("987654");
  });

  it("treats 200 OK as success (idempotency)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.sendVerificationCode({ to: "+15551234567", code: "123456" }),
    ).resolves.toBeUndefined();
  });

  it("throws TwilioVerifyError with the Twilio error code on 4xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 60200, message: "Invalid parameter" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.sendVerificationCode({ to: "+15551234567", code: "x" }),
    ).rejects.toMatchObject({
      name: "TwilioVerifyError",
      status: 400,
      code: 60200,
      message: "Invalid parameter",
    });
  });

  it("throws TwilioVerifyError on 5xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));
    const provider = makeProvider(fetchImpl);
    await expect(
      provider.sendVerificationCode({ to: "+15551234567", code: "x" }),
    ).rejects.toBeInstanceOf(TwilioVerifyError);
  });

  it("respects the baseUrl override", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    const provider = new TwilioSmsProvider({
      accountSid: "AC1",
      authToken: "t",
      verifyServiceSid: "VA1",
      baseUrl: "https://verify.stage.example.com",
      fetchImpl,
    });
    await provider.sendVerificationCode({ to: "+15551234567", code: "x" });
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://verify.stage.example.com/v2/Services/VA1/Verifications",
    );
  });
});
