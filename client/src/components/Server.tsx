import { useEffect, useRef, useState } from "react";
import { api, subscribePassVoiceEvents, subscribeServerEvents, subscribeVoiceEvents, type ServerData, type Member, type Conversation, type Channel, type PassVoiceChannel, type VoicePresenceUser } from "../api.js";
import { ChannelsPanel } from "./ChannelsPanel.js";
import { MembersPanel } from "./MembersPanel.js";
import { DmRail } from "./DmRail.js";
import { DmList } from "./DmList.js";
import { Chat } from "./Chat.js";
import { ChannelChat } from "./ChannelChat.js";
import { PassVoiceRoom } from "./PassVoiceRoom.js";
import { VoiceRoom, type VoiceControls, type VoiceStatus, type ParticipantVoiceState } from "./VoiceRoom.js";
import { NewDmModal } from "./NewDmModal.js";
import { InviteModal } from "./InviteModal.js";
import { SettingsModal } from "./SettingsModal.js";
import { ProfileModal } from "./ProfileModal.js";
import { UserSettings } from "./UserSettings.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";
import { getSettings } from "../settings.js";
import { openMicGraph, setVoiceMicGraph, getVoiceMicGraph } from "../micPipeline.js";

export function Server({
  invitedBy,
  onLogout,
}: {
  invitedBy: string | null;
  onLogout: () => void;
}) {
  const [data, setData] = useState<ServerData | null>(null);
  const [passVoice, setPassVoice] = useState<PassVoiceChannel[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [dmOpen, setDmOpen] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [activePassVoiceId, setActivePassVoiceId] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [participantVoice, setParticipantVoice] = useState<
    Record<string, ParticipantVoiceState>
  >({});
  const voiceControlsRef = useRef<VoiceControls | null>(null);
  const micTrackRef = useRef<{ promise: Promise<MediaStreamTrack | null> }>({
    promise: Promise.resolve(null),
  });
  const micCaptureTokenRef = useRef(0);
  const [presence, setPresence] = useState<Record<string, VoicePresenceUser[]>>({});
  const prevConnectedRef = useRef(false);
  const [mode, setMode] = useState<"home" | "friends">("home");
  const [error, setError] = useState("");
  const [membersOpen, setMembersOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gacha.membersPanel.open") !== "0";
    } catch {
      return true;
    }
  });

  const toggleMembers = () => {
    setMembersOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem("gacha.membersPanel.open", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const loadPresence = async () => {
    try {
      const res = await api.voicePresence();
      const map: Record<string, VoicePresenceUser[]> = {};
      for (const ch of res.channels) map[ch.id] = ch.participants;
      setPresence(map);
    } catch {
      /* присутствие — не критично */
    }
  };

  const load = async () => {
    try {
      const [d, pv] = await Promise.all([api.server(), api.passVoice()]);
      setData(d);
      setPassVoice(pv.channels);
      void loadPresence();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const loadPassVoice = async () => {
    try {
      const pv = await api.passVoice();
      setPassVoice(pv.channels);
    } catch {
      /* не критично */
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const p = setInterval(() => void loadPresence(), 5000);
    const unsub = subscribePassVoiceEvents(() => void loadPassVoice());
    const unsubServer = subscribeServerEvents(() => void load());
    const unsubVoice = subscribeVoiceEvents(() => void loadPresence());
    return () => {
      clearInterval(t);
      clearInterval(p);
      unsub();
      unsubServer();
      unsubVoice();
    };
  }, []);

  useEffect(() => {
    const connected = !!voiceStatus?.connected;
    if (connected !== prevConnectedRef.current) {
      prevConnectedRef.current = connected;
      void loadPresence();
    }
  }, [voiceStatus?.connected]);

  useEffect(() => {
    return () => {
      const prev = getVoiceMicGraph();
      prev?.close();
      setVoiceMicGraph(null);
      void micTrackRef.current.promise.then((t) => t?.stop());
    };
  }, []);

  if (!data) {
    return <div className="screen">Загрузка...</div>;
  }

  const roles = data.me.roles;
  const isAdmin = roles.some((r) => r.kind === "admin");
  const canInvite = isAdmin || roles.some((r) => r.permissions.invite);
  const canManage =
    isAdmin ||
    roles.some((r) => r.permissions.manage_channels || r.permissions.manage_roles);

  const meName = data.me.nickname ?? data.me.login;
  const meColor = highestRoleColor(data.me.roles);
  const profileMember: Member | null =
    profileId ? data.members.find((m) => m.id === profileId) ?? null : null;
  const activeConv: Conversation | null =
    activeConvId ? data.conversations.find((c) => c.id === activeConvId) ?? null : null;
  const activeChannel: Channel | null =
    activeChannelId
      ? data.categories.flatMap((cat) => cat.channels).find((ch) => ch.id === activeChannelId) ?? null
      : null;
  const voiceChannelName = voiceChannelId
    ? (data.categories.flatMap((cat) => cat.channels).find((ch) => ch.id === voiceChannelId)?.name ??
      "Голосовой канал")
    : "";
  const speakingUserIds = speakingIds.map((id) => id.split("--")[0]);
  const regularVoiceVisible = mode === "home" && activeChannelId === voiceChannelId;
  const passVoiceVisible =
    mode === "home" && activePassVoiceId != null && activeChannelId == null;

  const preCaptureMic = () => {
    const token = ++micCaptureTokenRef.current;
    const prev = getVoiceMicGraph();
    prev?.close();
    setVoiceMicGraph(null);
    const deviceId = getSettings().micDeviceId;
    micTrackRef.current = {
      promise: openMicGraph(deviceId)
        .then((g) => {
          if (micCaptureTokenRef.current !== token) {
            g.close();
            return null;
          }
          const old = getVoiceMicGraph();
          old?.close();
          setVoiceMicGraph(g);
          return g.track;
        })
        .catch(() => null),
    };
  };

  const clearMicTrack = () => {
    micCaptureTokenRef.current++;
    const prev = getVoiceMicGraph();
    prev?.close();
    setVoiceMicGraph(null);
    micTrackRef.current = { promise: Promise.resolve(null) };
  };

  const handleSelectChannel = (channelId: string) => {
    const ch = data.categories
      .flatMap((cat) => cat.channels)
      .find((c) => c.id === channelId);
    setMode("home");
    setActiveConvId(null);
    setProfileId(null);
    if (ch?.type === "voice") {
      if (activePassVoiceId) {
        void leavePassIfActive(activePassVoiceId);
        setActivePassVoiceId(null);
      }
      if (voiceChannelId !== channelId) preCaptureMic();
      setVoiceChannelId(channelId);
      setActiveChannelId(channelId);
    } else {
      if (!voiceChannelId && !activePassVoiceId) clearMicTrack();
      setActiveChannelId(channelId);
    }
  };

  const leavePassIfActive = async (id: string | null | undefined) => {
    if (!id) return;
    try {
      await api.leavePassVoice(id);
    } catch {
      /* канал мог быть удалён — выходим всё равно */
    }
    load();
  };

  const handleOpenPassVoice = (id: string) => {
    if (activePassVoiceId && activePassVoiceId !== id) {
      void leavePassIfActive(activePassVoiceId);
    }
    if (voiceChannelId) {
      setVoiceChannelId(null);
    }
    setMode("home");
    setActiveConvId(null);
    setProfileId(null);
    setActivePassVoiceId(id);
    setActiveChannelId(null);
  };

  const handlePassVoiceDeleted = (id: string) => {
    if (activePassVoiceId === id) setActivePassVoiceId(null);
    load();
  };

  const handleSelectConversation = (c: Conversation) => {
    setMode("friends");
    setActiveConvId(c.id);
    setProfileId(null);
  };

  const handleDeleteConversation = (id: string) => {
    if (activeConvId === id) setActiveConvId(null);
    load();
  };

  const handleSelectMode = (m: "home" | "friends") => {
    setMode(m);
    if (m === "home") setActiveConvId(null);
  };

  const openProfile = () => {
    setProfileId(data.me.id);
  };

  return (
    <div className="server">
      <header className="topbar server-bar">
        <div className="topbar-left">
          <span className="logo small">GACHA</span>
          {canManage && (
            <button className="btn small ghost settings-btn" onClick={() => setSettingsOpen(true)}>
              ⚙ Настройки
            </button>
          )}
        </div>
        <div className="topbar-right">
          {invitedBy && <span className="invited-by">пригласил(а) @{invitedBy}</span>}
          {canInvite && (
            <button className="btn small" onClick={() => setInviteOpen(true)}>
              Пригласить
            </button>
          )}
          <button className="btn small" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      <div className="main">
        <DmRail mode={mode} onSelectMode={handleSelectMode} />
        {mode === "home" ? (
          <div className="channels-sidebar">
            <ChannelsPanel
              categories={data.categories}
              activeId={activeChannelId ?? undefined}
              onSelect={handleSelectChannel}
              passVoice={passVoice}
              activePassVoiceId={activePassVoiceId ?? undefined}
              meId={data.me.id}
              onOpenPassVoice={handleOpenPassVoice}
              onPassVoiceChanged={() => load()}
              onPassVoiceDeleted={handlePassVoiceDeleted}
              onCaptureMic={preCaptureMic}
              presence={presence}
              speakingIds={speakingUserIds}
              voiceState={participantVoice}
            />
          </div>
        ) : (
          <DmList
            conversations={data.conversations}
            activeId={activeConvId ?? undefined}
            members={data.members}
            meId={data.me.id}
            onSelect={handleSelectConversation}
            onStartNew={() => setDmOpen(true)}
          />
        )}

        <div className="center-wrap">
          <div className="center">
            {mode === "home" ? (
              activeChannel && activeChannel.type === "text" ? (
                <ChannelChat
                  key={activeChannel.id}
                  channel={activeChannel}
                  members={data.members}
                  meId={data.me.id}
                />
              ) : !voiceChannelId ? (
                <p className="center-hint">Выберите канал слева</p>
              ) : null
            ) : activeConv ? (
              <Chat
                key={activeConv.id}
                conversation={activeConv}
                members={data.members}
                meId={data.me.id}
                onChanged={() => load()}
                onDeleted={handleDeleteConversation}
              />
            ) : (
              <p className="center-hint">Выберите диалог слева</p>
            )}
          </div>

          {voiceChannelId && (
            <div className={`voice-overlay ${regularVoiceVisible ? "" : "hidden"}`}>
              <VoiceRoom
                key={voiceChannelId}
                channelId={voiceChannelId}
                channelName={voiceChannelName}
                meName={meName}
                meAvatar={data.me.avatar}
                meJoinSound={data.me.join_sound_url}
                meLeaveSound={data.me.leave_sound_url}
                onLeave={() => {
                  setVoiceChannelId(null);
                  setActiveChannelId((cur) => (cur === voiceChannelId ? null : cur));
                  clearMicTrack();
                }}
                onStatus={setVoiceStatus}
                onSpeaking={setSpeakingIds}
                onParticipants={setParticipantVoice}
                controlsRef={voiceControlsRef}
                micTrackRef={micTrackRef}
              />
            </div>
          )}
          {activePassVoiceId && (
            <div className={`voice-overlay ${passVoiceVisible ? "" : "hidden"}`}>
              <PassVoiceRoom
                key={activePassVoiceId}
                channelId={activePassVoiceId}
                meId={data.me.id}
                meName={meName}
                meAvatar={data.me.avatar}
                onLeave={() => {
                  setActivePassVoiceId(null);
                  clearMicTrack();
                  load();
                }}
                onDeleted={() => {
                  setActivePassVoiceId(null);
                  clearMicTrack();
                  load();
                }}
                onStatus={setVoiceStatus}
                onSpeaking={setSpeakingIds}
                onParticipants={setParticipantVoice}
                onChanged={() => load()}
                controlsRef={voiceControlsRef}
                micTrackRef={micTrackRef}
              />
            </div>
          )}
        </div>

        {mode === "home" && (
          <div className={`members-wrap ${membersOpen ? "" : "collapsed"}`}>
            <button
              className="members-toggle"
              title={membersOpen ? "Скрыть список участников" : "Показать список участников"}
              onClick={toggleMembers}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
            <MembersPanel members={data.members} onSelect={(m) => setProfileId(m.id)} />
          </div>
        )}
      </div>

      <div className="user-panel" title="Мой профиль" onClick={openProfile}>
        {voiceStatus?.connected && (
          <div className="user-panel-voice" onClick={(e) => e.stopPropagation()}>
            <span className="voice-conn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2" />
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
                <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
              </svg>
              <span className="voice-conn-tip">
                {voiceStatus.ping != null ? `${Math.round(voiceStatus.ping)} мс` : "… мс"}
              </span>
            </span>
            <span className="voice-conn-info">
              <span className="voice-state">Подключено</span>
              <span className="voice-channel" title={voiceStatus.channelName}>
                {voiceStatus.channelName}
              </span>
            </span>
            <button
              className="voice-leave"
              title="Покинуть голосовой канал"
              onClick={() => voiceControlsRef.current?.leave()}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="user-panel-row">
        <Avatar src={data.me.avatar} name={meName} size={40} online={data.me.online} />
        <span className="user-panel-info">
          <span className="user-panel-name" style={meColor ? { color: meColor } : undefined}>
            {meName}
          </span>
          <span className={`user-panel-status ${data.me.online ? "online" : ""}`}>
            {data.me.online ? "В сети" : "Не в сети"}
          </span>
        </span>
        <span className="user-panel-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className={`user-panel-btn ${voiceStatus?.muted || voiceStatus?.deafened ? "active" : ""}`}
            title={voiceStatus?.muted ? "Включить микрофон" : "Выключить микрофон"}
            onClick={() => voiceControlsRef.current?.toggleMic()}
          >
            {voiceStatus?.muted ? (
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v1a7 7 0 0 1-11.73 5.27" />
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M8.35 8.35A7 7 0 0 0 12 18" />
                <path d="M12 18v3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                <path d="M12 18v3" />
              </svg>
            )}
          </button>
          <button
            className={`user-panel-btn ${voiceStatus?.deafened ? "active" : ""}`}
            title={voiceStatus?.deafened ? "Снять оглушение (наушники)" : "Оглушить (выключить микрофон и звук)"}
            onClick={() => voiceControlsRef.current?.toggleDeafen()}
          >
            {voiceStatus?.deafened ? (
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                <path d="M3 14a2 2 0 0 1 2-2h1v6H5a2 2 0 0 1-2-2v-2Z" />
                <path d="M21 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                <path d="M3 14a2 2 0 0 1 2-2h1v6H5a2 2 0 0 1-2-2v-2Z" />
                <path d="M21 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
              </svg>
            )}
          </button>
          <button
            className="user-panel-btn"
            title="Настройки"
            onClick={() => setUserSettingsOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </span>
        </div>
      </div>

      {error && <p className="error server-error">{error}</p>}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
      {dmOpen && (
        <NewDmModal
          onClose={() => setDmOpen(false)}
          onStart={async (c) => {
            setActiveConvId(c.id);
            setMode("friends");
            setDmOpen(false);
            await load();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onChanged={() => load()}
        />
      )}
      {userSettingsOpen && (
        <UserSettings
          me={data.me}
          onClose={() => setUserSettingsOpen(false)}
          onChanged={() => load()}
        />
      )}
      {profileMember && (
        <ProfileModal
          member={profileMember}
          onClose={() => setProfileId(null)}
        />
      )}
    </div>
  );
}
