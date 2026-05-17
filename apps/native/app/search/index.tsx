import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  CameraView,
  Camera as ExpoCamera,
  type BarcodeType,
} from "expo-camera";
import type { BookSearchResultInput, EntityId } from "@hone/domain";
import { Nav } from "../components/Nav";
import { SearchPanel, type ScanCameraIntegration } from "./SearchPanel";
import { fetchSearchResults } from "./fetchSearchResults";
import type { ShelfOption } from "./AddSheet";
import type { CameraComponentProps } from "./CameraScanner";
import type { ScanPermissionStatus } from "./useScanCamera";

/**
 * Shelves the AddSheet picker shows to the viewer.
 *
 * V1 stub: the native app has no tRPC client yet, so we hardcode the
 * four system shelves auto-seeded by `profile.createProfile` (PRD-spec).
 * When the client lands, swap this for a `shelf.listMine` call. Mirrors
 * the `SAMPLE_SHELVES` constant in `apps/web/app/search/page.tsx`.
 */
const SAMPLE_SHELVES: ShelfOption[] = [
  {
    id: "00000000-0000-0000-0000-000000000001" as EntityId,
    name: "Reading",
    isSystem: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000002" as EntityId,
    name: "Want to Read",
    isSystem: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000003" as EntityId,
    name: "Finished",
    isSystem: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000004" as EntityId,
    name: "Dropped",
    isSystem: true,
  },
];

/**
 * App-shell wiring for the ISBN-scan integration (G-04, #78).
 *
 * Lives at the screen boundary so `SearchPanel`, `ScanButton`, and
 * `CameraScanner` stay free of `expo-camera` imports — the vitest Node
 * environment can't load native modules. The render-prop shim
 * normalizes the prop shape we depend on so the typecheck stays
 * narrow even though `CameraView` accepts a much wider surface.
 *
 * `ALLOWED_BARCODE_TYPES` is the whitelist of `expo-camera`'s
 * `BarcodeType` values we forward verbatim. Anything outside it
 * (everything but `ean13` / `upc_a` today) is silently dropped so the
 * native `CameraView` typecheck stays sound.
 */
const ALLOWED_BARCODE_TYPES = new Set<BarcodeType>(["ean13", "upc_a"]);

function narrowBarcodeTypes(
  input: ReadonlyArray<string>,
): BarcodeType[] {
  const out: BarcodeType[] = [];
  for (const value of input) {
    if (ALLOWED_BARCODE_TYPES.has(value as BarcodeType)) {
      out.push(value as BarcodeType);
    }
  }
  return out;
}

const NativeCameraView = (props: CameraComponentProps) => {
  const settings = props.barcodeScannerSettings
    ? { barcodeTypes: narrowBarcodeTypes(props.barcodeScannerSettings.barcodeTypes) }
    : undefined;
  return (
    <CameraView
      style={props.style}
      facing={props.facing ?? "back"}
      {...(settings ? { barcodeScannerSettings: settings } : {})}
      {...(props.onBarcodeScanned
        ? { onBarcodeScanned: props.onBarcodeScanned }
        : {})}
    />
  );
};

const SCAN_CAMERA: ScanCameraIntegration = {
  requestPermission: async (): Promise<ScanPermissionStatus> => {
    const { status } = await ExpoCamera.requestCameraPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "undetermined";
  },
  cameraComponent: NativeCameraView,
};

/**
 * Native Search screen (G-03, #77; G-04, #78).
 *
 * Mirrors `apps/web/app/search/page.tsx`: a hero block + a SearchPanel.
 * The panel owns query parsing (ISBN vs. text), result selection, and
 * the AddSheet modal lifecycle.
 *
 * The fetcher is currently a stub (`[]`) since the native tRPC client
 * is not yet wired — same deferred approach as #142 (web /search) and
 * #143 (native /discover). This screen's contract will not change.
 */
export default function SearchScreen() {
  const [initialResults, setInitialResults] = useState<BookSearchResultInput[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchSearchResults("").then((results) => {
      if (!cancelled) setInitialResults(results);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Nav currentPath="/search" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Search</Text>
          <Text style={styles.title} accessibilityRole="header">
            Find a book.
          </Text>
          <Text style={styles.lede}>
            Search by title, author, or ISBN. Pick a result to add it to
            a shelf, set status, privacy, and a private note.
          </Text>
        </View>
        <SearchPanel
          initialResults={initialResults}
          shelves={SAMPLE_SHELVES}
          scanCamera={SCAN_CAMERA}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F4ED" },
  content: { padding: 18, gap: 24, paddingBottom: 48 },
  hero: { gap: 10, paddingTop: 12 },
  eyebrow: {
    color: "#253F5B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    color: "#171411",
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 34,
  },
  lede: {
    color: "#676158",
    fontSize: 15,
    lineHeight: 22,
  },
});
