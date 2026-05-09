import type { Visibility } from "@hone/domain";

export function isPubliclyVisible(visibility: Visibility): boolean {
  return visibility === "public";
}
