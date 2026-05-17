/**
 * Top-level Nav data and prop types for the native app (P-07, #143).
 *
 * Kept in a separate, react-native-free module so unit tests can import
 * the default items without dragging the RN/Expo runtime into the vitest
 * Node environment.
 */
export interface NavItem {
  href: string;
  label: string;
}

export const DEFAULT_NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/search", label: "Search" },
];

export interface NavProps {
  /** Items to render. Defaults to {@link DEFAULT_NAV_ITEMS}. */
  items?: ReadonlyArray<NavItem>;
  /** Currently active path; used for active styling. */
  currentPath?: string;
}
