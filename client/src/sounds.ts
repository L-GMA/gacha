import { getSettings } from "./settings.js";

declare global {
  interface Window {
    __gachaJoinSounds?: number;
    __gachaLeaveSounds?: number;
  }
}

const makePlayer = (src: string, key: "join" | "leave") => {
  let el: HTMLAudioElement | null = null;
  return () => {
    try {
      if (getSettings().sounds) {
        if (!el) {
          el = new Audio(src);
          el.preload = "auto";
        }
        el.currentTime = 0;
        void el.play().catch(() => {});
      }
    } catch {
      /* звук некритичен */
    }
    if (key === "join") window.__gachaJoinSounds = (window.__gachaJoinSounds ?? 0) + 1;
    else window.__gachaLeaveSounds = (window.__gachaLeaveSounds ?? 0) + 1;
  };
};

export const playJoinSound = makePlayer("./sounds/voice-join.wav", "join");
export const playLeaveSound = makePlayer("./sounds/voice-leave.wav", "leave");
