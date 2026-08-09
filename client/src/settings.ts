export type KrispQuality = "low" | "medium" | "high";

export type VoiceMode = "voice" | "ptt";

export type Hotkeys = {
  ptt: string;
  mute: string;
  deafen: string;
};

export type UserSettings = {
  sounds: boolean;
  notifications: boolean;
  micDeviceId: string;
  cameraDeviceId: string;
  micGain: number;
  krisp: boolean;
  krispQuality: KrispQuality;
  voiceMode: VoiceMode;
  hotkeys: Hotkeys;
};

const KEY = "gacha.settings";
const DEFAULTS: UserSettings = {
  sounds: true,
  notifications: true,
  micDeviceId: "",
  cameraDeviceId: "",
  micGain: 1,
  krisp: true,
  krispQuality: "medium",
  voiceMode: "voice",
  hotkeys: { ptt: "", mute: "", deafen: "" },
};

let current: UserSettings = (() => {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<UserSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
})();

const listeners = new Set<() => void>();

export function getSettings(): UserSettings {
  return current;
}

export function setSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* localStorage недоступен — живём без сохранения */
  }
  for (const l of listeners) l();
}

export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
