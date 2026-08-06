import type { LocalAudioTrack } from "livekit-client";
import {
  KrispNoiseFilter,
  isKrispNoiseFilterSupported,
} from "@livekit/krisp-noise-filter";

let supported: boolean | null = null;

export function isKrispSupported(): boolean {
  if (supported === null) {
    try {
      supported =
        typeof AudioWorklet !== "undefined" &&
        typeof WebAssembly !== "undefined" &&
        isKrispNoiseFilterSupported();
    } catch {
      supported = false;
    }
  }
  return supported;
}

export async function applyKrisp(
  track: LocalAudioTrack | undefined | null,
  enable: boolean,
): Promise<void> {
  if (!track) return;
  try {
    if (enable && isKrispSupported()) {
      if (track.getProcessor()) return;
      await track.setProcessor(KrispNoiseFilter({ quality: "medium" }));
    } else if (track.getProcessor()) {
      await track.stopProcessor();
    }
  } catch (err) {
    console.warn("[krisp] обработка шума не применилась:", err);
  }
}
