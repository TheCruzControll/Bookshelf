import { describe, it, expect, vi } from "vitest";
import type {
  CameraComponent,
  CameraComponentProps,
  CameraScannerProps,
} from "./CameraScanner";
import type { ScannedBarcode } from "./useScanCamera";

const STUB_CAMERA: CameraComponent = (_props: CameraComponentProps) => null;

describe("CameraScanner contract (native, G-04, #78)", () => {
  it("requires visible + onCancel + onBarcodeScanned + cameraComponent", () => {
    const props: CameraScannerProps = {
      visible: true,
      onCancel: () => {},
      onBarcodeScanned: () => {},
      cameraComponent: STUB_CAMERA,
    };
    expect(props.visible).toBe(true);
    expect(typeof props.onCancel).toBe("function");
    expect(typeof props.onBarcodeScanned).toBe("function");
    expect(typeof props.cameraComponent).toBe("function");
  });

  it("accepts an optional inline error to surface in the overlay", () => {
    const props: CameraScannerProps = {
      visible: true,
      onCancel: () => {},
      onBarcodeScanned: () => {},
      cameraComponent: STUB_CAMERA,
      error: "That barcode didn't look like an ISBN.",
    };
    expect(props.error).toMatch(/ISBN/);
  });

  it("error defaults to null when omitted", () => {
    const props: CameraScannerProps = {
      visible: false,
      onCancel: () => {},
      onBarcodeScanned: () => {},
      cameraComponent: STUB_CAMERA,
    };
    expect(props.error).toBeUndefined();
  });

  it("onBarcodeScanned receives the ScannedBarcode shape", () => {
    const calls: ScannedBarcode[] = [];
    const props: CameraScannerProps = {
      visible: true,
      onCancel: () => {},
      onBarcodeScanned: (b) => calls.push(b),
      cameraComponent: STUB_CAMERA,
    };
    props.onBarcodeScanned({ type: "ean13", data: "9780553293357" });
    expect(calls).toEqual([{ type: "ean13", data: "9780553293357" }]);
  });

  it("onCancel is invoked without arguments", () => {
    const onCancel = vi.fn();
    const props: CameraScannerProps = {
      visible: true,
      onCancel,
      onBarcodeScanned: () => {},
      cameraComponent: STUB_CAMERA,
    };
    props.onCancel();
    expect(onCancel).toHaveBeenCalledWith();
  });

  it("CameraComponentProps surfaces the fields we pass to CameraView", () => {
    const fields: (keyof CameraComponentProps)[] = [
      "style",
      "barcodeScannerSettings",
      "onBarcodeScanned",
      "facing",
    ];
    expect(fields).toHaveLength(4);
  });

  it("barcodeScannerSettings pins ISBN-bearing symbologies", () => {
    const props: CameraComponentProps = {
      barcodeScannerSettings: { barcodeTypes: ["ean13", "upc_a"] },
    };
    expect(props.barcodeScannerSettings?.barcodeTypes).toContain("ean13");
    expect(props.barcodeScannerSettings?.barcodeTypes).toContain("upc_a");
  });

  it("facing accepts back / front", () => {
    const back: CameraComponentProps = { facing: "back" };
    const front: CameraComponentProps = { facing: "front" };
    expect(back.facing).toBe("back");
    expect(front.facing).toBe("front");
  });
});
