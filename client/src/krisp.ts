import type { LocalAudioTrack } from "livekit-client";
import {
  KrispNoiseFilter,
  isKrispNoiseFilterSupported,
} from "@livekit/krisp-noise-filter";
import type { KrispQuality } from "./settings.js";

let supported: boolean | null = null;

const appliedKey = new WeakMap<LocalAudioTrack, string>();

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
  bvc: boolean,
): Promise<void> {
  if (!track) return;
  try {
    if (!enabled || !isKrispSupported()) {
      if (track.getProcessor()) await track.stopProcessor();
      appliedKey.delete(track);
      return;
    }
    const key = `${quality}:${bvc ? "bvc" : "plain"}`;
    if (track.getProcessor() && appliedKey.get(track) === key) return;
    if (track.getProcessor()) await track.stopProcessor();
    await track.setProcessor(KrispNoiseFilter({ quality, useBVC: bvc }));
    appliedKey.set(track, key);
  } catch (err) {
    console.warn("[krisp] обработка шума не применилась:", err);
  }
}
