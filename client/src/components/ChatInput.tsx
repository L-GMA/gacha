import { useRef, useState } from "react";
import { api } from "../api.js";
import { EMOJI_GROUPS } from "../emoji.js";

export function ChatInput({
  placeholder,
  onSend,
}: {
  placeholder: string;
  onSend: (text: string, imageUrl: string | null) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = busy || !text.trim() && !imageUrl;

  const insertEmoji = (e: string) => {
    const el = inputRef.current;
    if (!el) {
      setText((t) => t + e);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + e + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + e.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const pickFile = (f: File | undefined) => {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Можно загружать только изображения");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("Файл слишком большой (максимум 8 МБ)");
      return;
    }
    setImage(f);
    setImageUrl(URL.createObjectURL(f));
  };

  const send = async () => {
    if (busy || (!text.trim() && !image)) return;
    setBusy(true);
    setError("");
    try {
      let url: string | null = null;
      if (image) {
        const res = await api.uploadImage(image);
        url = res.url;
      }
      await onSend(text.trim(), url);
      setText("");
      setImage(null);
      setImageUrl(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-input">
      {image && (
        <div className="chat-input-preview">
          <div className="chat-input-preview-img">
            {imageUrl && <img src={imageUrl} alt="" />}
          </div>
          <span className="chat-input-preview-name">{image.name}</span>
          <button
            className="chat-input-preview-remove"
            title="Убрать"
            onClick={() => {
              setImage(null);
              setImageUrl(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="chat-input-row">
        <button
          className={`chat-tool ${emojiOpen ? "active" : ""}`}
          title="Эмодзи"
          onClick={() => setEmojiOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>
        <button className="chat-tool" title="Загрузить фото" onClick={() => fileRef.current?.click()}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L6 20" />
          </svg>
        </button>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
        />
        <button className="btn primary" disabled={canSend} onClick={send}>
          {busy ? "…" : "Отправить"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </div>
      {error && <p className="error chat-input-error">{error}</p>}

      {emojiOpen && (
        <div className="emoji-picker">
          {EMOJI_GROUPS.map((group) => (
            <div className="emoji-group" key={group.name}>
              <span className="emoji-group-label">{group.name}</span>
              <div className="emoji-grid">
                {group.emojis.map((e) => (
                  <button
                    key={e}
                    className="emoji-cell"
                    onClick={() => {
                      insertEmoji(e);
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
