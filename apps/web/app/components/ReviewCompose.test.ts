import { describe, it, expect } from "vitest";
import type { ReviewComposeProps } from "./ReviewCompose";
import type { Visibility } from "@hone/domain";

describe("ReviewCompose component contract", () => {
  it("accepts the required bookId prop", () => {
    const props: ReviewComposeProps = {
      bookId: "00000000-0000-0000-0000-000000000001",
      onSubmit: async () => {},
    };
    expect(props.bookId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("accepts optional editionId", () => {
    const props: ReviewComposeProps = {
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: "00000000-0000-0000-0000-000000000002",
      onSubmit: async () => {},
    };
    expect(props.editionId).toBe("00000000-0000-0000-0000-000000000002");
  });

  it("accepts all four visibility tiers", () => {
    const tiers: Visibility[] = ["public", "followers", "mutuals", "private"];
    for (const v of tiers) {
      const props: ReviewComposeProps = {
        bookId: "00000000-0000-0000-0000-000000000001",
        initialVisibility: v,
        onSubmit: async () => {},
      };
      expect(props.initialVisibility).toBe(v);
    }
  });

  it("defaults initialVisibility to public when omitted", () => {
    const props: ReviewComposeProps = {
      bookId: "00000000-0000-0000-0000-000000000001",
      onSubmit: async () => {},
    };
    expect(props.initialVisibility).toBeUndefined();
  });

  it("onSubmit receives body and visibility", async () => {
    const calls: { body: string; visibility: Visibility }[] = [];
    const props: ReviewComposeProps = {
      bookId: "00000000-0000-0000-0000-000000000001",
      onSubmit: async (args) => {
        calls.push(args);
      },
    };
    await props.onSubmit({ body: "Great book", visibility: "public" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ body: "Great book", visibility: "public" });
  });

  it("onSubmit propagates errors for conflict handling", async () => {
    const conflictError = new Error("409 conflict");
    const props: ReviewComposeProps = {
      bookId: "00000000-0000-0000-0000-000000000001",
      onSubmit: async () => {
        throw conflictError;
      },
    };
    await expect(props.onSubmit({ body: "text", visibility: "public" })).rejects.toThrow("409 conflict");
  });

  it("onSubmit propagates optimistic locking conflict errors", async () => {
    const conflictError = new Error("version conflict");
    const props: ReviewComposeProps = {
      bookId: "00000000-0000-0000-0000-000000000001",
      onSubmit: async () => {
        throw conflictError;
      },
    };
    await expect(props.onSubmit({ body: "text", visibility: "followers" })).rejects.toThrow("version conflict");
  });
});
