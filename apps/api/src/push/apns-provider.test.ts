import { describe, it, expect, vi, beforeEach } from "vitest";
import { subtle } from "node:crypto";
import { ApnsProvider } from "./apns-provider";

// Use a deterministic test key so we can verify the signature in isolation.
async function generateTestPrivateKeyPem(): Promise<string> {
  const kp = (await subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as { privateKey: CryptoKey; publicKey: CryptoKey };
  const raw = new Uint8Array(await subtle.exportKey("pkcs8", kp.privateKey));
  const b64 = Buffer.from(raw).toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

const FAKE_TOKEN = "abc123def456";

let privateKeyPem: string;
beforeEach(async () => {
  privateKeyPem = await generateTestPrivateKeyPem();
});

function makeProvider(opts: { fetchImpl?: typeof globalThis.fetch; host?: "https://api.push.apple.com" | "https://api.sandbox.push.apple.com" } = {}) {
  const cfg: ConstructorParameters<typeof ApnsProvider>[0] = {
    teamId: "TEAM123",
    keyId: "KEY456",
    privateKeyPem,
    bundleId: "com.hone.app",
  };
  if (opts.fetchImpl !== undefined) cfg.fetchImpl = opts.fetchImpl;
  if (opts.host !== undefined) cfg.host = opts.host;
  return new ApnsProvider(cfg);
}

describe("ApnsProvider", () => {
  it("only supports the apns platform", () => {
    const provider = makeProvider({ fetchImpl: vi.fn() });
    expect(provider.supportedPlatforms.has("apns")).toBe(true);
    expect(provider.supportedPlatforms.has("fcm" as never)).toBe(false);
  });

  it("returns ok on 200 and posts to the device path with required headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const provider = makeProvider({ fetchImpl });
    const result = await provider.send({
      token: FAKE_TOKEN,
      platform: "apns",
      payload: { title: "Hi", body: "There", trigger: "new_follower", data: { foo: "bar" } },
    });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`https://api.push.apple.com/3/device/${FAKE_TOKEN}`);
    const headers = init.headers as Record<string, string>;
    expect(headers["apns-topic"]).toBe("com.hone.app");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["authorization"]).toMatch(/^bearer eyJ/); // ES256 JWT prefix
    const body = JSON.parse(init.body as string);
    expect(body.aps.alert).toEqual({ title: "Hi", body: "There" });
    expect(body.trigger).toBe("new_follower");
    expect(body.foo).toBe("bar");
  });

  it("uses the sandbox host when configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const provider = makeProvider({ fetchImpl, host: "https://api.sandbox.push.apple.com" });
    await provider.send({
      token: FAKE_TOKEN,
      platform: "apns",
      payload: { title: "Hi", body: "There", trigger: "new_follower" },
    });
    expect(fetchImpl.mock.calls[0]![0]).toBe(`https://api.sandbox.push.apple.com/3/device/${FAKE_TOKEN}`);
  });

  it("returns unsupported_platform for non-apns platforms", async () => {
    const provider = makeProvider({ fetchImpl: vi.fn() });
    const result = await provider.send({
      token: FAKE_TOKEN,
      platform: "fcm",
      payload: { title: "x", body: "y", trigger: "new_follower" },
    });
    expect(result).toEqual({ ok: false, reason: "unsupported_platform" });
  });

  it("maps 410 Gone to invalid_token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 410 }));
    const provider = makeProvider({ fetchImpl });
    const result = await provider.send({
      token: FAKE_TOKEN,
      platform: "apns",
      payload: { title: "x", body: "y", trigger: "new_follower" },
    });
    expect(result).toEqual({ ok: false, reason: "invalid_token", status: 410 });
  });

  it("maps 400 BadDeviceToken to invalid_token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reason: "BadDeviceToken" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = makeProvider({ fetchImpl });
    const result = await provider.send({
      token: FAKE_TOKEN,
      platform: "apns",
      payload: { title: "x", body: "y", trigger: "new_follower" },
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid_token", status: 400 });
  });

  it("maps 400 with other reasons to upstream_error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reason: "PayloadTooLarge" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = makeProvider({ fetchImpl });
    const result = await provider.send({
      token: FAKE_TOKEN,
      platform: "apns",
      payload: { title: "x", body: "y", trigger: "new_follower" },
    });
    expect(result).toMatchObject({ ok: false, reason: "upstream_error", status: 400, message: "PayloadTooLarge" });
  });

  it("maps 429 to rate_limited", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    const provider = makeProvider({ fetchImpl });
    const result = await provider.send({
      token: FAKE_TOKEN,
      platform: "apns",
      payload: { title: "x", body: "y", trigger: "new_follower" },
    });
    expect(result).toEqual({ ok: false, reason: "rate_limited", status: 429 });
  });

  it("maps 5xx to upstream_error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const provider = makeProvider({ fetchImpl });
    const result = await provider.send({
      token: FAKE_TOKEN,
      platform: "apns",
      payload: { title: "x", body: "y", trigger: "new_follower" },
    });
    expect(result).toEqual({ ok: false, reason: "upstream_error", status: 503 });
  });

  it("caches the provider JWT across sends and re-signs after TTL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    let now = 1_000_000;
    const cfg: ConstructorParameters<typeof ApnsProvider>[0] = {
      teamId: "T",
      keyId: "K",
      privateKeyPem,
      bundleId: "com.hone.app",
      fetchImpl,
      now: () => now,
    };
    const provider = new ApnsProvider(cfg);

    await provider.send({ token: FAKE_TOKEN, platform: "apns", payload: { title: "a", body: "b", trigger: "new_follower" } });
    await provider.send({ token: FAKE_TOKEN, platform: "apns", payload: { title: "a", body: "b", trigger: "new_follower" } });
    const firstAuth = (fetchImpl.mock.calls[0]![1].headers as Record<string, string>).authorization;
    const secondAuth = (fetchImpl.mock.calls[1]![1].headers as Record<string, string>).authorization;
    expect(firstAuth).toBe(secondAuth); // cached

    now += 60 * 60 * 1000; // jump past 50-minute TTL
    await provider.send({ token: FAKE_TOKEN, platform: "apns", payload: { title: "a", body: "b", trigger: "new_follower" } });
    const thirdAuth = (fetchImpl.mock.calls[2]![1].headers as Record<string, string>).authorization;
    expect(thirdAuth).not.toBe(firstAuth); // re-signed
  });
});
