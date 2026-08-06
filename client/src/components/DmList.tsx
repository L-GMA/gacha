import { type Conversation, type Member } from "../api.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";

export function DmList({
  conversations,
  activeId,
  members,
  meId,
  onSelect,
  onStartNew,
}: {
  conversations: Conversation[];
  activeId?: string;
  members: Member[];
  meId: string;
  onSelect: (c: Conversation) => void;
  onStartNew: () => void;
}) {
  return (
    <aside className="panel channels-panel friends-panel">
      <div className="panel-head">
        <span className="panel-title">Друзья</span>
        <button className="icon-btn" title="Новый диалог" onClick={onStartNew}>
          +
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="friends-empty">
          Пока нет диалогов. Нажмите «+», чтобы начать личный чат.
        </p>
      ) : (
        <div className="dm-list">
          {conversations.map((c) => {
            const m = c.member;
            if (!m) return null;
            const member = members.find((x) => x.id === m.id);
            const color = member ? highestRoleColor(member.roles) : undefined;
            const last = c.last_message;
            const mine = last ? last.sender_id === meId : false;
            return (
              <button
                key={c.id}
                className={`dm-item ${activeId === c.id ? "active" : ""}`}
                onClick={() => onSelect(c)}
              >
                <Avatar src={m.avatar} name={m.nickname ?? m.login} size={36} online={m.online} />
                <span className="dm-item-info">
                  <span className="dm-item-name" style={color ? { color } : undefined}>
                    {m.nickname ?? m.login}
                  </span>
                  {last && (
                    <span className="dm-item-preview">
                      {mine && <span className="dm-preview-mine">Вы: </span>}
                      {last.content}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
