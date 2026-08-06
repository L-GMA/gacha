import { useEffect, useRef, useState } from "react";
import {
  api,
  type Member,
  type Role,
  type RolePermissions,
  type SettingsData,
  type S3Settings,
} from "../api.js";
import { Toggle } from "./Toggle.js";
import { Avatar } from "./Avatar.js";
import { highestRoleColor } from "../roleColor.js";

type Tab = "channels" | "roles" | "members" | "important";

const PERM_LABELS: { key: keyof RolePermissions; label: string; hint: string }[] = [
  { key: "invite", label: "Приглашения", hint: "Может создавать пригласительные коды" },
  { key: "manage_channels", label: "Управление каналами", hint: "Создаёт и настраивает каналы" },
  { key: "manage_roles", label: "Управление ролями", hint: "Создаёт роли и назначает их" },
];

export function SettingsModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("channels");
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      setData(await api.settings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  if (!data) return <div className="modal-backdrop">...</div>;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Настройки сервера</h2>
          <button className="icon-btn" title="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-tabs">
          {(["channels", "roles", "members", "important"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`settings-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "channels" ? "Каналы" : t === "roles" ? "Роли" : t === "members" ? "Участники" : "Важное"}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}

        {tab === "channels" && (
          <ChannelsTab data={data} run={run} />
        )}
        {tab === "roles" && (
          <RolesTab data={data} run={run} />
        )}
        {tab === "members" && (
          <MembersTab data={data} run={run} />
        )}
        {tab === "important" && <ImportantTab />}
      </div>
    </div>
  );
}

/* ---------------- Вспомогательные ---------------- */

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "🤩", "😎", "🥳", "😴",
  "🤔", "🙃", "😢", "😭", "😡", "🤯", "😱", "😇", "🤗", "🥰",
  "👍", "👎", "👌", "✌️", "🤝", "🙏", "💪", "👋", "🤞", "👏",
  "🔥", "✨", "⭐", "💯", "🎉", "🎊", "🎯", "🏆", "🎁", "🚀",
  "❤️", "💙", "💚", "💛", "💜", "🖤", "💡", "🎈", "🌈", "☀️",
  "🌙", "⚡", "❄️", "🍀", "🌊", "☕", "🍕", "🍔", "🍎", "🎧",
  "🎤", "🎮", "🎲", "🎨", "📷", "💬", "📢", "🔔", "🔒", "📌",
  "🤖", "👾", "🐱", "🐶", "🦊", "🐼", "🦄", "🐢", "🍄", "🌵",
];

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="emoji-pop">
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button type="button" key={e} className="emoji" onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmojiNameInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? pos;
    onChange(value.slice(0, pos) + emoji + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + emoji.length, pos + emoji.length);
    });
  };

  return (
    <span className="emoji-name-editor">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="icon-btn"
        title="Вставить смайлик"
        onClick={() => setEmojiOpen((o) => !o)}
      >
        ☺
      </button>
      {emojiOpen && (
        <EmojiPicker
          onPick={(emoji) => {
            insertEmoji(emoji);
            setEmojiOpen(false);
          }}
        />
      )}
    </span>
  );
}

function NameEditor({
  value,
  onChange,
  color,
  onColor,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  color: string | null;
  onColor: (c: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? pos;
    const next = value.slice(0, pos) + emoji + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + emoji.length, pos + emoji.length);
    });
  };

  return (
    <span className="name-editor">
      <input
        ref={inputRef}
        autoFocus
        draggable={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <span className="name-editor-tools">
        <input
          type="color"
          className="color-input"
          title="Цвет названия"
          value={color ?? "#d6d6d8"}
          onChange={(e) => onColor(e.target.value)}
        />
        <button
          type="button"
          className="icon-btn"
          title="Вставить смайлик"
          onClick={() => setEmojiOpen((o) => !o)}
        >
          ☺
        </button>
      </span>
      {emojiOpen && (
        <EmojiPicker
          onPick={(emoji) => {
            insertEmoji(emoji);
            setEmojiOpen(false);
          }}
        />
      )}
    </span>
  );
}

/* ---------------- Каналы ---------------- */

function ChannelsTab({
  data,
  run,
}: {
  data: SettingsData;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newCatColor, setNewCatColor] = useState<string | null>(null);
  const [addingCh, setAddingCh] = useState<string | null>(null);
  const [newCh, setNewCh] = useState("");
  const [newChColor, setNewChColor] = useState<string | null>(null);
  const [newChType, setNewChType] = useState<"text" | "voice">("text");
  const [renaming, setRenaming] = useState<{ id: string; name: string; color: string | null; type: "cat" | "ch" } | null>(null);
  const [cats, setCats] = useState(data.categories);
  const [dragCat, setDragCat] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null);
  const [dragCh, setDragCh] = useState<{ cat: string; id: string } | null>(null);
  const [overCh, setOverCh] = useState<string | null>(null);

  useEffect(() => {
    setCats(data.categories);
  }, [data]);

  const nonAdminRoles = data.roles.filter((r) => r.kind !== "admin");

  const moveIn = <T,>(arr: T[], from: number, to: number): T[] => {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };

  const clearDrag = () => {
    setDragCat(null);
    setDragCh(null);
    setOverCat(null);
    setOverCh(null);
  };

  const startCatDrag = (e: React.DragEvent, id: string) => {
    if (e.target !== e.currentTarget) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDragCh(null);
    setDragCat(id);
  };

  const startChDrag = (e: React.DragEvent, catId: string, chId: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chId);
    setDragCat(null);
    setDragCh({ cat: catId, id: chId });
  };

  const dropCatOn = (overId: string) => {
    if (!dragCat || dragCat === overId) return;
    const from = cats.findIndex((c) => c.id === dragCat);
    const to = cats.findIndex((c) => c.id === overId);
    if (from === -1 || to === -1) return;
    const next = moveIn(cats, from, to);
    setCats(next);
    run(() => api.reorderCategories(next.map((c) => c.id)));
    clearDrag();
  };

  const dropChOn = (catId: string, overChId: string) => {
    if (!dragCh || dragCh.cat !== catId || dragCh.id === overChId) return;
    const list = cats.find((c) => c.id === catId)?.channels;
    if (!list) return;
    const from = list.findIndex((c) => c.id === dragCh.id);
    const to = list.findIndex((c) => c.id === overChId);
    if (from === -1 || to === -1) return;
    const next = moveIn(list, from, to);
    setCats(cats.map((c) => (c.id === catId ? { ...c, channels: next } : c)));
    run(() => api.reorderChannels(catId, next.map((c) => c.id)));
    clearDrag();
  };

  const appendCh = (catId: string) => {
    if (!dragCh || dragCh.cat !== catId) return;
    const list = cats.find((c) => c.id === catId)?.channels;
    if (!list) return;
    const item = list.find((c) => c.id === dragCh.id);
    if (!item || list[list.length - 1].id === dragCh.id) return;
    const next = [...list.filter((c) => c.id !== dragCh.id), item];
    setCats(cats.map((c) => (c.id === catId ? { ...c, channels: next } : c)));
    run(() => api.reorderChannels(catId, next.map((c) => c.id)));
    clearDrag();
  };

  const appendCat = () => {
    if (!dragCat) return;
    const item = cats.find((c) => c.id === dragCat);
    if (!item || cats[cats.length - 1].id === dragCat) return;
    const next = [...cats.filter((c) => c.id !== dragCat), item];
    setCats(next);
    run(() => api.reorderCategories(next.map((c) => c.id)));
    clearDrag();
  };

  const submitCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    run(() => api.createCategory(newCat.trim(), newCatColor)).then(() => {
      setNewCat("");
      setNewCatColor(null);
      setAddingCat(false);
    });
  };

  const submitChannel = (e: React.FormEvent, categoryId: string) => {
    e.preventDefault();
    if (!newCh.trim()) return;
    run(() => api.createChannel(categoryId, newCh.trim(), newChType, newChColor)).then(() => {
      setNewCh("");
      setNewChColor(null);
      setAddingCh(null);
    });
  };

  return (
    <div
      className="settings-content"
      onDragOver={(e) => {
        if (dragCat || dragCh) e.preventDefault();
      }}
      onDrop={(e) => {
        if (dragCat) {
          e.preventDefault();
          appendCat();
        }
      }}
      onDragEnd={clearDrag}
    >
      <div className="settings-actions">
        <button className="btn small" onClick={() => setAddingCat(!addingCat)}>
          + Раздел
        </button>
        {addingCat && (
          <form className="inline-form" onSubmit={submitCategory}>
            <NameEditor
              value={newCat}
              onChange={setNewCat}
              color={newCatColor}
              onColor={setNewCatColor}
              placeholder="Название раздела"
            />
            <button className="btn tiny">Создать</button>
          </form>
        )}
      </div>

      {cats.map((cat) => (
        <div
          className={`settings-category ${overCat === cat.id && dragCat ? "drop-target" : ""}`}
          key={cat.id}
          draggable
          onDragStart={(e) => startCatDrag(e, cat.id)}
          onDragOver={(e) => {
            if (!dragCat && !dragCh) return;
            e.preventDefault();
            if (dragCat) setOverCat(cat.id);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragCat) dropCatOn(cat.id);
            else if (dragCh && dragCh.cat === cat.id) appendCh(cat.id);
          }}
        >
          <div className="settings-cat-head">
            {renaming?.type === "cat" && renaming.id === cat.id ? (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!renaming.name.trim()) return;
                  run(() => api.renameCategory(cat.id, renaming.name.trim(), renaming.color)).then(
                    () => setRenaming(null),
                  );
                }}
              >
                <NameEditor
                  value={renaming.name}
                  onChange={(name) => setRenaming({ ...renaming, name })}
                  color={renaming.color}
                  onColor={(color) => setRenaming({ ...renaming, color })}
                />
                <button className="btn tiny">OK</button>
              </form>
            ) : (
              <>
                <span className="settings-cat-name" style={cat.color ? { color: cat.color } : undefined}>
                  {cat.name.toUpperCase()}
                </span>
                <span className="cat-actions">
                  <button
                    className="icon-btn"
                    title="Переименовать"
                    onClick={() =>
                      setRenaming({ id: cat.id, name: cat.name, color: cat.color, type: "cat" })
                    }
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn"
                    title="Удалить раздел"
                    onClick={() =>
                      confirm(`Удалить раздел «${cat.name}» со всеми каналами?`) &&
                      run(() => api.deleteCategory(cat.id))
                    }
                  >
                    ×
                  </button>
                </span>
              </>
            )}
          </div>

          {cat.channels.map((ch) => (
            <div
              className={`settings-channel ${overCh === ch.id && dragCh?.cat === cat.id ? "drop-target" : ""}`}
              key={ch.id}
              draggable
              onDragStart={(e) => startChDrag(e, cat.id, ch.id)}
              onDragOver={(e) => {
                if (dragCh && dragCh.cat === cat.id) {
                  e.preventDefault();
                  e.stopPropagation();
                  setOverCh(ch.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dropChOn(cat.id, ch.id);
              }}
            >
              <div className="settings-ch-head">
                {renaming?.type === "ch" && renaming.id === ch.id ? (
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!renaming.name.trim()) return;
                      run(() =>
                        api.renameChannel(ch.id, renaming.name.trim(), renaming.color),
                      ).then(() => setRenaming(null));
                    }}
                  >
                    <NameEditor
                      value={renaming.name}
                      onChange={(name) => setRenaming({ ...renaming, name })}
                      color={renaming.color}
                      onColor={(color) => setRenaming({ ...renaming, color })}
                    />
                    <button className="btn tiny">OK</button>
                  </form>
                ) : (
                  <>
                    <span className="settings-ch-name">
                      <span className="ch-icon">{ch.type === "text" ? "#" : "◉"}</span>
                      <span style={ch.color ? { color: ch.color } : undefined}>{ch.name}</span>
                      <span className="ch-type">{ch.type === "text" ? "текст" : "голос"}</span>
                    </span>
                    <span className="cat-actions">
                      <button
                        className="icon-btn"
                        title="Доступ"
                        onClick={() => setExpanded(expanded === ch.id ? null : ch.id)}
                      >
                        {expanded === ch.id ? "⌄" : "⌃"}
                      </button>
                      <button
                        className="icon-btn"
                        title="Переименовать"
                        onClick={() =>
                          setRenaming({ id: ch.id, name: ch.name, color: ch.color, type: "ch" })
                        }
                      >
                        ✎
                      </button>
                      <button
                        className="icon-btn"
                        title="Удалить канал"
                        onClick={() =>
                          confirm(`Удалить канал «${ch.name}»?`) &&
                          run(() => api.deleteChannel(ch.id))
                        }
                      >
                        ×
                      </button>
                    </span>
                  </>
                )}
              </div>

              {expanded === ch.id && (
                <div className="perm-grid">
                  {nonAdminRoles.map((role) => {
                    const perm = ch.permissions.find((p) => p.role_id === role.id);
                    const canView = perm?.can_view ?? true;
                    const canSend = perm?.can_send ?? true;
                    return (
                      <div className="perm-row" key={role.id}>
                        <span className="perm-role">{role.name}</span>
                        <span className="perm-item">
                          <span>Видит канал</span>
                          <Toggle
                            checked={canView}
                            onChange={(v) =>
                              run(() =>
                                api.setChannelPermission(ch.id, role.id, v, v ? canSend : false),
                              )
                            }
                          />
                        </span>
                        {ch.type === "text" && (
                          <span className="perm-item">
                            <span>Может писать</span>
                            <Toggle
                              checked={canSend}
                              onChange={(v) =>
                                run(() =>
                                  api.setChannelPermission(ch.id, role.id, v ? true : canView, v),
                                )
                              }
                            />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {addingCh === cat.id ? (
            <form className="inline-form" onSubmit={(e) => submitChannel(e, cat.id)}>
              <select
                value={newChType}
                onChange={(e) => setNewChType(e.target.value as "text" | "voice")}
              >
                <option value="text">Текстовый</option>
                <option value="voice">Голосовой</option>
              </select>
              <NameEditor
                value={newCh}
                onChange={setNewCh}
                color={newChColor}
                onColor={setNewChColor}
                placeholder="Название канала"
              />
              <button className="btn tiny">Создать</button>
            </form>
          ) : (
            <button className="add-channel" onClick={() => setAddingCh(cat.id)}>
              + добавить канал
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Роли ---------------- */

function RolesTab({
  data,
  run,
}: {
  data: SettingsData;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(data.roles[0]?.id ?? null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [roles, setRoles] = useState(data.roles);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const selected = data.roles.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    setRoles(data.roles);
  }, [data.roles]);

  useEffect(() => {
    if (!data.roles.some((r) => r.id === selectedId)) {
      setSelectedId(data.roles[0]?.id ?? null);
    }
  }, [data.roles, selectedId]);

  const moveIn = <T,>(arr: T[], from: number, to: number): T[] => {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };

  const startDrag = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDragId(id);
  };

  const dropOn = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!dragId || dragId === id) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const dragged = roles.find((r) => r.id === dragId);
    const target = roles.find((r) => r.id === id);
    if (!dragged || dragged.kind === "admin" || !target || target.kind === "admin") {
      setDragId(null);
      setOverId(null);
      return;
    }
    const from = roles.findIndex((r) => r.id === dragId);
    const to = roles.findIndex((r) => r.id === id);
    if (from === -1 || to === -1) return;
    const next = moveIn(roles, from, to);
    setRoles(next);
    run(() => api.reorderRoles(next.map((r) => r.id)));
    setDragId(null);
    setOverId(null);
  };

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      const { id } = await api.createRole(newName.trim());
      setSelectedId(id);
    }).then(() => {
      setNewName("");
      setCreating(false);
    });
  };

  return (
    <div className="settings-content">
      <div className="roles-layout">
        <div className="roles-list">
          <div className="roles-list-scroll">
            {roles.map((r) => (
              <button
                type="button"
                key={r.id}
                draggable={r.kind !== "admin"}
                className={`role-list-item ${r.id === selectedId ? "active" : ""} ${r.highlight ? "highlighted" : ""} ${dragId === r.id ? "dragging" : ""} ${overId === r.id && dragId && dragId !== r.id ? "drag-over" : ""}`}
                onClick={() => setSelectedId(r.id)}
                onDragStart={(e) => startDrag(e, r.id)}
                onDragOver={(e) => {
                  if (dragId && dragId !== r.id && r.kind !== "admin") {
                    e.preventDefault();
                    setOverId(r.id);
                  }
                }}
                onDrop={(e) => dropOn(e, r.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <span
                  className={`role-dot ${r.kind === "admin" && !r.color ? "admin" : ""}`}
                  style={r.color ? { background: r.color } : undefined}
                />
                <span className="role-list-name">{r.name}</span>
                <span className="role-grip">⠿</span>
              </button>
            ))}
          </div>
          {creating ? (
            <form className="inline-form role-create" onSubmit={submitCreate}>
              <EmojiNameInput
                value={newName}
                onChange={setNewName}
                placeholder="Название роли"
                autoFocus
              />
              <button className="btn tiny">Создать</button>
            </form>
          ) : (
            <button type="button" className="role-add" onClick={() => setCreating(true)}>
              + Добавить роль
            </button>
          )}
        </div>

        <div className="role-detail">
          {selected ? (
            <RoleCard
              role={selected}
              run={run}
              renaming={renaming}
              setRenaming={setRenaming}
              onDelete={() => setSelectedId(null)}
            />
          ) : (
            <p className="role-empty">Выберите роль слева</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  role,
  run,
  renaming,
  setRenaming,
  onDelete,
}: {
  role: Role;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  renaming: { id: string; name: string } | null;
  setRenaming: (v: { id: string; name: string } | null) => void;
  onDelete?: () => void;
}) {
  const locked = role.kind === "admin";

  const setPerm = (key: keyof RolePermissions, value: boolean) => {
    run(() =>
      api.updateRole(role.id, { permissions: { ...role.permissions, [key]: value } }),
    );
  };

  const setHighlight = (v: boolean) => {
    run(() => api.updateRole(role.id, { highlight: v }));
  };

  const [draftColor, setDraftColor] = useState(role.color ?? "");
  useEffect(() => setDraftColor(role.color ?? ""), [role.color]);
  const persistColor = () => {
    if (draftColor !== (role.color ?? "")) {
      run(() => api.updateRole(role.id, { color: draftColor || null }));
    }
  };

  return (
    <div className="role-card">
      <div className="role-head">
        {renaming?.id === role.id && !locked ? (
          <form
            className="inline-form role-rename-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!renaming.name.trim()) return;
              run(() => api.updateRole(role.id, { name: renaming.name.trim() })).then(() =>
                setRenaming(null),
              );
            }}
          >
            <EmojiNameInput
              value={renaming.name}
              onChange={(v) => setRenaming({ ...renaming, name: v })}
              autoFocus
            />
            <button className="btn tiny">OK</button>
          </form>
        ) : (
          <>
            <span className="role-name">
              <input
                type="color"
                className="role-color-input"
                title="Цвет роли"
                value={draftColor || "#d6d6d8"}
                onChange={(e) => setDraftColor(e.target.value)}
                onBlur={persistColor}
              />
              <span
                className="role-name-text"
                style={role.color ? { color: role.color } : undefined}
              >
                {role.name}
              </span>
              <span className={`kind-badge ${role.kind}`}>
                {locked ? "Системная" : role.kind === "default" ? "Базовая" : "Кастомная"}
              </span>
            </span>
            <span className="cat-actions">
              {!locked && (
                <button
                  className="icon-btn"
                  title="Переименовать"
                  onClick={() => setRenaming({ id: role.id, name: role.name })}
                >
                  ✎
                </button>
              )}
              {role.kind === "custom" && (
                <button
                  className="icon-btn"
                  title="Удалить роль"
                  onClick={() =>
                    confirm(`Удалить роль «${role.name}»? Участники станут «Участниками».`) &&
                    run(() => api.deleteRole(role.id)).then(onDelete)
                  }
                >
                  ×
                </button>
              )}
            </span>
          </>
        )}
      </div>

      <div className="perm-grid">
        <div className="perm-row">
          <span className="perm-item wide">
            <span className="perm-label">
              Выделять
              <small>Показывать участников этой роли отдельным разделом</small>
            </span>
            <Toggle checked={role.highlight} onChange={setHighlight} label="Выделять" />
          </span>
        </div>
        {PERM_LABELS.map(({ key, label, hint }) => (
          <div className="perm-row" key={key}>
            <span className="perm-item wide">
              <span className="perm-label">
                {label}
                <small>{hint}</small>
              </span>
              <Toggle
                checked={locked ? true : role.permissions[key]}
                onChange={(v) => setPerm(key, v)}
                label={label}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Участники ---------------- */

function MembersTab({
  data,
  run,
}: {
  data: SettingsData;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [meId, setMeId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setMeId(user.id))
      .catch(() => {});
  }, []);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
  };

  const openMember = (m: Member) => {
    setOpenId(m.id);
    setDraft(m.roles.map((r) => r.id));
    setError("");
  };

  const toggleRole = (roleId: string) => {
    setDraft((d) => {
      if (d.includes(roleId)) return d.filter((x) => x !== roleId);
      if (d.length >= 20) return d;
      return [...d, roleId];
    });
  };

  const saveRoles = (m: Member) => {
    setError("");
    if (draft.length === 0) {
      setError("У пользователя должна быть хотя бы одна роль");
      return;
    }
    run(() => api.setUserRoles(m.id, draft)).then(() => setOpenId(null));
  };

  const toggleBan = (m: Member) => {
    setError("");
    if (m.id === meId) return;
    if (
      !m.banned &&
      !confirm(`Заблокировать ${m.nickname ?? m.login}? Он не сможет войти в сервер.`)
    ) {
      return;
    }
    run(() => api.setUserBan(m.id, !m.banned));
  };

  return (
    <div className="settings-content">
      {data.members.map((m) => {
        const open = openId === m.id;
        const isMe = m.id === meId;
        const nameColor = highestRoleColor(m.roles);
        return (
          <div className={`settings-member ${m.banned ? "banned" : ""}`} key={m.id}>
            <div className="settings-member-head">
              <Avatar src={m.avatar} name={m.nickname ?? m.login} size={32} online={m.online} />
              <div className="settings-member-info">
                <span
                  className={`settings-member-name ${m.online ? "" : "offline"}`}
                  style={nameColor ? { color: nameColor } : undefined}
                >
                  {m.nickname ?? m.login}
                  {isMe && <span className="you-badge">это вы</span>}
                  {m.banned && <span className="ban-badge">заблокирован</span>}
                </span>
                <span className="settings-member-meta">
                  @{m.login} · рег. {fmtDate(m.created_at) || "—"}
                  {m.invited_by ? ` · пригласил @${m.invited_by}` : ""}
                </span>
                <span className="settings-member-roles">
                  {m.roles.map((r) => (
                    <span
                      key={r.id}
                      className="role-mini"
                      style={r.color ? { color: r.color, borderColor: `${r.color}66` } : undefined}
                    >
                      {r.color && <span className="role-mini-dot" style={{ background: r.color }} />}
                      {r.name}
                    </span>
                  ))}
                </span>
              </div>
              <button
                className="icon-btn"
                title="Настройки участника"
                onClick={() => openMember(m)}
              >
                ⚙
              </button>
            </div>

            {open && (
              <div className="member-edit">
                <span className="member-edit-title">Роли — {draft.length}/20</span>
                <div className="role-check-grid">
                  {data.roles.map((r) => {
                    const checked = draft.includes(r.id);
                    const atLimit = draft.length >= 20 && !checked;
                    return (
                      <label
                        key={r.id}
                        className={`role-check ${checked ? "checked" : ""} ${atLimit ? "disabled" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={atLimit}
                          onChange={() => toggleRole(r.id)}
                        />
                        <span className="role-check-dot" style={r.color ? { background: r.color } : undefined} />
                        <span>{r.name}</span>
                      </label>
                    );
                  })}
                </div>
                {error && <p className="error">{error}</p>}
                <div className="member-edit-actions">
                  <button className="btn primary" onClick={() => saveRoles(m)}>
                    Сохранить
                  </button>
                  {!isMe && (
                    <button
                      className={`btn ${m.banned ? "ghost" : "danger"}`}
                      onClick={() => toggleBan(m)}
                    >
                      {m.banned ? "Разбанить" : "Забанить"}
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => setOpenId(null)}>
                    Закрыть
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Важные настройки ---------------- */

const EMPTY_S3: S3Settings = {
  bucket: "",
  region: "",
  endpoint: "",
  accessKeyId: "",
  secretAccessKey: "",
  publicUrl: "",
};

function ImportantTab() {
  const [draft, setDraft] = useState<S3Settings>(EMPTY_S3);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getS3Settings()
      .then(({ s3 }) => {
        setDraft(s3 ?? EMPTY_S3);
        setConfigured(!!s3);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof S3Settings, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await api.saveS3Settings(draft);
      setConfigured(true);
      setStatus({ ok: true, text: "S3 подключено. Новые фото будут храниться в облаке." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await api.clearS3Settings();
      setConfigured(false);
      setStatus({ ok: true, text: "S3 отключено. Фото снова хранятся локально." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-content">
        <p className="modal-note">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="settings-content">
      <h3 className="settings-section-title">Важные настройки</h3>
      <p className="modal-note">
        Подключите S3-совместимое хранилище (Amazon S3, Cloudflare R2 и т.п.). Фото из чатов
        будут загружаться туда. Пока S3 не настроен — файлы хранятся локально.
      </p>

      <div className="s3-form">
        <S3Field
          label="Бакет"
          value={draft.bucket}
          onChange={(v) => set("bucket", v)}
          placeholder="my-bucket"
        />
        <S3Field
          label="Регион"
          value={draft.region}
          onChange={(v) => set("region", v)}
          placeholder="auto (R2) или us-east-1"
        />
        <S3Field
          label="Endpoint"
          value={draft.endpoint}
          onChange={(v) => set("endpoint", v)}
          placeholder="https://<accountid>.r2.cloudflarestorage.com"
        />
        <S3Field
          label="Access Key"
          value={draft.accessKeyId}
          onChange={(v) => set("accessKeyId", v)}
          placeholder="S3 access key"
        />
        <S3Field
          label="Secret Key"
          value={draft.secretAccessKey}
          onChange={(v) => set("secretAccessKey", v)}
          placeholder="S3 secret key"
          password
        />
        <S3Field
          label="Публичный URL"
          value={draft.publicUrl}
          onChange={(v) => set("publicUrl", v)}
          placeholder="https://pub-xxxx.r2.dev или ваш домен"
        />
      </div>

      {status && (
        <p className={`s3-status ${status.ok ? "ok" : "error"}`}>{status.text}</p>
      )}

      <div className="modal-actions">
        <button className="btn primary" disabled={busy} onClick={save}>
          {busy ? "Проверяем…" : configured ? "Сохранить" : "Сохранить и проверить"}
        </button>
        {configured && (
          <button className="btn danger" disabled={busy} onClick={disconnect}>
            Отключить
          </button>
        )}
      </div>
    </div>
  );
}

function S3Field({
  label,
  value,
  onChange,
  placeholder,
  password,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  password?: boolean;
}) {
  return (
    <label className="s3-field">
      <span className="s3-field-label">{label}</span>
      <input
        type={password ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
