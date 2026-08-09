import { getSettings } from "./settings.js";

declare global {
  interface Window {
    __gachaJoinSounds?: number;
    __gachaLeaveSounds?: number;
  }
}

const audioCache = new Map<string, HTMLAudioElement>();

const playAudio = (src: string) => {
  try {
    if (!getSettings().sounds) return;
    let el = audioCache.get(src);
    if (!el) {
      el = new Audio(src);
      el.preload = "auto";
      audioCache.set(src, el);
    }
    el.currentTime = 0;
    void el.play().catch(() => {});
  } catch {
    /* звук некритичен */
  }
};

const makePlayer = (defaultSrc: string, key: "join" | "leave") => {
  return (customSrc?: string) => {
    playAudio(customSrc || defaultSrc);
    if (key === "join") window.__gachaJoinSounds = (window.__gachaJoinSounds ?? 0) + 1;
    else window.__gachaLeaveSounds = (window.__gachaLeaveSounds ?? 0) + 1;
  };
};

export const playJoinSound = makePlayer("./sounds/voice-join.wav", "join");
export const playLeaveSound = makePlayer("./sounds/voice-leave.wav", "leave");
