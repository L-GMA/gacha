import { useEffect, useState } from "react";
import { api, type Conversation, type DmTarget } from "../api.js";
import { Avatar } from "./Avatar.js";

export function NewDmModal({
  onClose,
  onStart,
}: {
  onClose: () => void;
  onStart: (c: Conversation) => void;
}) {
  const [users, setUsers] = useState<DmTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .users()
      .then(({ users }) => {
        setUsers(users);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Ошибка");
        setLoading(false);
      });
  }, []);

  const start = async (u: DmTarget) => {
    setStarting(u.id);
    setError("");
    try {
      const { conversation } = await api.startDm(u.id);
      if (conversation) onStart(conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setStarting(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          (u.nickname ?? "").toLowerCase().includes(q) ||
          u.login.toLowerCase().includes(q),
      )
    : users;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Новый диалог</h2>
          <button className="icon-btn" title="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        {!loading && users.length > 0 && (
          <label className="field">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по нику…"
            />
          </label>
        )}
        {loading ? (
          <p className="modal-note">Загрузка…</p>
        ) : users.length === 0 ? (
          <p className="modal-note">Нет других участников</p>
        ) : filtered.length === 0 ? (
          <p className="modal-note">Никого не найдено</p>
        ) : (
          <div className="dm-user-list">
            {filtered.map((u) => (
              <button
                key={u.id}
                className={`dm-user ${u.online ? "" : "offline"}`}
                onClick={() => start(u)}
                disabled={starting === u.id}
              >
                <Avatar src={u.avatar} name={u.nickname ?? u.login} size={34} online={u.online} />
                <span className="dm-user-name">{u.nickname ?? u.login}</span>
                <span className="dm-user-login">@{u.login}</span>
                {u.has_dm && <span className="dm-user-badge">диалог есть</span>}
              </button>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
