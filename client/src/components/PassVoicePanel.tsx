import { useState } from "react";
import { api, type PassVoiceChannel } from "../api.js";
import { CreatePassVoiceModal } from "./CreatePassVoiceModal.js";
import { JoinPassVoiceModal } from "./JoinPassVoiceModal.js";
import { EditPassVoiceModal } from "./EditPassVoiceModal.js";
import { Avatar } from "./Avatar.js";
import { DeafenOffMiniIcon, MicOffMiniIcon } from "./stateIcons.js";

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function PassVoicePanel({
  channels,
  activeId,
  meId,
  onOpen,
  onChanged,
  onDeleted,
  onCaptureMic,
  speakingIds,
  voiceState,
}: {
  channels: PassVoiceChannel[];
  activeId?: string;
  meId: string;
  onOpen: (id: string) => void;
  onChanged: () => void;
  onDeleted: (id: string) => void;
  onCaptureMic: () => void;
  speakingIds?: string[];
  voiceState?: Record<string, { muted: boolean; deafened: boolean }>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joining, setJoining] = useState<PassVoiceChannel | null>(null);
  const [editChannel, setEditChannel] = useState<PassVoiceChannel | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [error, setError] = useState("");

  const openChannel = async (ch: PassVoiceChannel) => {
    if (ch.id !== activeId) onCaptureMic();
    if (ch.joined) {
      onOpen(ch.id);
      return;
    }
    if (!ch.can_join) return;
    const isOwner = ch.owner.id === meId;
    if (ch.has_password && !isOwner) {
      setJoining(ch);
      return;
    }
    try {
      await api.joinPassVoice(ch.id);
      onOpen(ch.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const del = async (id: string) => {
    setError("");
    try {
      await api.deletePassVoice(id);
      onDeleted(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setConfirmDel(null);
    }
  };

  return (
    <>
      <div className="passvoice">
        <div className="passvoice-head">
          <span className="passvoice-title">Пасс Войс</span>
          <button className="icon-btn passvoice-add" title="Создать канал" onClick={() => setCreateOpen(true)}>
            +
          </button>
        </div>

        <div className="passvoice-list">
          {channels.length === 0 && (
            <p className="passvoice-empty">Каналов пока нет. Нажмите +, чтобы создать.</p>
          )}
          {channels.map((ch) => {
            const isOwner = ch.owner.id === meId;
            const locked = !ch.joined && !ch.can_join;
            return (
              <div key={ch.id} className="passvoice-item">
                <div className="passvoice-main">
                  <button
                    className={`channel-row passvoice-row ${activeId === ch.id ? "active" : ""} ${locked ? "locked" : ""}`}
                    disabled={locked}
                    onClick={() => openChannel(ch)}
                  >
                    <span className="channel-name">
                      <span className="ch-icon">◉</span>
                      <span className="pv-name">{ch.name}</span>
                      <span className="pv-count">
                        {ch.participant_count}
                        {ch.max_participants != null ? `/${ch.max_participants}` : ""}
                      </span>
                      {ch.has_password && (
                        <span className="pv-lock">
                          <LockIcon />
                        </span>
                      )}
                    </span>
                  </button>
                      {ch.participants && ch.participants.length > 0 && (
                        <div className="channel-members">
                          {ch.participants.map((p) => (
                            <span
                              className={`channel-member ${speakingIds?.includes(p.id) ? "speaking" : ""}`}
                              key={p.id}
                              title={p.nickname ?? p.login}
                            >
                              <Avatar src={p.avatar} name={p.nickname ?? p.login} size={18} />
                              <span className="channel-member-name">{p.nickname ?? p.login}</span>
                              {voiceState?.[p.id]?.muted && (
                                <span className="channel-member-ico" title="Микрофон выключен">
                                  <MicOffMiniIcon />
                                </span>
                              )}
                              {voiceState?.[p.id]?.deafened && (
                                <span className="channel-member-ico" title="Оглушён">
                                  <DeafenOffMiniIcon />
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                </div>
                {isOwner && (
                  <>
                    <button
                      className="passvoice-edit"
                      title="Настроить канал"
                      onClick={() => setEditChannel(ch)}
                    >
                      <SettingsIcon />
                    </button>
                    <button
                      className={`passvoice-del ${confirmDel === ch.id ? "confirm" : ""}`}
                      title="Удалить канал"
                      onClick={() => (confirmDel === ch.id ? del(ch.id) : setConfirmDel(ch.id))}
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="error passvoice-error">{error}</p>}
      </div>

      {createOpen && (
        <CreatePassVoiceModal
          onClose={() => setCreateOpen(false)}
          onCreated={async (ch) => {
            setCreateOpen(false);
            setError("");
            try {
              await api.joinPassVoice(ch.id);
              onOpen(ch.id);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Ошибка");
            }
            onChanged();
          }}
        />
      )}
      {joining && (
        <JoinPassVoiceModal
          channel={joining}
          onClose={() => setJoining(null)}
          onJoined={() => {
            setJoining(null);
            onOpen(joining.id);
            onChanged();
          }}
        />
      )}
      {editChannel && (
        <EditPassVoiceModal
          channel={editChannel}
          onClose={() => setEditChannel(null)}
          onUpdated={() => {
            setEditChannel(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}
