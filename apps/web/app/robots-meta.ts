import type { Metadata } from "next";

export const noindexRobots: Metadata["robots"] = {
  index: false,
  follow: false,
};

export const indexRobots: Metadata["robots"] = {
  index: true,
  follow: true,
};
