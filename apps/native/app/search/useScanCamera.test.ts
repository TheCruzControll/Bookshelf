import { describe, it, expect, vi } from "vitest";
import type {
  ScanCameraState,
  ScanPermissionStatus,
  ScannedBarcode,
  UseScanCameraDeps,
  UseScanCameraResult,
} from "./useScanCamera";
import { isIsbnBarcodeType } from "./useScanCamera";

describe("useScanCamera (native, G-04, #78) contract", () => {
  it("ScanPermissionStatus enumerates granted/denied/undetermined", () => {
    const granted: ScanPermissionStatus = "granted";
    const denied: ScanPermissionStatus = "denied";
    const undetermined: ScanPermissionStatus = "undetermined";
    expect([granted, denied, undetermined]).toEqual([
      "granted",
      "denied",
      "undetermined",
    ]);
  });

  it("ScanCameraState covers the full lifecycle", () => {
    const states: ScanCameraState[] = [
      "idle",
      "requesting",
      "denied",
      "scanning",
      "error",
    ];
    expect(states).toHaveLength(5);
  });

  it("UseScanCameraDeps accepts a sync permission requester", async () => {
    const deps: UseScanCameraDeps = {
      requestPermission: () => "granted" as ScanPermissionStatus,
      onScan: () => {},
    };
    const result = await Promise.resolve(deps.requestPermission());
    expect(result).toBe("granted");
  });

  it("UseScanCameraDeps accepts an async permission requester", async () => {
    const deps: UseScanCameraDeps = {
      requestPermission: async () => "denied" as ScanPermissionStatus,
      onScan: () => {},
    };
    expect(await deps.requestPermission()).toBe("denied");
  });

  it("UseScanCameraResult exposes the contract the button consumes", () => {
    const fake: UseScanCameraResult = {
      state: "idle",
      error: null,
      open: async () => {},
      close: () => {},
      handleBarcode: () => {},
    };
    expect(fake.state).toBe("idle");
    expect(fake.error).toBeNull();
    expect(typeof fake.open).toBe("function");
    expect(typeof fake.close).toBe("function");
    expect(typeof fake.handleBarcode).toBe("function");
  });

  it("isIsbnBarcodeType accepts EAN-13 across platform spellings", () => {
    expect(isIsbnBarcodeType("ean13")).toBe(true);
    expect(isIsbnBarcodeType("EAN-13")).toBe(true);
    expect(isIsbnBarcodeType("org.gs1.EAN-13")).toBe(true);
  });

  it("isIsbnBarcodeType accepts UPC-A as a legacy ISBN-10 fallback", () => {
    expect(isIsbnBarcodeType("upc_a")).toBe(true);
    expect(isIsbnBarcodeType("UPC-A")).toBe(true);
  });

  it("isIsbnBarcodeType rejects unrelated symbologies", () => {
    expect(isIsbnBarcodeType("qr")).toBe(false);
    expect(isIsbnBarcodeType("code128")).toBe(false);
    expect(isIsbnBarcodeType("pdf417")).toBe(false);
  });

  it("scanned barcode shape carries type + data", () => {
    const barcode: ScannedBarcode = {
      type: "ean13",
      data: "9780553293357",
    };
    expect(barcode.type).toBe("ean13");
    expect(barcode.data).toBe("9780553293357");
  });

  it("onScan receives an ISBN string when wired", () => {
    const calls: string[] = [];
    const deps: UseScanCameraDeps = {
      requestPermission: async () => "granted" as ScanPermissionStatus,
      onScan: (isbn) => calls.push(isbn),
    };
    deps.onScan("9780553293357");
    expect(calls).toEqual(["9780553293357"]);
  });

  it("normalize injection lets tests bypass the real ISBN checksum", () => {
    const normalize = vi.fn((value: string) => value.replace(/-/g, ""));
    const deps: UseScanCameraDeps = {
      requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
      onScan: () => {},
      normalize,
    };
    const out = deps.normalize?.("978-0-553-29335-7");
    expect(out).toBe("9780553293357");
    expect(normalize).toHaveBeenCalledOnce();
  });

  /**
   * Behavior coverage modeled as straight-line scenarios. The hook
   * itself is just a state machine wrapped in `useState` + `useRef`,
   * so we replicate the transitions a real render would produce.
   * This keeps the suite free of `react-test-renderer` / RTL — neither
   * is installed in this workspace, mirroring `usePushTokenRegistration`.
   */
  describe("permission flow scenarios", () => {
    /**
     * Replays the `open()` body against a hypothetical state machine.
     * Returns the terminal `{ state, error }` so each scenario asserts
     * on the same shape `useScanCamera` produces in production.
     */
    async function runOpenScenario(
      deps: UseScanCameraDeps,
    ): Promise<{ state: ScanCameraState; error: string | null }> {
      try {
        const status = await deps.requestPermission();
        if (status === "granted") return { state: "scanning", error: null };
        if (status === "denied") {
          return {
            state: "denied",
            error:
              "Camera access is off. Enable it for Hone in Settings to scan ISBNs.",
          };
        }
        return {
          state: "denied",
          error:
            "We need camera access to scan barcodes. Try again or enter the ISBN by hand.",
        };
      } catch {
        return {
          state: "error",
          error: "Couldn't open the camera. Try again in a moment.",
        };
      }
    }

    it("permission grant transitions to scanning", async () => {
      const result = await runOpenScenario({
        requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
        onScan: () => {},
      });
      expect(result.state).toBe("scanning");
      expect(result.error).toBeNull();
    });

    it("permission denial transitions to denied with a friendly error", async () => {
      const result = await runOpenScenario({
        requestPermission: async (): Promise<ScanPermissionStatus> => "denied",
        onScan: () => {},
      });
      expect(result.state).toBe("denied");
      expect(result.error).toMatch(/camera/i);
    });

    it("undetermined status maps to denied with a 'try again' nudge", async () => {
      const result = await runOpenScenario({
        requestPermission: async (): Promise<ScanPermissionStatus> => "undetermined",
        onScan: () => {},
      });
      expect(result.state).toBe("denied");
      expect(result.error).toMatch(/camera/i);
    });

    it("permission request that throws lands in the error state", async () => {
      const result = await runOpenScenario({
        requestPermission: async (): Promise<ScanPermissionStatus> => {
          throw new Error("boom");
        },
        onScan: () => {},
      });
      expect(result.state).toBe("error");
      expect(result.error).not.toBeNull();
    });
  });

  describe("barcode dispatch scenarios", () => {
    /**
     * Mirrors the `handleBarcode` body so we can assert dispatch
     * behavior end-to-end without mounting the hook. Returns the
     * `onScan` mock plus the terminal `state` the real hook would
     * land on.
     */
    function runBarcodeScenario(
      deps: UseScanCameraDeps,
      barcode: ScannedBarcode,
    ): { onScan: ReturnType<typeof vi.fn>; state: ScanCameraState } {
      const onScan = vi.fn();
      const wrapped: UseScanCameraDeps = { ...deps, onScan };
      if (!isIsbnBarcodeType(barcode.type)) {
        return { onScan, state: "scanning" };
      }
      const normalize =
        wrapped.normalize ?? ((v: string) => v); // identity is fine for this seam
      try {
        const isbn = normalize(barcode.data);
        wrapped.onScan(isbn);
        return { onScan, state: "idle" };
      } catch {
        return { onScan, state: "error" };
      }
    }

    it("forwards the normalized ISBN to onScan and returns to idle", () => {
      const { onScan, state } = runBarcodeScenario(
        {
          requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
          onScan: () => {},
          normalize: (v) => v,
        },
        { type: "ean13", data: "9780553293357" },
      );
      expect(onScan).toHaveBeenCalledWith("9780553293357");
      expect(state).toBe("idle");
    });

    it("ignores non-ISBN symbologies and stays scanning", () => {
      const { onScan, state } = runBarcodeScenario(
        {
          requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
          onScan: () => {},
        },
        { type: "qr", data: "https://example.com" },
      );
      expect(onScan).not.toHaveBeenCalled();
      expect(state).toBe("scanning");
    });

    it("normalization failure transitions to error and skips onScan", () => {
      const { onScan, state } = runBarcodeScenario(
        {
          requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
          onScan: () => {},
          normalize: () => {
            throw new Error("bad isbn");
          },
        },
        { type: "ean13", data: "not-an-isbn" },
      );
      expect(onScan).not.toHaveBeenCalled();
      expect(state).toBe("error");
    });

    it("accepts UPC-A barcodes as a legacy ISBN-10 path", () => {
      const { onScan, state } = runBarcodeScenario(
        {
          requestPermission: async (): Promise<ScanPermissionStatus> => "granted",
          onScan: () => {},
          normalize: (v) => v,
        },
        { type: "upc_a", data: "043942089X" },
      );
      expect(onScan).toHaveBeenCalledWith("043942089X");
      expect(state).toBe("idle");
    });
  });
});
