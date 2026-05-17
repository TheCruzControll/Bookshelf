import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncer } from "./debounce";
import { parseSearchQuery, type ParsedQuery } from "./isbnQuery";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebouncer", () => {
  it("does not invoke fn before the delay elapses", () => {
    const calls: string[] = [];
    const d = createDebouncer<string>((v) => calls.push(v), 300);
    d.schedule("a");
    vi.advanceTimersByTime(299);
    expect(calls).toEqual([]);
  });

  it("invokes fn once with the most recent value after the delay", () => {
    const calls: string[] = [];
    const d = createDebouncer<string>((v) => calls.push(v), 300);
    d.schedule("a");
    vi.advanceTimersByTime(100);
    d.schedule("ab");
    vi.advanceTimersByTime(100);
    d.schedule("abc");
    vi.advanceTimersByTime(300);
    expect(calls).toEqual(["abc"]);
  });

  it("cancel() prevents a pending invocation", () => {
    const calls: string[] = [];
    const d = createDebouncer<string>((v) => calls.push(v), 300);
    d.schedule("foundation");
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
  });

  it("routes debounced ISBN-13 input to the isbn branch", () => {
    const dispatched: ParsedQuery[] = [];
    const d = createDebouncer<string>(
      (v) => dispatched.push(parseSearchQuery(v)),
      300,
    );
    d.schedule("978");
    d.schedule("978-0-553-29335-7");
    vi.advanceTimersByTime(300);
    expect(dispatched).toEqual([{ kind: "isbn", isbn: "9780553293357" }]);
  });

  it("routes debounced ISBN-10 input (with trailing X) to the isbn branch", () => {
    const dispatched: ParsedQuery[] = [];
    const d = createDebouncer<string>(
      (v) => dispatched.push(parseSearchQuery(v)),
      300,
    );
    d.schedule("043942089X");
    vi.advanceTimersByTime(300);
    expect(dispatched).toEqual([{ kind: "isbn", isbn: "043942089X" }]);
  });

  it("routes debounced free-text input to the text branch", () => {
    const dispatched: ParsedQuery[] = [];
    const d = createDebouncer<string>(
      (v) => dispatched.push(parseSearchQuery(v)),
      300,
    );
    d.schedule("Found");
    d.schedule("Foundation");
    vi.advanceTimersByTime(300);
    expect(dispatched).toEqual([{ kind: "text", query: "Foundation" }]);
  });
});
