import type { LocalAudioTrack } from "livekit-client";
import {
  KrispNoiseFilter,
  isKrispNoiseFilterSupported,
} from "@livekit/krisp-noise-filter";
import type { KrispQuality } from "./settings.js";

let supported: boolean | null = null;

const appliedQuality = new WeakMap<LocalAudioTrack, KrispQuality>();

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
  enabled: boolean,
  quality: KrispQuality,
): Promise<void> {
  if (!track) return;
  try {
    if (!enabled || !isKrispSupported()) {
      if (track.getProcessor()) await track.stopProcessor();
      appliedQuality.delete(track);
      return;
    }
    if (track.getProcessor() && appliedQuality.get(track) === quality) return;
    if (track.getProcessor()) await track.stopProcessor();
    await track.setProcessor(KrispNoiseFilter({ quality }));
    appliedQuality.set(track, quality);
  } catch (err) {
    console.warn("[krisp] обработка шума не применилась:", err);
  }
}
