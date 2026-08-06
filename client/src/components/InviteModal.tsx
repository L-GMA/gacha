import { useEffect, useState } from "react";
import { api, type Invite } from "../api.js";

export function InviteModal({ onClose }: { onClose: () => void }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newCode, setNewCode] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const { invites } = await api.myInvites();
      setInvites(invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createInvite = async () => {
    setError("");
    try {
      const { code } = await api.createInvite();
      setNewCode(code);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const removeInvite = async (id: string) => {
    setError("");
    try {
      await api.deleteInvite(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Пригласить</h2>
          <button className="icon-btn" title="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="hint">
          Выдайте код коллеге — он сможет зарегистрироваться. Код одноразовый.
        </p>

        <button className="btn primary full" onClick={createInvite}>
          Создать пригласительный код
        </button>

        {newCode && (
          <p className="invite-code fresh">
            <span>Новый код</span>
            <strong>{newCode}</strong>
          </p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-body">
          <h3>Мои коды</h3>
          {invites.length === 0 ? (
            <p className="hint">Пока нет созданных кодов</p>
          ) : (
            <ul className="invite-list">
              {invites.map((inv) => (
                <li key={inv.id}>
                  <div className="invite-info">
                    <code>{inv.code}</code>
                    <span className="status">
                      {inv.used_at
                        ? `использован${inv.used_by_login ? ` · @${inv.used_by_login}` : ""}`
                        : "активен"}
                    </span>
                  </div>
                  <button className="btn tiny" onClick={() => removeInvite(inv.id)}>
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
