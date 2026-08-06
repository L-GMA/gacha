import { useEffect, useState } from "react";
import { api, type PassVoiceChannel, type PassVoiceRole } from "../api.js";

export function CreatePassVoiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (channel: PassVoiceChannel) => void;
}) {
  const [roles, setRoles] = useState<PassVoiceRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [maxRaw, setMaxRaw] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .roles()
      .then(({ roles }) => {
        setRoles(roles);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Ошибка");
        setLoading(false);
      });
  }, []);

  const toggleRole = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maxValue = maxRaw.trim() ? Number(maxRaw) : null;
  const maxError =
    maxValue !== null &&
    (!Number.isInteger(maxValue) || maxValue < 1 || maxValue > 99);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const { channel } = await api.createPassVoice(name.trim(), password, maxValue, [
        ...selected,
      ]);
      onCreated(channel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Новый голосовой канал</h2>
          <button className="icon-btn" title="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="modal-note">
          Канал появится в разделе «Пасс Войс». Войдите в канал, чтобы
          присоединиться к голосовой комнате.
        </p>

        {loading ? (
          <p className="modal-note">Загрузка…</p>
        ) : (
          <>
            <label className="field">
              <span>Название канала</span>
              <input
                autoFocus
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="Мой войс"
              />
            </label>

            <div className="field">
              <span>Кто может зайти</span>
              <div className="pv-roles">
                <button
                  className={`chip ${selected.size === 0 ? "active muted" : ""}`}
                  onClick={() => setSelected(new Set())}
                >
                  Все
                </button>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    className={`chip ${selected.has(r.id) ? "active" : ""}`}
                    style={
                      selected.has(r.id) && r.color
                        ? { borderColor: r.color, color: r.color }
                        : undefined
                    }
                    onClick={() => toggleRole(r.id)}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
              {roles.length === 0 && (
                <span className="field-counter">Ролей пока нет</span>
              )}
            </div>

            <label className="field">
              <span>Пароль (необязательно)</span>
              <input
                type="password"
                value={password}
                maxLength={64}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пусто — без пароля"
              />
            </label>

            <label className="field">
              <span>Максимум участников (необязательно)</span>
              <input
                type="number"
                min={1}
                max={99}
                value={maxRaw}
                onChange={(e) => setMaxRaw(e.target.value)}
                placeholder="Без лимита"
              />
              {maxError && (
                <span className="field-counter">Число от 1 до 99</span>
              )}
            </label>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn primary"
            disabled={busy || loading || !name.trim() || maxError}
            onClick={submit}
          >
            {busy ? "Создаём…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
