import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sport-recording-db", () => ({
  loadRecordingState: vi.fn().mockResolvedValue(null),
  saveRecordingState: vi.fn().mockResolvedValue(undefined),
  clearRecordingState: vi.fn().mockResolvedValue(undefined),
}));

import { useActivityRecorder } from "./use-activity-recorder";

describe("useActivityRecorder — permissão de localização", () => {
  const original = navigator.geolocation;
  const getCurrentPosition = vi.fn();

  beforeEach(() => {
    getCurrentPosition.mockReset();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition,
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: original,
    });
  });

  it("não pede localização só porque outra tela do app montou o provider", () => {
    renderHook(() => useActivityRecorder());
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("pede localização apenas depois da ação explícita", async () => {
    getCurrentPosition.mockImplementation((success: PositionCallback) =>
      success({} as GeolocationPosition),
    );
    const { result } = renderHook(() => useActivityRecorder());

    await act(async () => {
      await expect(result.current.requestGps()).resolves.toBe(true);
    });

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(result.current.gpsReady).toBe(true);
  });
});
