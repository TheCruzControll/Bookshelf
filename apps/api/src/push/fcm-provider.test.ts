import { describe, it, expect } from "vitest";
import { FcmProvider } from "./fcm-provider";

describe("FcmProvider", () => {
  it("only supports the fcm platform", () => {
    const provider = new FcmProvider();
    expect(provider.supportedPlatforms.has("fcm")).toBe(true);
    expect(provider.supportedPlatforms.has("apns" as never)).toBe(false);
  });

  it("records sends and returns ok", async () => {
    const provider = new FcmProvider();
    const result = await provider.send({
      token: "tok",
      platform: "fcm",
      payload: { title: "Hi", body: "There", trigger: "new_follower" },
    });
    expect(result).toEqual({ ok: true });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.token).toBe("tok");
    expect(provider.sent[0]?.payload.title).toBe("Hi");
  });

  it("returns unsupported_platform for apns", async () => {
    const provider = new FcmProvider();
    const result = await provider.send({
      token: "tok",
      platform: "apns",
      payload: { title: "Hi", body: "There", trigger: "new_follower" },
    });
    expect(result).toEqual({ ok: false, reason: "unsupported_platform" });
    expect(provider.sent).toHaveLength(0);
  });
});
