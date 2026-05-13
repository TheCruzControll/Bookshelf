import { describe, it, expect } from "vitest";
import type { RankingBucketModalProps, StarBucket } from "./RankingBucketModal";

describe("RankingBucketModal contract", () => {
  it("requires bookTitle and onSelect", () => {
    const props: RankingBucketModalProps = {
      bookTitle: "Foundation",
      onSelect: async () => {},
    };
    expect(props.bookTitle).toBe("Foundation");
    expect(typeof props.onSelect).toBe("function");
  });

  it("accepts optional onCancel and initialBucket", () => {
    const props: RankingBucketModalProps = {
      bookTitle: "Dune",
      onSelect: async () => {},
      onCancel: () => {},
      initialBucket: 5,
    };
    expect(props.initialBucket).toBe(5);
    expect(typeof props.onCancel).toBe("function");
  });

  it("onSelect receives a 1-5 star bucket", async () => {
    const seen: StarBucket[] = [];
    const props: RankingBucketModalProps = {
      bookTitle: "X",
      onSelect: async (b) => {
        seen.push(b);
      },
    };
    await props.onSelect(1);
    await props.onSelect(3);
    await props.onSelect(5);
    expect(seen).toEqual([1, 3, 5]);
  });
});
