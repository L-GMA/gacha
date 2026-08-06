import { useState } from "react";
import { api, type PassVoiceChannel, type PassVoiceParticipant } from "../api.js";

export function JoinPassVoiceModal({
  channel,
  onClose,
  onJoined,
}: {
  channel: PassVoiceChannel;
  onClose: () => void;
  onJoined: (participants: PassVoiceParticipant[]) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const { participants } = await api.joinPassVoice(channel.id, password);
      onJoined(participants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Вход в канал</h2>
          <button className="icon-btn" title="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="modal-note">
          Канал «{channel.name}» защищён паролем. Введите пароль, чтобы войти.
        </p>
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Пароль"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? "Входим…" : "Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}
