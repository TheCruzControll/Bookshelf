import { useCallback, useRef, useState } from "react";
import { normalizeIsbn } from "@hone/domain/isbn";

/**
 * OS camera-permission status for the ISBN-scan flow (G-04, #78).
 *
 * Mirrors the values returned by `expo-camera`'s
 * `useCameraPermissions()` / `Camera.requestCameraPermissionsAsync()`:
 * the user has either granted, denied, or not yet been asked.
 */
export type ScanPermissionStatus = "granted" | "denied" | "undetermined";

/**
 * Lifecycle of the scan UI.
 *
 *  - `idle`         — the camera modal is closed.
 *  - `requesting`   — we're asking the OS for camera permission.
 *  - `denied`       — the OS (or the user) refused the permission.
 *  - `scanning`     — permission granted and the camera is live.
 *  - `error`        — the permission request threw, or the scanned
 *                     barcode failed ISBN normalization.
 */
export type ScanCameraState =
  | "idle"
  | "requesting"
  | "denied"
  | "scanning"
  | "error";

/**
 * Barcode payload emitted by `expo-camera`'s `onBarcodeScanned`
 * callback. We only need the raw `data` string and the symbology
 * (`type`) — ISBN barcodes are encoded as EAN-13 (a.k.a. Bookland).
 */
export interface ScannedBarcode {
  type: string;
  data: string;
}

export interface UseScanCameraDeps {
  /**
   * Requests OS camera permission. Wired to
   * `Camera.requestCameraPermissionsAsync()` from `expo-camera` at the
   * app shell; kept as a seam so this hook can be tested in Node.
   */
  requestPermission: () => Promise<ScanPermissionStatus> | ScanPermissionStatus;
  /**
   * Called with the normalized ISBN-13 once a barcode is successfully
   * decoded. The parent search panel wires this to
   * `SearchBackend.lookupByIsbn`.
   */
  onScan: (isbn: string) => void;
  /**
   * Optional override of the ISBN normalizer. Defaults to
   * `normalizeIsbn` from `@hone/domain/isbn`. Tests inject a stub when
   * they want to assert the call surface without exercising the real
   * checksum logic.
   */
  normalize?: (value: string) => string;
}

export interface UseScanCameraResult {
  state: ScanCameraState;
  /**
   * Last error message produced during the scan flow. `null` whenever
   * `state !== "error"`. Surfaced verbatim in the camera modal so the
   * viewer sees why the scan failed.
   */
  error: string | null;
  /**
   * Triggers the OS permission prompt and, on grant, opens the camera.
   * Safe to call multiple times; concurrent calls are coalesced.
   */
  open: () => Promise<void>;
  /** Closes the camera modal and resets transient state. */
  close: () => void;
  /**
   * Handler wired to the camera's `onBarcodeScanned` callback. Filters
   * to EAN-13 / ISBN payloads, normalizes via `normalizeIsbn`, and
   * forwards the result to `onScan`. Non-ISBN symbologies are ignored
   * so the camera keeps scanning until a real book barcode appears.
   */
  handleBarcode: (barcode: ScannedBarcode) => void;
}

/**
 * Barcode symbologies we treat as candidate ISBN codes. ISBN-13 maps
 * to `ean13`; legacy printings sometimes carry a separate ISBN-10 in
 * `upc_a` (rare, but cheap to accept). Everything else is ignored so
 * the viewer can keep the camera open while panning across noise.
 */
const ISBN_BARCODE_TYPES: ReadonlySet<string> = new Set([
  "ean13",
  "org.gs1.EAN-13",
  "EAN-13",
  "upc_a",
  "org.gs1.UPC-A",
  "UPC-A",
]);

/**
 * True when the barcode symbology is plausibly an ISBN. Compared
 * case-insensitively because different platforms (iOS native vs
 * `expo-camera`'s normalized strings) spell the symbology differently.
 */
export function isIsbnBarcodeType(type: string): boolean {
  if (ISBN_BARCODE_TYPES.has(type)) return true;
  const lower = type.toLowerCase();
  return lower === "ean13" || lower === "ean-13" || lower === "upc_a" || lower === "upc-a";
}

/**
 * Hook that owns the native ISBN-scan flow (G-04, #78).
 *
 * Mirrors the dependency-injection pattern used by
 * `usePushTokenRegistration` (#150) so this hook stays free of
 * `expo-camera` imports — the app shell injects the real
 * permission-request call, and tests inject a Promise-returning stub.
 *
 * Acceptance criteria coverage for #78:
 *  - `expo-camera` permission flow on iOS.
 *  - Scan result feeds the same Add Sheet as the search input by
 *    forwarding the normalized ISBN to the parent's `onScan` callback.
 */
export function useScanCamera(deps: UseScanCameraDeps): UseScanCameraResult {
  const [state, setState] = useState<ScanCameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const open = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setState("requesting");
    try {
      const status = await depsRef.current.requestPermission();
      if (status === "granted") {
        setState("scanning");
        return;
      }
      if (status === "denied") {
        setState("denied");
        setError(
          "Camera access is off. Enable it for Hone in Settings to scan ISBNs.",
        );
        return;
      }
      setState("denied");
      setError(
        "We need camera access to scan barcodes. Try again or enter the ISBN by hand.",
      );
    } catch {
      setState("error");
      setError("Couldn't open the camera. Try again in a moment.");
    } finally {
      inFlight.current = false;
    }
  }, []);

  const close = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  const handleBarcode = useCallback((barcode: ScannedBarcode) => {
    if (!isIsbnBarcodeType(barcode.type)) return;
    const normalizer = depsRef.current.normalize ?? normalizeIsbn;
    try {
      const isbn = normalizer(barcode.data);
      depsRef.current.onScan(isbn);
      setState("idle");
      setError(null);
    } catch {
      setState("error");
      setError(
        "That barcode didn't look like an ISBN. Try a different one or type it in.",
      );
    }
  }, []);

  return { state, error, open, close, handleBarcode };
}
