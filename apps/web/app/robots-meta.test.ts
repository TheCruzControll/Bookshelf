import { describe, it, expect } from "vitest";
import { noindexRobots, indexRobots } from "./robots-meta";

describe("robots-meta", () => {
  describe("noindexRobots", () => {
    it("sets index to false", () => {
      expect(noindexRobots).toMatchObject({ index: false });
    });

    it("sets follow to false", () => {
      expect(noindexRobots).toMatchObject({ follow: false });
    });
  });

  describe("indexRobots", () => {
    it("sets index to true", () => {
      expect(indexRobots).toMatchObject({ index: true });
    });

    it("sets follow to true", () => {
      expect(indexRobots).toMatchObject({ follow: true });
    });
  });
});
