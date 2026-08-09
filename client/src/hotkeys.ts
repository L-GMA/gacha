export type HotkeyKind = "ptt" | "mute" | "deafen";

const CODE_LABELS: Record<string, string> = {
  Space: "Пробел",
  Escape: "Esc",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Tab: "Tab",
  Enter: "Enter",
  NumpadEnter: "Enter",
  NumLock: "Num Lock",
  CapsLock: "Caps Lock",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  AltLeft: "Alt",
  AltRight: "Alt",
  MetaLeft: "Win",
  MetaRight: "Win",
  Pause: "Pause",
  ScrollLock: "Scroll Lock",
  Insert: "Ins",
  Delete: "Del",
  Backspace: "Backspace",
};

export function hotkeyLabel(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  const key = code.match(/^Key([A-Z])$/);
  if (key) return key[1];
  const digit = code.match(/^Digit([0-9])$/);
  if (digit) return digit[1];
  const f = code.match(/^F(\d{1,2})$/);
  if (f) return `F${f[1]}`;
  const num = code.match(/^Numpad(\d)$/);
  if (num) return `Num${num[1]}`;
  return code;
}

export function isModifierKey(code: string): boolean {
  return [
    "ControlLeft",
    "ControlRight",
    "ShiftLeft",
    "ShiftRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
    "CapsLock",
    "NumLock",
    "ScrollLock",
  ].includes(code);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}
