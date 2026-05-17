import { describe, it, expect, vi } from "vitest";
import type { ScanButtonProps } from "./ScanButton";
import type { CameraComponent, CameraComponentProps } from "./CameraScanner";
import type { ScanPermissionStatus } from "./useScanCamera";

/**
 * Render-only stub for the camera component. Tests never mount it —
 * they assert that the contract surface accepts the props the
 * production `CameraView` from `expo-camera` actually receives.
 */
const STUB_CAMERA: CameraComponent = (_props: CameraComponentProps) => null;

describe("ScanButton contract (native, G-04, #78)", () => {
  it("requires onScan, requestPermission, and cameraComponent", () => {
    const props: ScanButtonProps = {
      onScan: () => {},
      requestPermission: async () => "granted" as ScanPermissionStatus,
      cameraComponent: STUB_CAMERA,
    };
    expect(typeof props.onScan).toBe("function");
    expect(typeof props.requestPermission).toBe("function");
    expect(typeof props.cameraComponent).toBe("function");
  });

  it("accepts an optional label override", () => {
    const props: ScanButtonProps = {
      onScan: () => {},
      requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
      cameraComponent: STUB_CAMERA,
      label: "Scan ISBN",
    };
    expect(props.label).toBe("Scan ISBN");
  });

  it("accepts an optional normalize seam for tests", () => {
    const normalize = vi.fn((value: string) => value);
    const props: ScanButtonProps = {
      onScan: () => {},
      requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
      cameraComponent: STUB_CAMERA,
      normalize,
    };
    expect(props.normalize).toBe(normalize);
  });

  it("requestPermission supports the granted/denied/undetermined enum", async () => {
    const variants: ReadonlyArray<ScanButtonProps["requestPermission"]> = [
      async (): Promise<ScanPermissionStatus> => "granted",
      async (): Promise<ScanPermissionStatus> => "denied",
      async (): Promise<ScanPermissionStatus> => "undetermined",
      (): ScanPermissionStatus => "granted",
    ];
    for (const variant of variants) {
      const status = await Promise.resolve(variant());
      expect(["granted", "denied", "undetermined"]).toContain(status);
    }
  });

  it("onScan is the same shape the panel wires to backend.lookupByIsbn", () => {
    const calls: string[] = [];
    const props: ScanButtonProps = {
      onScan: (isbn) => calls.push(isbn),
      requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
      cameraComponent: STUB_CAMERA,
    };
    props.onScan("9780553293357");
    expect(calls).toEqual(["9780553293357"]);
  });

  it("cameraComponent matches the CameraView prop surface from expo-camera", () => {
    // Touches every required field of CameraComponentProps so the
    // typecheck enforces the production wiring shape. The runtime
    // assertion just confirms the stub is callable.
    const props: CameraComponentProps = {
      facing: "back",
      barcodeScannerSettings: { barcodeTypes: ["ean13", "upc_a"] },
      onBarcodeScanned: () => {},
    };
    expect(props.facing).toBe("back");
    expect(props.barcodeScannerSettings?.barcodeTypes).toEqual([
      "ean13",
      "upc_a",
    ]);
    expect(typeof STUB_CAMERA).toBe("function");
  });
});
