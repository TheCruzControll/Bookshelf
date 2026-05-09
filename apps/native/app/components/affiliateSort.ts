import type { AffiliateRetailer } from "@hone/domain";

export function sortRetailersForPlatform(
  retailers: AffiliateRetailer[],
  isIOS: boolean
): AffiliateRetailer[] {
  if (!isIOS) return retailers;
  const rest = retailers.filter((r) => r !== "apple_books");
  const hasApple = retailers.includes("apple_books");
  return hasApple ? ["apple_books", ...rest] : rest;
}
