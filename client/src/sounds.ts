import { getSettings } from "./settings.js";

declare global {
  interface Window {
    __gachaJoinSounds?: number;
    __gachaLeaveSounds?: number;
    __gachaBroadcastStartSounds?: number;
    __gachaBroadcastJoinSounds?: number;
  }
}

const audioCache = new Map<string, Promise<HTMLAudioElement>>();

// В десктоп-приложении страница грузится по file://, и <audio> не может играть
// удалённые http(s) URL ("Media load rejected by URL safety check"). Main-процесс
// скачивает звук в локальный кэш и отдаёт file:// URL, который media-элемент
// уже умеет играть (как стандартные звуки).
const resolveSoundUrl = async (src: string): Promise<string> => {
  const getSound = window.desktop?.getSound;
  if (!getSound) return src;
  try {
    let target = src;
    if (target.startsWith("/")) {
      target = "https://gachandra.ru" + target;
    }
    if (/^https?:\/\//i.test(target)) {
      const local = await getSound(target);
      if (local && typeof local === "string") return local;
    }
    return src;
  } catch {
    return src;
  }
};

const makeAudio = (src: string): Promise<HTMLAudioElement> => {
  return resolveSoundUrl(src)
    .then((url) => {
      const el = new Audio(url);
      el.preload = "auto";
      return el;
    })
    .catch(() => {
      const el = new Audio(src);
      el.preload = "auto";
      return el;
    });
};

const playAudioInternal = (src: string, volume = 1) => {
  let p = audioCache.get(src);
  if (!p) {
    p = makeAudio(src);
    audioCache.set(src, p);
  }
  void p.then((el) => {
    try {
      el.volume = volume;
      el.currentTime = 0;
      void el.play().catch(() => {});
    } catch {
      /* ignore */
    }
  });
};

const playAudio = (src: string) => {
  try {
    if (!getSettings().sounds) return;
    playAudioInternal(src);
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

// Старт трансляции — слышат все участники голосового канала.
export const playBroadcastStartSound = () => {
  try {
    playAudio("./sounds/bcast-start.mp3");
    window.__gachaBroadcastStartSounds = (window.__gachaBroadcastStartSounds ?? 0) + 1;
  } catch {
    /* звук некритичен */
  }
};

// Кто-то зашёл на трансляцию — слышит только её организатор.
export const playBroadcastJoinSound = () => {
  try {
    playAudio("./sounds/bcast-join.mp3");
    window.__gachaBroadcastJoinSounds = (window.__gachaBroadcastJoinSounds ?? 0) + 1;
  } catch {
    /* звук некритичен */
  }
};

// Превью в настройках играет всегда, независимо от тумблера «Звуки».
export const playCustomSound = (url: string) => {
  try {
    playAudioInternal(url);
  } catch {
    /* ignore */
  }
};

// Щелчок при нажатии/отпускании клавиши рации — только для самого говорящего.
export const playPttSound = () => {
  try {
    const vol = getSettings().pttSoundVol;
    if (vol <= 0) return;
    playAudioInternal("./sounds/ptt-press.mp3", vol / 100);
  } catch {
    /* ignore */
  }
};
