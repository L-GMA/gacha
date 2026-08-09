import { type Member } from "../api.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";

export function ProfileModal({
  member,
  onClose,
}: {
  member: Member;
  onClose: () => void;
}) {
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
        </div>
      </div>
    </div>
  );
}
