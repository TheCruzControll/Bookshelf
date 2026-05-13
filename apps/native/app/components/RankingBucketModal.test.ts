import { describe, it, expect } from "vitest";
import type { RankingBucketModalProps, StarBucket } from "./RankingBucketModal";

describe("RankingBucketModal (native) contract", () => {
  it("requires bookTitle and onSelect", () => {
    const props: RankingBucketModalProps = {
      bookTitle: "Foundation",
      onSelect: async () => {},
    };
    expect(props.bookTitle).toBe("Foundation");
  });

  it("accepts onCancel and initialBucket", () => {
    const props: RankingBucketModalProps = {
      bookTitle: "X",
      onSelect: async () => {},
      onCancel: () => {},
      initialBucket: 5,
    };
    expect(props.initialBucket).toBe(5);
  });

  it("onSelect receives a 1-5 star bucket", async () => {
    const seen: StarBucket[] = [];
    const props: RankingBucketModalProps = {
      bookTitle: "X",
      onSelect: async (b) => {
        seen.push(b);
      },
    };
    await props.onSelect(2);
    await props.onSelect(4);
    expect(seen).toEqual([2, 4]);
  });
});
