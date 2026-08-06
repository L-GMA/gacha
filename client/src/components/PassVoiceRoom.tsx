import { useEffect, useState } from "react";
import { api, type PassVoiceChannel } from "../api.js";
import { VoiceRoom, type VoiceControls, type ParticipantVoiceState, type VoiceStatus } from "./VoiceRoom.js";
import { EditPassVoiceModal } from "./EditPassVoiceModal.js";

export function PassVoiceRoom({
  channelId,
  meId,
  meName,
  meAvatar,
  onLeave,
  onDeleted,
  onStatus,
  onSpeaking,
  onParticipants,
  onChanged,
  controlsRef,
  micTrackRef,
}: {
  channelId: string;
  meId: string;
  meName: string;
  meAvatar: string | null;
  onLeave: () => void;
  onDeleted: () => void;
  onStatus?: (status: VoiceStatus | null) => void;
  onSpeaking?: (ids: string[]) => void;
  onParticipants?: (states: Record<string, ParticipantVoiceState>) => void;
  onChanged?: () => void;
  controlsRef?: { current: VoiceControls | null };
  micTrackRef?: { current: { promise: Promise<MediaStreamTrack | null> } };
}) {
  const [room, setRoom] = useState<{ channel: PassVoiceChannel } | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await api.passVoiceRoom(channelId);
        if (!alive) return;
        setRoom(r);
        setGone(false);
      } catch (err) {
        if (!alive) return;
        const msg = err instanceof Error ? err.message : "Ошибка";
        if (msg === "Канал не найден") setGone(true);
        else setError(msg);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [channelId]);

  const leave = async () => {
    try {
      await api.leavePassVoice(channelId);
    } catch {
      /* канал мог быть удалён — выходим всё равно */
    }
    onLeave();
  };

  const del = async () => {
    setError("");
    try {
      await api.deletePassVoice(channelId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setConfirmDel(false);
    }
  };

  if (gone) {
    return (
      <div className="pv-room">
        <p className="center-hint">Канал удалён</p>
        <div className="pv-room-actions">
          <button className="btn" onClick={onLeave}>
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="pv-room">
        <p className="modal-note">Загрузка…</p>
      </div>
    );
  }

  const ch = room.channel;
  const isOwner = ch.owner.id === meId;

  return (
    <div className="pv-room pass-voice-room">
      <div className="pv-room-head">
        <h2 className="pv-room-name">
          <span className="ch-icon">◉</span> {ch.name}
        </h2>
        <div className="pv-room-meta">
          <span className="pv-room-sub">
            {ch.participant_count}
            {ch.max_participants != null ? ` / ${ch.max_participants}` : ""} участников
            {ch.has_password ? " · по паролю" : ""}
          </span>
          <span className="pv-room-owner">создал: {ch.owner.nickname ?? ch.owner.login}</span>
          {isOwner && (
            <>
              <button
                className="btn small"
                onClick={() => setEditOpen(true)}
              >
                Настроить
              </button>
              <button
                className={`btn small danger ${confirmDel ? "confirm" : ""}`}
                onClick={() => (confirmDel ? del() : setConfirmDel(true))}
              >
                {confirmDel ? "Точно удалить?" : "Удалить канал"}
              </button>
            </>
          )}
        </div>
      </div>

      <VoiceRoom
        channelId={channelId}
        channelName={ch.name}
        meName={meName}
        meAvatar={meAvatar}
        onLeave={leave}
        onStatus={onStatus}
        onSpeaking={onSpeaking}
        onParticipants={onParticipants}
        controlsRef={controlsRef}
        micTrackRef={micTrackRef}
        hideHead
      />

      {error && <p className="error">{error}</p>}

      {editOpen && (
        <EditPassVoiceModal
          channel={ch}
          onClose={() => setEditOpen(false)}
          onUpdated={(updated) => {
            setEditOpen(false);
            setRoom({ channel: updated });
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
