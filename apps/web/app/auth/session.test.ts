import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { persistSession, getSession, clearSession } from "./session";

describe("session", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      length: 0,
      key: () => null,
    };
    vi.stubGlobal("window", { localStorage: mockStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists a session token to localStorage", () => {
    persistSession("tok_abc");
    expect(store["hone_session_token"]).toBe("tok_abc");
  });

  it("retrieves a stored session token", () => {
    store["hone_session_token"] = "tok_xyz";
    expect(getSession()).toBe("tok_xyz");
  });

  it("returns null when no session is stored", () => {
    expect(getSession()).toBeNull();
  });

  it("clears the session token", () => {
    store["hone_session_token"] = "tok_abc";
    clearSession();
    expect(store["hone_session_token"]).toBeUndefined();
  });

  it("overwriting persists the latest token", () => {
    persistSession("tok_1");
    persistSession("tok_2");
    expect(getSession()).toBe("tok_2");
  });
});
