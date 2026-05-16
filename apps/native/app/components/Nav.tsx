import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { DEFAULT_NAV_ITEMS, type NavItem, type NavProps } from "./navItems";

export { DEFAULT_NAV_ITEMS };
export type { NavItem, NavProps };

/**
 * Top-level nav for the Hone native app (P-07, #143).
 *
 * Native parity for `apps/web/app/components/Nav.tsx`. Renders a row of
 * route links across the top of the screen so the Discover surface is
 * reachable from anywhere in the Stack. Expo Router does not ship a
 * bottom-tab bar in this app, so this component plays the same role as
 * the web Nav: navigate-and-style-the-active-route. We deliberately
 * mirror the web shape (`href`/`label`) so the test fixtures and
 * snapshot intuition transfer directly.
 */
export function Nav({ items = DEFAULT_NAV_ITEMS, currentPath }: NavProps) {
  const router = useRouter();
  return (
    <View style={styles.nav} accessibilityRole="tablist" accessibilityLabel="Primary">
      {items.map((item) => {
        const isActive = currentPath === item.href;
        return (
          <TouchableOpacity
            key={item.href}
            style={isActive ? styles.linkActive : styles.link}
            onPress={() => router.push(item.href as never)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
          >
            <Text style={isActive ? styles.labelActive : styles.label}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomColor: "#E5DFD3",
    borderBottomWidth: 1,
    backgroundColor: "#F7F4ED",
  },
  link: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  linkActive: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "#253F5B",
  },
  label: {
    color: "#181512",
    fontSize: 14,
    fontWeight: "600",
  },
  labelActive: {
    color: "#F7F4ED",
    fontSize: 14,
    fontWeight: "700",
  },
});
