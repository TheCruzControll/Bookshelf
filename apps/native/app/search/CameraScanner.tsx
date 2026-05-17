import type { ComponentType } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import type { ScannedBarcode } from "./useScanCamera";

/**
 * Subset of the `CameraView` prop surface from `expo-camera@16` that
 * we depend on. Declaring the contract here (instead of importing the
 * concrete type) keeps this module — and its tests — free of
 * `expo-camera`, which can't run under the vitest Node environment.
 *
 * The app shell injects the real `CameraView` via the
 * `cameraComponent` prop (see `CameraScanner.tsx` consumers); tests
 * inject a render-only stub.
 */
export interface CameraComponentProps {
  /** Style passthrough — we render full-bleed inside the modal. */
  style?: StyleProp<ViewStyle>;
  /**
   * List of barcode symbologies the camera should decode. We pin this
   * to ISBN-bearing formats (`ean13`, with `upc_a` as a legacy
   * fallback) so iOS doesn't waste cycles on QR / Code 128 / etc.
   */
  barcodeScannerSettings?: {
    barcodeTypes: ReadonlyArray<string>;
  };
  /**
   * Fires every time the camera decodes a barcode. The hook filters
   * to ISBN payloads and normalizes via `@hone/domain/isbn`.
   */
  onBarcodeScanned?: (barcode: ScannedBarcode) => void;
  /**
   * Which physical camera to use. We default to the rear camera at
   * the call site since front cameras can't focus on tiny book
   * barcodes.
   */
  facing?: "back" | "front";
}

export type CameraComponent = ComponentType<CameraComponentProps>;

export interface CameraScannerProps {
  /** Whether the camera modal is currently visible. */
  visible: boolean;
  /** Called when the viewer taps "Cancel" to dismiss the scanner. */
  onCancel: () => void;
  /** Called every time the camera reports a decoded barcode. */
  onBarcodeScanned: (barcode: ScannedBarcode) => void;
  /**
   * The actual camera component. Wired to `CameraView` from
   * `expo-camera` at the app shell; tests inject a stub render-prop
   * so the modal can mount under vitest in Node.
   */
  cameraComponent: CameraComponent;
  /**
   * Optional human-readable error to surface inside the camera
   * overlay (e.g. when a previous scan failed to normalize as an
   * ISBN). Defaults to `null`.
   */
  error?: string | null;
}

const ISBN_BARCODE_TYPES = ["ean13", "upc_a"] as const;

/**
 * Full-screen modal that hosts the live camera feed and a centered
 * scan-target overlay (G-04, #78).
 *
 * Closes itself when the viewer taps "Cancel" OR when the parent
 * `useScanCamera` hook successfully normalizes a barcode and flips
 * `visible` back to `false`.
 *
 * The visible chrome is kept inside this component so all camera
 * rendering happens in one place; the parent only owns the toggle.
 */
export function CameraScanner({
  visible,
  onCancel,
  onBarcodeScanned,
  cameraComponent: Camera,
  error = null,
}: CameraScannerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
      accessibilityViewIsModal
      testID="camera-scanner-modal"
    >
      <View style={styles.container}>
        <Camera
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ISBN_BARCODE_TYPES }}
          onBarcodeScanned={onBarcodeScanned}
        />
        <View pointerEvents="none" style={styles.overlay} testID="camera-scanner-overlay">
          <View style={styles.viewfinder} />
          <Text style={styles.hint}>
            Point the camera at the barcode on the back of the book.
          </Text>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" testID="camera-scanner-error">
              {error}
            </Text>
          ) : null}
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel scan"
            style={styles.cancelButton}
            testID="camera-scanner-cancel"
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  viewfinder: {
    width: 260,
    height: 160,
    borderColor: "#F7F4ED",
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  hint: {
    color: "#F7F4ED",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  error: {
    color: "#F7C9BB",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#F7F4ED",
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 120,
    alignItems: "center",
  },
  cancelLabel: {
    color: "#171411",
    fontSize: 15,
    fontWeight: "600",
  },
});
