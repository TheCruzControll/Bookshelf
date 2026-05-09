import { Platform, Linking, TouchableOpacity, Text, ScrollView, StyleSheet, View } from "react-native";
import {
  buildAffiliateUrl,
  getLocaleRetailers,
  type AffiliateLocale,
  type AffiliateRetailer,
  type AffiliateUrlInput,
} from "@hone/domain";
import { sortRetailersForPlatform } from "./affiliateSort";

const RETAILER_LABELS: Record<AffiliateRetailer, string> = {
  apple_books: "Apple Books",
  bookshop: "Bookshop",
  amazon: "Amazon",
  audible: "Audible",
};

const AFFILIATE_TAGS: Record<AffiliateRetailer, string> = {
  apple_books: "1234",
  bookshop: "hone-20",
  amazon: "hone-20",
  audible: "hone-20",
};

interface AffiliateRowProps {
  book: AffiliateUrlInput;
  locale: AffiliateLocale;
}

export function AffiliateRow({ book, locale }: AffiliateRowProps) {
  const retailers = getLocaleRetailers(locale);
  const sorted = sortRetailersForPlatform(retailers, Platform.OS === "ios");

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {sorted.map((retailer) => {
        const url = buildAffiliateUrl(
          { retailer, locale, affiliateTag: AFFILIATE_TAGS[retailer] },
          book
        );
        return (
          <TouchableOpacity
            key={retailer}
            style={styles.button}
            onPress={() => Linking.openURL(url)}
            accessibilityRole="link"
            accessibilityLabel={`Buy on ${RETAILER_LABELS[retailer]}`}
          >
            <Text style={styles.label}>{RETAILER_LABELS[retailer]}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  button: {
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  label: {
    color: "#F7F4ED",
    fontSize: 14,
    fontWeight: "600",
  },
});

export function AffiliateRowSection({ book, locale }: AffiliateRowProps) {
  return (
    <View style={styles2.section}>
      <Text style={styles2.sectionLabel}>Buy</Text>
      <AffiliateRow book={book} locale={locale} />
    </View>
  );
}

const styles2 = StyleSheet.create({
  section: {
    borderTopColor: "#E5DFD3",
    borderTopWidth: 1,
    paddingTop: 4,
  },
  sectionLabel: {
    color: "#676158",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingHorizontal: 18,
    paddingTop: 14,
  },
});
