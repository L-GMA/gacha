import { useEffect, useState } from "react";
import { api, type PassVoiceChannel, type PassVoiceRole } from "../api.js";

export function EditPassVoiceModal({
  channel,
  onClose,
  onUpdated,
}: {
  channel: PassVoiceChannel;
  onClose: () => void;
  onUpdated: (channel: PassVoiceChannel) => void;
}) {
  const [roles, setRoles] = useState<PassVoiceRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(channel.name);
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [maxRaw, setMaxRaw] = useState(
    channel.max_participants != null ? String(channel.max_participants) : "",
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(channel.allowed_role_ids),
  );
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
      const { channel: updated } = await api.updatePassVoice(channel.id, {
        name: name.trim(),
        password: password.trim(),
        clearPassword: removePassword,
        maxParticipants: maxValue,
        roleIds: [...selected],
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Настройки канала</h2>
          <button className="icon-btn" title="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="modal-note">
          Настроить канал может только его создатель.
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

            <label className="field">
              <span>
                {channel.has_password ? "Новый пароль (или измените)" : "Пароль (необязательно)"}
              </span>
              <input
                type="password"
                value={password}
                maxLength={64}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (e.target.value) setRemovePassword(false);
                }}
                placeholder={
                  channel.has_password
                    ? "Оставить прежний — оставьте пустым"
                    : "Пусто — без пароля"
                }
              />
            </label>
            {channel.has_password && (
              <label className="field">
                <span className="field-counter">
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={removePassword}
                      onChange={(e) => {
                        setRemovePassword(e.target.checked);
                        if (e.target.checked) setPassword("");
                      }}
                    />
                    Убрать пароль
                  </label>
                </span>
              </label>
            )}
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
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
