/**
 * Top-level nav for the Hone web app.
 *
 * Renders a primary nav with links to the home/feed surface and the
 * Discover tab (P-06, #142). Kept as a server component so it can be
 * dropped into any RSC tree without bumping JS bundle size.
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
  /** Currently active path; used for `aria-current` styling. */
  currentPath?: string;
}

export function Nav({ items = DEFAULT_NAV_ITEMS, currentPath }: NavProps) {
  return (
    <nav className="nav" aria-label="Primary">
      <ul className="navList">
        {items.map((item) => {
          const isActive = currentPath === item.href;
          return (
            <li key={item.href} className="navItem">
              <a
                href={item.href}
                className={isActive ? "navLinkActive" : "navLink"}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
