import { useEffect, useState } from "react";
import { api, type Member } from "../api.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";

export function ProfileModal({
  member,
  meId,
  onClose,
  onChanged,
  startEditing = false,
}: {
  member: Member;
  meId: string;
  onClose: () => void;
  onChanged: () => void;
  startEditing?: boolean;
}) {
  const isMe = member.id === meId;
  const [editing, setEditing] = useState(startEditing);
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [avatar, setAvatar] = useState(member.avatar ?? "");
  const [bio, setBio] = useState(member.bio ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(startEditing);
    setNickname(member.nickname ?? "");
    setAvatar(member.avatar ?? "");
    setBio(member.bio ?? "");
    setError("");
  }, [member.id]);

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await api.updateMe(nickname.trim() || null, avatar.trim() || null, bio.trim() || null);
      onChanged();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const displayName = member.nickname ?? member.login;
  const roleColor = highestRoleColor(member.roles);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Профиль</h2>
          <button className="icon-btn" title="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="profile-body">
          <div className="profile-hero">
            <Avatar src={member.avatar} name={displayName} size={88} online={member.online} />
            <div className="profile-hero-info">
              <span className="profile-nick" style={roleColor ? { color: roleColor } : undefined}>
                {displayName}
              </span>
              <span className="profile-login">
                @{member.login}
                <span className={`profile-status ${member.online ? "online" : ""}`}>
                  {member.online ? "В сети" : "Оффлайн"}
                </span>
              </span>
              {member.bio && <span className="profile-bio">{member.bio}</span>}
            </div>
          </div>

          <div className="profile-section">
            <span className="profile-label">Роли</span>
            <div className="profile-roles">
              {member.roles.map((r) => (
                <span
                  key={r.id}
                  className="profile-role-badge"
                  style={r.color ? { color: r.color, borderColor: `${r.color}66` } : undefined}
                >
                  {r.color && <span className="profile-role-dot" style={{ background: r.color }} />}
                  {r.name}
                </span>
              ))}
              {member.roles.length === 0 && (
                <span className="profile-role-badge">—</span>
              )}
            </div>
          </div>

          {isMe && !editing && (
            <button className="btn small" onClick={() => setEditing(true)}>
              Изменить профиль
            </button>
          )}

          {isMe && editing && (
            <div className="profile-edit">
              <label className="field">
                <span>Ник</span>
                <input
                  autoFocus
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={member.login}
                  maxLength={32}
                />
              </label>
              <label className="field">
                <span>Аватар (ссылка на картинку)</span>
                <input
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="field">
                <span>О себе (до 50 символов)</span>
                <input
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Кратко о себе…"
                  maxLength={50}
                />
                <span className="field-counter">{bio.length}/50</span>
              </label>
              <p className="hint">
                Ник — отдельное имя для общения, логин не меняется. Когда подключим C3,
                аватарки можно будет загружать напрямую.
              </p>
              {error && <p className="error">{error}</p>}
              <div className="profile-edit-actions">
                <button className="btn primary" disabled={saving} onClick={save}>
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setEditing(false);
                    setError("");
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
