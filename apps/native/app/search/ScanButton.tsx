import { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraScanner, type CameraComponent } from "./CameraScanner";
import { useScanCamera, type UseScanCameraDeps } from "./useScanCamera";

export interface ScanButtonProps {
  /**
   * Called once the camera decodes a barcode and we successfully
   * normalize it to an ISBN-13. The parent search panel wires this
   * to `SearchBackend.lookupByIsbn`, so the scan result feeds the
   * same Add Sheet as a typed ISBN.
   */
  onScan: (isbn: string) => void;
  /**
   * Requests OS camera permission. Wired at the app shell to
   * `Camera.requestCameraPermissionsAsync()` from `expo-camera`;
   * kept as a seam so this component renders under vitest in Node.
   */
  requestPermission: UseScanCameraDeps["requestPermission"];
  /**
   * The live-camera component. Wired at the app shell to
   * `CameraView` from `expo-camera`. Tests inject a stub.
   */
  cameraComponent: CameraComponent;
  /** Optional override of the ISBN normalizer, mainly for tests. */
  normalize?: UseScanCameraDeps["normalize"];
  /** Visible label on the button. Defaults to "Scan". */
  label?: string;
}

/**
 * Pressable "Scan" affordance for the native /search surface
 * (G-04, #78).
 *
 * On tap, requests camera permission via the injected
 * `requestPermission`. On grant, opens a full-screen `CameraScanner`
 * modal whose `onBarcodeScanned` callback feeds the parent's
 * `onScan` once a barcode normalizes as an ISBN.
 *
 * Mirrors the dependency-injection pattern from
 * `usePushTokenRegistration` (#150): no `expo-camera` imports leak
 * into the component tree so the vitest Node environment keeps
 * working.
 */
export function ScanButton({
  onScan,
  requestPermission,
  cameraComponent,
  normalize,
  label = "Scan",
}: ScanButtonProps) {
  const { state, error, open, close, handleBarcode } = useScanCamera(
    // Build the deps object conditionally so we don't pass `normalize:
    // undefined` under `exactOptionalPropertyTypes`. The hook treats a
    // missing key the same as `undefined` and falls back to the real
    // `normalizeIsbn` from `@hone/domain/isbn`.
    normalize
      ? { requestPermission, onScan, normalize }
      : { requestPermission, onScan },
  );

  const handlePress = useCallback(() => {
    void open();
  }, [open]);

  // Render the modal whenever the hook is actively scanning. The
  // permission-denied / requesting / error states stay outside the
  // modal so the viewer can see the inline error next to the button.
  const showCamera = state === "scanning";
  const inlineError = state !== "scanning" ? error : null;
  const isBusy = state === "requesting";

  return (
    <View style={styles.container} testID="scan-button-container">
      <TouchableOpacity
        onPress={handlePress}
        disabled={isBusy}
        accessibilityRole="button"
        accessibilityLabel="Scan an ISBN barcode"
        style={[styles.button, isBusy ? styles.buttonDisabled : null]}
        testID="scan-button"
      >
        <Text style={styles.label}>{isBusy ? "Opening…" : label}</Text>
      </TouchableOpacity>
      {inlineError ? (
        <Text style={styles.error} accessibilityRole="alert" testID="scan-button-error">
          {inlineError}
        </Text>
      ) : null}
      <CameraScanner
        visible={showCamera}
        onCancel={close}
        onBarcodeScanned={handleBarcode}
        cameraComponent={cameraComponent}
        error={state === "scanning" ? error : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  button: {
    alignItems: "center",
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonDisabled: { opacity: 0.45 },
  label: {
    color: "#F7F4ED",
    fontSize: 15,
    fontWeight: "600",
  },
  error: {
    color: "#B9472D",
    fontSize: 13,
    lineHeight: 18,
  },
});
