import { Fragment } from "react";
import { type Member } from "../api.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";

export function MembersPanel({
  members,
  onSelect,
}: {
  members: Member[];
  onSelect: (m: Member) => void;
}) {
  const Row = ({ m }: { m: Member }) => {
    const color = highestRoleColor(m.roles);
    return (
      <li className="member-row" onClick={() => onSelect(m)}>
        <Avatar src={m.avatar} name={m.nickname ?? m.login} size={32} online={m.online} />
        <span className="member-info">
          <span className={`member-name ${m.online ? "" : "offline"}`} style={color ? { color } : undefined}>
            {m.nickname ?? m.login}
          </span>
          {m.bio && <span className="member-bio">{m.bio}</span>}
        </span>
      </li>
    );
  };

  const byPos = (a: { position?: number }, b: { position?: number }) =>
    (a.position ?? 0) - (b.position ?? 0);

  const highlighted = members
    .flatMap((m) => m.roles)
    .filter((r) => r.highlight)
    .sort(byPos)
    .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);

  const bySection = new Map<string, Member[]>();
  const onlineRest: Member[] = [];
  const offline: Member[] = [];
  for (const m of members) {
    if (!m.online) {
      offline.push(m);
      continue;
    }
    const hl = [...m.roles].filter((r) => r.highlight).sort(byPos)[0];
    if (hl) {
      const list = bySection.get(hl.id) ?? [];
      list.push(m);
      bySection.set(hl.id, list);
    } else {
      onlineRest.push(m);
    }
  }

  const Group = ({ label, list }: { label: string; list: Member[] }) => (
    <>
      <p className="group-label">{label}</p>
      <ul className="member-list">
        {list.map((m) => (
          <Row key={m.id} m={m} />
        ))}
      </ul>
    </>
  );

  return (
    <aside className="panel members-panel">
      <div className="members-stats">
        <div className="stats-item">
          <span className="stats-value">{members.length}</span>
          <span className="stats-label">Участников</span>
        </div>
        <span className="stats-divider" />
        <div className="stats-item">
          <span className="stats-value online">
            {members.filter((m) => m.online).length}
          </span>
          <span className="stats-label">В сети</span>
        </div>
      </div>
      <div className="member-groups">
        {highlighted.map((r) => {
          const list = bySection.get(r.id) ?? [];
          if (list.length === 0) return null;
          return (
            <Fragment key={r.id}>
              <p className="group-label" style={r.color ? { color: r.color } : undefined}>
                {r.name} — {list.length}
              </p>
              <ul className="member-list">
                {list.map((m) => (
                  <Row key={m.id} m={m} />
                ))}
              </ul>
            </Fragment>
          );
        })}
        {onlineRest.length > 0 && (
          <Group label={`В сети — ${onlineRest.length}`} list={onlineRest} />
        )}
        {offline.length > 0 && (
          <Group label={`Не в сети — ${offline.length}`} list={offline} />
        )}
      </div>
    </aside>
  );
}
