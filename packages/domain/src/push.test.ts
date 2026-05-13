import { describe, it, expect, vi } from "vitest";
import { PushSender } from "./push";
import type { PushPayload, PushProvider, PushSendResult } from "./push";
import type { NotificationRepository } from "./ports";
import type { NotificationPlatform, NotificationToken } from "./types";

function makeNotificationRepo(
  overrides?: Partial<NotificationRepository>,
): NotificationRepository {
  return {
    registerToken: vi.fn().mockImplementation(async (input) => ({
      profileId: input.profileId,
      platform: input.platform,
      token: input.token,
      lastSeen: new Date(),
    })),
    removeToken: vi.fn().mockResolvedValue(undefined),
    listTokensForProfile: vi.fn().mockResolvedValue([]),
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn(),
    listSettings: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeToken(platform: NotificationPlatform, token: string): NotificationToken {
  return {
    profileId: "00000000-0000-0000-0000-000000000001",
    platform,
    token,
    lastSeen: new Date(),
  };
}

function makeProvider(
  platform: NotificationPlatform,
  send: (token: string) => PushSendResult,
): PushProvider {
  return {
    supportedPlatforms: new Set([platform]),
    send: vi.fn().mockImplementation(async (input) => send(input.token)),
  };
}

const VIEWER = "00000000-0000-0000-0000-000000000099";
const PAYLOAD: PushPayload = {
  title: "Hello",
  body: "World",
  trigger: "new_follower",
};

describe("PushSender.registerToken / unregisterToken", () => {
  it("registers a token via the repository", async () => {
    const repo = makeNotificationRepo();
    const sender = new PushSender(repo, []);
    await sender.registerToken({ profileId: VIEWER, platform: "apns", token: "tok-1" });
    expect(repo.registerToken).toHaveBeenCalledWith({
      profileId: VIEWER,
      platform: "apns",
      token: "tok-1",
    });
  });

  it("unregisters a token via the repository", async () => {
    const repo = makeNotificationRepo();
    const sender = new PushSender(repo, []);
    await sender.unregisterToken({ profileId: VIEWER, token: "tok-1" });
    expect(repo.removeToken).toHaveBeenCalledWith({
      profileId: VIEWER,
      token: "tok-1",
    });
  });
});

describe("PushSender.sendToProfile", () => {
  it("dispatches each token through the platform-matching provider", async () => {
    const apnsProvider = makeProvider("apns", () => ({ ok: true }));
    const fcmProvider = makeProvider("fcm", () => ({ ok: true }));
    const repo = makeNotificationRepo({
      listTokensForProfile: vi.fn().mockResolvedValue([
        makeToken("apns", "ios-1"),
        makeToken("fcm", "android-1"),
      ]),
    });
    const sender = new PushSender(repo, [apnsProvider, fcmProvider]);
    const outcomes = await sender.sendToProfile({ recipientId: VIEWER, payload: PAYLOAD });

    expect(outcomes).toEqual([
      { token: "ios-1", platform: "apns", result: { ok: true } },
      { token: "android-1", platform: "fcm", result: { ok: true } },
    ]);
    expect(apnsProvider.send).toHaveBeenCalledTimes(1);
    expect(fcmProvider.send).toHaveBeenCalledTimes(1);
  });

  it("returns no_provider for tokens whose platform is unsupported", async () => {
    const apnsProvider = makeProvider("apns", () => ({ ok: true }));
    const repo = makeNotificationRepo({
      listTokensForProfile: vi.fn().mockResolvedValue([makeToken("fcm", "android-x")]),
    });
    const sender = new PushSender(repo, [apnsProvider]);
    const outcomes = await sender.sendToProfile({ recipientId: VIEWER, payload: PAYLOAD });
    expect(outcomes).toEqual([
      { token: "android-x", platform: "fcm", result: { ok: false, reason: "no_provider" } },
    ]);
    expect(apnsProvider.send).not.toHaveBeenCalled();
  });

  it("evicts stale tokens reported as invalid_token", async () => {
    const apnsProvider = makeProvider("apns", () => ({ ok: false, reason: "invalid_token" }));
    const repo = makeNotificationRepo({
      listTokensForProfile: vi.fn().mockResolvedValue([makeToken("apns", "ios-stale")]),
    });
    const sender = new PushSender(repo, [apnsProvider]);
    await sender.sendToProfile({ recipientId: VIEWER, payload: PAYLOAD });
    expect(repo.removeToken).toHaveBeenCalledWith({ profileId: VIEWER, token: "ios-stale" });
  });

  it("does not evict tokens on transient upstream errors", async () => {
    const apnsProvider = makeProvider("apns", () => ({ ok: false, reason: "upstream_error", status: 503 }));
    const repo = makeNotificationRepo({
      listTokensForProfile: vi.fn().mockResolvedValue([makeToken("apns", "ios-1")]),
    });
    const sender = new PushSender(repo, [apnsProvider]);
    await sender.sendToProfile({ recipientId: VIEWER, payload: PAYLOAD });
    expect(repo.removeToken).not.toHaveBeenCalled();
  });

  it("returns an empty outcome list when the recipient has no tokens", async () => {
    const sender = new PushSender(makeNotificationRepo(), []);
    const outcomes = await sender.sendToProfile({ recipientId: VIEWER, payload: PAYLOAD });
    expect(outcomes).toEqual([]);
  });
});
