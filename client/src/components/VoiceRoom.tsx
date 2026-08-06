import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  LocalVideoTrack,
  LocalAudioTrack,
  type RemoteParticipant,
} from "livekit-client";
import { api } from "../api.js";
import { Avatar } from "./Avatar.js";
import { playJoinSound, playLeaveSound } from "../sounds.js";
import { DeafenOffMiniIcon, MicOffMiniIcon } from "./stateIcons.js";
import { getSettings, subscribeSettings } from "../settings.js";
import { applyKrisp } from "../krisp.js";
import { getVoiceMicGraph, switchMicGraphDevice } from "../micPipeline.js";

type RemoteAudioTrackLike = {
  setVolume(volume: number): void;
  attachedElements: HTMLMediaElement[];
};

type PlaybackCtx = {
  src: MediaStreamAudioSourceNode;
  mono: GainNode;
  track: Track;
};

const SPEAKING_THRESHOLD = 0.02;
const SPEAKING_HANG_MS = 350;

const isDesktopApp =
  typeof window !== "undefined" &&
  typeof window.gachaScreen?.pick === "function";

const screenBitrate = (fps: 30 | 60 | 90, quality: "720" | "1080"): number => {
  const base = quality === "1080" ? 8_000_000 : 5_000_000;
  return Math.round(base * (fps / 30));
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v3" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
      <path d="M19 10v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function DeafenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M3 14a2 2 0 0 1 2-2h1v6H5a2 2 0 0 1-2-2v-2Z" />
      <path d="M21 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
    </svg>
  );
}

function DeafenOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M3 14a2 2 0 0 1 2-2h1v6H5a2 2 0 0 1-2-2v-2Z" />
      <path d="M21 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M9 21h6" />
      <path d="M12 18v-7" />
      <path d="m9 14 3-3 3 3" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <g transform="rotate(180 12 12)">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
      </g>
    </svg>
  );
}

function ScreenShareView({ track, muted }: { track: Track; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    void el.play().catch(() => {});
    return () => {
      track.detach(el);
    };
  }, [track]);
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  return <video ref={ref} autoPlay playsInline />;
}

export type VoiceStatus = {
  connected: boolean;
  channelName: string;
  ping: number | null;
  muted: boolean;
  deafened: boolean;
};

export type VoiceControls = {
  toggleMic: () => void;
  toggleDeafen: () => void;
  leave: () => void;
};

export type ParticipantVoiceState = {
  muted: boolean;
  deafened: boolean;
};

export function VoiceRoom({
  channelId,
  channelName,
  meName,
  meAvatar,
  onLeave,
  onStatus,
  onSpeaking,
  onParticipants,
  controlsRef,
  micTrackRef,
  hideHead,
}: {
  channelId: string;
  channelName: string;
  meName: string;
  meAvatar: string | null;
  onLeave: () => void;
  onStatus?: (status: VoiceStatus | null) => void;
  onSpeaking?: (ids: string[]) => void;
  onParticipants?: (states: Record<string, ParticipantVoiceState>) => void;
  controlsRef?: { current: VoiceControls | null };
  micTrackRef?: { current: { promise: Promise<MediaStreamTrack | null> } };
  hideHead?: boolean;
}) {
  const readScreenPref = (key: string, fallback: string): string => {
    try {
      return localStorage.getItem(`gacha.voice.screen.${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const writeScreenPref = (key: string, v: string) => {
    try {
      localStorage.setItem(`gacha.voice.screen.${key}`, v);
    } catch {
      /* ignore */
    }
  };

  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [meIdentity, setMeIdentity] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [micUnavailable, setMicUnavailable] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState("");
  const [ping, setPing] = useState<number | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [screenVolumes, setScreenVolumes] = useState<Record<string, number>>({});
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenRes, setScreenRes] = useState<"720" | "1080">(() =>
    readScreenPref("res", "1080") === "720" ? "720" : "1080",
  );
  const [screenFps, setScreenFps] = useState<30 | 60 | 90>(() => {
    const v = readScreenPref("fps", "30");
    return v === "90" ? 90 : v === "60" ? 60 : 30;
  });
  const [screens, setScreens] = useState<
    { identity: string; track: Track; isMe: boolean }[]
  >([]);
  const roomRef = useRef<Room | null>(null);
  const meIdentityRef = useRef<string | null>(null);
  const deafenedRef = useRef(false);
  const micUnavailableRef = useRef(false);
  const micPendingRef = useRef(false);
  const preTrackRef = useRef<MediaStreamTrack | null>(null);
  const joinedRef = useRef(false);
  const audioElsRef = useRef<Set<HTMLAudioElement>>(new Set());
  const analysersRef = useRef<
    Map<string, { ctx: AudioContext; analyser: AnalyserNode; track: Track }>
  >(new Map());
  const mixCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<Map<string, PlaybackCtx>>(new Map());
  const screenPbRef = useRef<Map<string, PlaybackCtx>>(new Map());
  const tracksRef = useRef<Map<string, Track>>(new Map());
  const storedVolumesRef = useRef<Map<string, number>>(new Map());
  const storedScreenVolRef = useRef<Map<string, number>>(new Map());
  const lastAboveRef = useRef<Map<string, number>>(new Map());
  const prevSpeakingRef = useRef<string[]>([]);
  const screensRef = useRef<Map<string, Track>>(new Map());
  const screenBusyRef = useRef(false);
  const screenCaptureRef = useRef<{
    stop: () => void;
  } | null>(null);

  const volumeStorageKey = (name: string) => `gacha.voice.volumes.${name}`;

  const readStoredVolume = (name: string): number => {
    try {
      const raw = localStorage.getItem(volumeStorageKey(name));
      if (raw == null) return 1;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 1;
    } catch {
      return 1;
    }
  };

  const writeStoredVolume = (name: string, v: number) => {
    try {
      localStorage.setItem(volumeStorageKey(name), String(v));
    } catch {
      /* ignore */
    }
  };

  const screenVolStorageKey = (name: string) =>
    `gacha.voice.screenvolumes.${name}`;

  const readStoredScreenVol = (name: string): number => {
    try {
      const raw = localStorage.getItem(screenVolStorageKey(name));
      if (raw == null) return 1;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 1;
    } catch {
      return 1;
    }
  };

  const writeStoredScreenVol = (name: string, v: number) => {
    try {
      localStorage.setItem(screenVolStorageKey(name), String(v));
    } catch {
      /* ignore */
    }
  };

  const applyScreenVolumeToTrack = (track: Track, v: number) => {
    try {
      const like = track as unknown as RemoteAudioTrackLike;
      if (typeof like.setVolume === "function") {
        like.setVolume(v);
      } else {
        for (const el of track.attachedElements) el.volume = v;
      }
    } catch {
      /* ignore */
    }
    for (const [, pb] of screenPbRef.current) {
      if (pb.track === track) {
        try {
          pb.mono.gain.setTargetAtTime(v, 0, 0.02);
        } catch {
          /* ignore */
        }
        break;
      }
    }
  };

  const applyVolumeToTrack = (track: Track, v: number) => {
    try {
      const like = track as unknown as RemoteAudioTrackLike;
      if (typeof like.setVolume === "function") {
        like.setVolume(v);
      } else {
        for (const el of track.attachedElements) el.volume = v;
      }
    } catch {
      /* ignore */
    }
    for (const [, pb] of playbackCtxRef.current) {
      if (pb.track === track) {
        try {
          pb.mono.gain.setTargetAtTime(v, 0, 0.02);
        } catch {
          /* ignore */
        }
        break;
      }
    }
  };

  useEffect(() => {
    onStatus?.({ connected, channelName, ping, muted, deafened });
  }, [connected, channelName, ping, muted, deafened]);

  useEffect(() => {
    let alive = true;
    let room: Room | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let levelTimer: ReturnType<typeof setInterval> | null = null;
    let unsubKrisp: (() => void) | undefined;
    let unsubMic: (() => void) | undefined;
    let lastMicDevice = getSettings().micDeviceId;

    const resumeMix = () => {
      const ctx = mixCtxRef.current;
      if (ctx && ctx.state === "suspended") void ctx.resume();
    };
    window.addEventListener("pointerdown", resumeMix);
    window.addEventListener("keydown", resumeMix);

    const refresh = () => {
      if (!alive || !room) return;
      setParticipants(Array.from(room.remoteParticipants.values()));
    };

    const syncScreens = () => {
      if (!alive) return;
      const me = meIdentityRef.current;
      const list: { identity: string; track: Track; isMe: boolean }[] = [];
      screensRef.current.forEach((track, identity) => {
        list.push({ identity, track, isMe: identity === me });
      });
      setScreens(list);
    };

    const attachAudio = (track: Track, participant: RemoteParticipant) => {
      const el = track.attach();
      el.muted = true;
      audioElsRef.current.add(el);
      const name = participant.name ?? participant.identity;
      const stored = storedVolumesRef.current.get(name) ?? readStoredVolume(name);
      storedVolumesRef.current.set(name, stored);
      tracksRef.current.set(participant.identity, track);
      setVolumes((prev) => ({ ...prev, [participant.identity]: stored }));
      try {
        const stream = track.mediaStreamTrack
          ? new MediaStream([track.mediaStreamTrack])
          : track.mediaStream;
        if (stream) {
          let ctx = mixCtxRef.current;
          if (!ctx || ctx.state === "closed") {
            ctx = new AudioContext();
            mixCtxRef.current = ctx;
          }
          if (ctx.state === "suspended") void ctx.resume();
          const src = ctx.createMediaStreamSource(stream);
          const mono = ctx.createGain();
          mono.channelCount = 1;
          mono.channelCountMode = "explicit";
          mono.channelInterpretation = "speakers";
          mono.gain.value = deafenedRef.current ? 0 : stored;
          src.connect(mono);
          mono.connect(ctx.destination);
          playbackCtxRef.current.set(participant.identity, { src, mono, track });
        }
      } catch {
        /* ignore */
      }
      applyVolumeToTrack(track, deafenedRef.current ? 0 : stored);
    };

    const detachAudio = (track: Track, participant?: RemoteParticipant) => {
      for (const el of track.detach()) audioElsRef.current.delete(el);
      if (participant) {
        tracksRef.current.delete(participant.identity);
        const pb = playbackCtxRef.current.get(participant.identity);
        if (pb) {
          try {
            pb.src.disconnect();
            pb.mono.disconnect();
          } catch {
            /* ignore */
          }
          playbackCtxRef.current.delete(participant.identity);
        }
      }
    };

    const attachScreenAudio = (track: Track, participant: RemoteParticipant) => {
      const el = track.attach();
      el.muted = true;
      audioElsRef.current.add(el);
      const name = participant.name ?? participant.identity;
      const stored =
        storedScreenVolRef.current.get(name) ?? readStoredScreenVol(name);
      storedScreenVolRef.current.set(name, stored);
      setScreenVolumes((prev) => ({ ...prev, [participant.identity]: stored }));
      try {
        const stream = track.mediaStreamTrack
          ? new MediaStream([track.mediaStreamTrack])
          : track.mediaStream;
        if (stream) {
          let ctx = mixCtxRef.current;
          if (!ctx || ctx.state === "closed") {
            ctx = new AudioContext();
            mixCtxRef.current = ctx;
          }
          if (ctx.state === "suspended") void ctx.resume();
          const src = ctx.createMediaStreamSource(stream);
          const mono = ctx.createGain();
          mono.channelCount = 1;
          mono.channelCountMode = "explicit";
          mono.channelInterpretation = "speakers";
          mono.gain.value = deafenedRef.current ? 0 : stored;
          src.connect(mono);
          mono.connect(ctx.destination);
          screenPbRef.current.set(participant.identity, { src, mono, track });
        }
      } catch {
        /* ignore */
      }
    };

    const detachScreenAudio = (track: Track, participant?: RemoteParticipant) => {
      for (const el of track.detach()) audioElsRef.current.delete(el);
      if (participant) {
        const pb = screenPbRef.current.get(participant.identity);
        if (pb) {
          try {
            pb.src.disconnect();
            pb.mono.disconnect();
          } catch {
            /* ignore */
          }
          screenPbRef.current.delete(participant.identity);
        }
      }
    };

    const syncMic = () => {
      if (alive && room && !deafenedRef.current) {
        setMuted(!room.localParticipant.isMicrophoneEnabled);
      }
    };

    const samplePing = async () => {
      if (!room) return;
      try {
        const pc = room.engine.pcManager?.publisher;
        if (!pc) return;
        const stats = await pc.getStats();
        let rtt: number | null = null;
        stats.forEach((r) => {
          if (r.type === "candidate-pair") {
            const cp = r as RTCIceCandidatePairStats & {
              selected?: boolean;
              nomination?: string;
            };
            const active = cp.selected === true || cp.nomination === "selected";
            if (active && typeof cp.currentRoundTripTime === "number") {
              rtt = cp.currentRoundTripTime * 1000;
            }
          }
        });
        setPing(rtt);
      } catch {
        /* ignore */
      }
    };

    const removeAnalyser = (identity: string) => {
      const a = analysersRef.current.get(identity);
      if (a) {
        void a.ctx.close();
        analysersRef.current.delete(identity);
      }
    };

    const rmsOf = (analyser: AnalyserNode) => {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / data.length);
    };

    const syncLevels = () => {
      if (!room) return;
      const target = new Map<string, Track>();
      for (const [identity, rp] of room.remoteParticipants) {
        for (const pub of rp.audioTrackPublications.values()) {
          if (pub.source !== Track.Source.Microphone) continue;
          if (pub.isSubscribed && pub.track) {
            target.set(identity, pub.track);
            break;
          }
        }
      }
      const me = meIdentityRef.current;
      if (me) {
        const meTracks = Array.from(
          room.localParticipant.audioTrackPublications.values(),
        );
        const activeMe =
          meTracks.find(
            (p) =>
              p.source === Track.Source.Microphone &&
              p.track?.kind === "audio" &&
              !p.track.mediaStreamTrack?.muted,
          ) ??
          meTracks.find(
            (p) =>
              p.source === Track.Source.Microphone && p.track?.kind === "audio",
          );
        if (activeMe?.track) target.set(me, activeMe.track);
      }
      for (const [identity, track] of target) {
        const cur = analysersRef.current.get(identity);
        if (cur?.track === track) continue;
        removeAnalyser(identity);
        if (track.mediaStreamTrack) {
          try {
            const ctx = new AudioContext();
            void ctx.resume();
            const src = ctx.createMediaStreamSource(
              new MediaStream([track.mediaStreamTrack]),
            );
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            src.connect(analyser);
            analysersRef.current.set(identity, { ctx, analyser, track });
          } catch {
            /* ignore */
          }
        }
      }
      for (const [identity] of analysersRef.current) {
        if (!target.has(identity)) removeAnalyser(identity);
      }
      const now = performance.now();
      const speaking: string[] = [];
      analysersRef.current.forEach((a, identity) => {
        try {
          if (rmsOf(a.analyser) > SPEAKING_THRESHOLD) {
            lastAboveRef.current.set(identity, now);
          }
          const last = lastAboveRef.current.get(identity);
          if (last != null && now - last < SPEAKING_HANG_MS) {
            speaking.push(identity);
          }
        } catch {
          /* ignore */
        }
      });
      const prev = prevSpeakingRef.current;
      if (
        speaking.length !== prev.length ||
        speaking.some((id, i) => id !== prev[i])
      ) {
        prevSpeakingRef.current = speaking;
        setSpeakingIds(speaking);
      }
    };

    (async () => {
      try {
        const { token, url } = await api.voiceJoin(channelId);
        if (!alive) return;
        room = new Room();
        roomRef.current = room;
        room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
          const mine = room?.localParticipant.joinedAt?.getTime() ?? 0;
          const theirs = p.joinedAt?.getTime() ?? mine + 1;
          if (theirs >= mine) playJoinSound();
          refresh();
        });
        room.on(RoomEvent.ParticipantDisconnected, (p) => {
          removeAnalyser(p.identity);
          tracksRef.current.delete(p.identity);
          const pb = playbackCtxRef.current.get(p.identity);
          if (pb) {
            try {
              pb.src.disconnect();
              pb.mono.disconnect();
            } catch {
              /* ignore */
            }
            playbackCtxRef.current.delete(p.identity);
          }
          const t = screensRef.current.get(p.identity);
          if (t) {
            for (const el of t.detach()) el.remove();
            screensRef.current.delete(p.identity);
            syncScreens();
          }
          const spb = screenPbRef.current.get(p.identity);
          if (spb) {
            detachScreenAudio(spb.track, p);
          }
          playLeaveSound();
          refresh();
        });
        room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
          if (track.kind === "audio") {
            if (pub.source === Track.Source.ScreenShareAudio) {
              attachScreenAudio(track, participant);
            } else {
              attachAudio(track, participant);
            }
          } else if (pub.source === Track.Source.ScreenShare) {
            screensRef.current.set(participant.identity, track);
            syncScreens();
          }
          refresh();
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
          if (track.kind === "audio") {
            if (pub.source === Track.Source.ScreenShareAudio) {
              detachScreenAudio(track, participant);
            } else {
              detachAudio(track, participant);
            }
          } else if (pub.source === Track.Source.ScreenShare) {
            const cur = screensRef.current.get(participant.identity);
            if (cur === track) {
              for (const el of track.detach()) el.remove();
              screensRef.current.delete(participant.identity);
              syncScreens();
            }
          }
          refresh();
        });
        room.on(RoomEvent.LocalTrackPublished, (pub) => {
          if (pub.source === Track.Source.Microphone && pub.track) {
            const s = getSettings();
            void applyKrisp(pub.track as LocalAudioTrack, s.krisp, s.krispQuality);
          }
          if (pub.source === Track.Source.ScreenShare && pub.track) {
            const me = meIdentityRef.current;
            if (me) {
              screensRef.current.set(me, pub.track);
              setSharingScreen(true);
              syncScreens();
            }
          }
        });
        room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
          if (pub.source === Track.Source.ScreenShare) {
            const me = meIdentityRef.current;
            const cur = me ? screensRef.current.get(me) : undefined;
            if (cur) {
              for (const el of cur.detach()) el.remove();
              if (me) screensRef.current.delete(me);
            }
            setSharingScreen(false);
            syncScreens();
          }
        });
        room.on(RoomEvent.TrackMuted, () => {
          syncMic();
          refresh();
        });
        room.on(RoomEvent.TrackUnmuted, () => {
          syncMic();
          refresh();
        });
        room.on(RoomEvent.ParticipantAttributesChanged, () => {
          refresh();
        });
        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (!alive) return;
          setConnected(state === ConnectionState.Connected);
          if (state === ConnectionState.Disconnected) setError("Соединение прервано");
        });
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (alive) setAudioBlocked(!room?.canPlaybackAudio);
        });

        console.log("[voice] connecting to", url);
        await room.connect(url, token, { autoSubscribe: true });
        if (!alive) return;
        const lk = room;
        setConnected(true);
        setMeIdentity(lk.localParticipant.identity);
        meIdentityRef.current = lk.localParticipant.identity;
        console.log("[voice] connected, room:", lk.name, "canPlayAudio:", lk.canPlaybackAudio);
        (window as unknown as Record<string, unknown>).__gachaVoice = lk;
        playJoinSound();
        joinedRef.current = true;
        setAudioBlocked(!lk.canPlaybackAudio);

        const enableMic = async (): Promise<boolean> => {
          try {
            await lk.localParticipant.setMicrophoneEnabled(true, {
              deviceId: getSettings().micDeviceId || { ideal: "default" },
            });
            micPendingRef.current = false;
            return true;
          } catch (err) {
            console.warn("[voice] mic не включился автоматически:", err);
            return false;
          }
        };

        const preTrack = (await micTrackRef?.current?.promise) ?? null;
        if (preTrack) preTrackRef.current = preTrack;
        if (!alive) {
          preTrack?.stop();
          return;
        }
        if (preTrack) {
          try {
            await lk.localParticipant.publishTrack(preTrack, {
              source: Track.Source.Microphone,
              name: "microphone",
            });
            micPendingRef.current = false;
            console.log(
              "[voice] микрофон опубликован из пред-захвата:",
              lk.localParticipant.isMicrophoneEnabled,
            );
          } catch (err) {
            console.warn("[voice] публикация микрофона не удалась:", err);
            preTrack.stop();
            preTrackRef.current = null;
            micPendingRef.current = true;
          }
        } else if (micTrackRef?.current) {
          micUnavailableRef.current = true;
          setMicUnavailable(true);
          micPendingRef.current = false;
        } else if (!(await enableMic())) {
          micPendingRef.current = true;
        }
        if (alive) syncMic();

        unsubKrisp = subscribeSettings(() => {
          if (!alive) return;
          const pub = lk.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (pub?.track) {
            const s = getSettings();
            void applyKrisp(pub.track as LocalAudioTrack, s.krisp, s.krispQuality);
          }
        });

        const switchMic = async (deviceId: string): Promise<void> => {
          const graph = getVoiceMicGraph();
          const pub = lk.localParticipant.getTrackPublication(Track.Source.Microphone);
          const track = pub?.track as LocalAudioTrack | undefined;
          if (graph && track && track.mediaStreamTrack === graph.track) {
            await switchMicGraphDevice(graph, deviceId);
            return;
          }
          if (track) {
            await track.restartTrack({
              deviceId: deviceId || { ideal: "default" },
            });
          }
        };

        unsubMic = subscribeSettings(() => {
          if (!alive) return;
          const deviceId = getSettings().micDeviceId;
          if (deviceId === lastMicDevice) return;
          lastMicDevice = deviceId;
          void switchMic(deviceId).catch((err) => {
            console.warn("[voice] смена микрофона не удалась:", err);
          });
        });

        if (!lk.canPlaybackAudio) {
          try {
            await lk.startAudio();
            if (alive) setAudioBlocked(false);
          } catch {
            /* звук разблокируется по первому жесту */
          }
        }

        const onGesture = () => {
          if (!alive || !lk) return;
          if (!lk.canPlaybackAudio) {
            void lk
              .startAudio()
              .then(() => {
                if (alive) setAudioBlocked(false);
              })
              .catch(() => {});
          }
          if (micPendingRef.current) {
            void enableMic().then((ok) => {
              if (!alive) return;
              if (ok) {
                syncMic();
              } else {
                micPendingRef.current = false;
                setMicUnavailable(true);
                micUnavailableRef.current = true;
              }
            });
          }
        };
        window.addEventListener("pointerdown", onGesture, { once: true });

        refresh();
        pingTimer = setInterval(samplePing, 2000);
        void samplePing();
        levelTimer = setInterval(syncLevels, 200);
        syncLevels();
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "Ошибка подключения");
          console.error("[voice] connect error:", err);
        }
      }
    })();

    return () => {
      alive = false;
      window.removeEventListener("pointerdown", resumeMix);
      window.removeEventListener("keydown", resumeMix);
      if (joinedRef.current) playLeaveSound();
      if (pingTimer) clearInterval(pingTimer);
      if (levelTimer) clearInterval(levelTimer);
      audioElsRef.current.clear();
      for (const [, a] of analysersRef.current) void a.ctx.close();
      analysersRef.current.clear();
      for (const [, pb] of playbackCtxRef.current) {
        try {
          pb.src.disconnect();
          pb.mono.disconnect();
        } catch {
          /* ignore */
        }
      }
      playbackCtxRef.current.clear();
      for (const [, pb] of screenPbRef.current) {
        try {
          pb.src.disconnect();
          pb.mono.disconnect();
        } catch {
          /* ignore */
        }
      }
      screenPbRef.current.clear();
      if (mixCtxRef.current) {
        try {
          void mixCtxRef.current.close();
        } catch {
          /* ignore */
        }
        mixCtxRef.current = null;
      }
      tracksRef.current.clear();
      unsubKrisp?.();
      unsubMic?.();
      preTrackRef.current?.stop();
      preTrackRef.current = null;
      if (room) {
        screenCaptureRef.current?.stop();
        screenCaptureRef.current = null;
      }
      for (const [, t] of screensRef.current) {
        for (const el of t.detach()) el.remove();
      }
      screensRef.current.clear();
      room?.disconnect();
      roomRef.current = null;
      onStatus?.(null);
      onSpeaking?.([]);
      onParticipants?.({});
    };
  }, [channelId]);

  useEffect(() => {
    onSpeaking?.(speakingIds);
  }, [speakingIds, onSpeaking]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    void room.localParticipant.setAttributes({
      gacha_muted: muted ? "1" : "0",
      gacha_deafened: deafened ? "1" : "0",
    });
  }, [muted, deafened]);

  useEffect(() => {
    if (!onParticipants) return;
    const map: Record<string, ParticipantVoiceState> = {};
    const me = meIdentityRef.current;
    if (me) map[me.split("--")[0]] = { muted, deafened };
    for (const p of participants) {
      map[p.identity.split("--")[0]] = {
        muted: p.attributes?.gacha_muted === "1" || !p.isMicrophoneEnabled,
        deafened: p.attributes?.gacha_deafened === "1",
      };
    }
    onParticipants(map);
  }, [participants, muted, deafened, onParticipants]);

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = { toggleMic, toggleDeafen, leave };
    return () => {
      controlsRef.current = null;
    };
  }, []);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    if (deafenedRef.current) return;
    try {
      const next = !room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(
        next,
        next ? { deviceId: getSettings().micDeviceId || { ideal: "default" } } : undefined,
      );
      setMuted(!next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const toggleDeafen = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    try {
      if (next) {
        await room.localParticipant.setMicrophoneEnabled(false);
        setMuted(true);
        for (const track of tracksRef.current.values())
          applyVolumeToTrack(track, 0);
        for (const [, pb] of screenPbRef.current)
          applyScreenVolumeToTrack(pb.track, 0);
      } else {
        for (const [identity, track] of tracksRef.current) {
          const p = room.remoteParticipants.get(identity);
          const name = p?.name ?? identity;
          const v =
            storedVolumesRef.current.get(name) ?? readStoredVolume(name);
          applyVolumeToTrack(track, v);
        }
        for (const [identity, pb] of screenPbRef.current) {
          const p = room.remoteParticipants.get(identity);
          const name = p?.name ?? identity;
          const v =
            storedScreenVolRef.current.get(name) ?? readStoredScreenVol(name);
          applyScreenVolumeToTrack(pb.track, v);
        }
        if (!micUnavailableRef.current) {
          await room.localParticipant.setMicrophoneEnabled(true);
          setMuted(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const toggleScreenShare = () => {
    const room = roomRef.current;
    if (!room || screenBusyRef.current) return;
    screenBusyRef.current = true;
    if (sharingScreen) {
      screenCaptureRef.current?.stop();
      screenCaptureRef.current = null;
      screenBusyRef.current = false;
      return;
    }
    const start = async (quality: "720" | "1080", fps: 30 | 60 | 90) => {
      writeScreenPref("res", quality);
      writeScreenPref("fps", String(fps));
      const width = quality === "1080" ? 1920 : 1280;
      const height = quality === "1080" ? 1080 : 720;
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: fps } },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (!roomRef.current) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        const rawVideo = stream.getVideoTracks()[0] ?? null;
        const rawAudio = stream.getAudioTracks()[0] ?? null;
        if (!rawVideo) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const gctx = canvas.getContext("2d");
        if (!gctx) throw new Error("Не удалось создать холст для демонстрации");
        const videoEl = document.createElement("video");
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.srcObject = new MediaStream([rawVideo]);
        videoEl.style.cssText =
          "position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;opacity:0;pointer-events:none;";
        document.body.appendChild(videoEl);
        const ready = new Promise<void>((resolve) => {
          if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
            resolve();
            return;
          }
          videoEl.addEventListener("loadeddata", () => resolve(), { once: true });
          setTimeout(resolve, 1500);
        });
        await videoEl.play().catch(() => {});
        await ready;
        let running = true;
        let drawTimer: ReturnType<typeof setInterval> | null = null;
        const draw = () => {
          if (!running) return;
          try {
            gctx.drawImage(videoEl, 0, 0, width, height);
          } catch {
            /* ignore */
          }
        };
        draw();
        drawTimer = setInterval(draw, 1000 / fps);
        const outStream = canvas.captureStream(fps);
        const outVideo = outStream.getVideoTracks()[0];
        const localVideo = new LocalVideoTrack(outVideo);
        await room.localParticipant.publishTrack(localVideo, {
          source: Track.Source.ScreenShare,
          name: "screen",
          simulcast: false,
          videoEncoding: {
            maxBitrate: screenBitrate(fps, quality),
            maxFramerate: fps,
          },
        });
        if (!roomRef.current) {
          running = false;
          if (drawTimer) clearInterval(drawTimer);
          localVideo.stop();
          videoEl.remove();
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        // Звук трансляции публикуется отдельным треком. В вебе getDisplayMedia
        // может отдать звук таба/системы; в Electron главный процесс добавляет
        // системный loopback (audio: "loopback" в setDisplayMediaRequestHandler).
        let localAudio: LocalAudioTrack | null = null;
        if (rawAudio) {
          localAudio = new LocalAudioTrack(rawAudio);
        }
        if (localAudio && roomRef.current) {
          await room.localParticipant.publishTrack(localAudio, {
            source: Track.Source.ScreenShareAudio,
            name: "screen-audio",
          });
        }
        if (!roomRef.current) {
          running = false;
          if (drawTimer) clearInterval(drawTimer);
          localVideo.stop();
          localAudio?.stop();
          videoEl.remove();
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        screenCaptureRef.current = {
          stop: () => {
            if (!running) return;
            running = false;
            if (drawTimer) clearInterval(drawTimer);
            void room.localParticipant.unpublishTrack(localVideo).catch(() => {});
            if (localAudio)
              void room.localParticipant
                .unpublishTrack(localAudio)
                .catch(() => {});
            localVideo.stop();
            localAudio?.stop();
            videoEl.srcObject = null;
            videoEl.remove();
            for (const t of stream.getTracks()) t.stop();
          },
        };
        rawVideo.addEventListener("ended", () => {
          screenCaptureRef.current?.stop();
          screenCaptureRef.current = null;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (!/notallowed|cancel|abort|dismiss|permission/i.test(msg)) {
          setError(msg || "Не удалось начать демонстрацию экрана");
        }
      } finally {
        screenBusyRef.current = false;
      }
    };
    if (isDesktopApp) {
      const pick = window.gachaScreen?.pick;
      if (!pick) return;
      void pick({ quality: screenRes, fps: screenFps })
        .then((res) => {
          if ("cancelled" in res) {
            screenBusyRef.current = false;
            return;
          }
          setScreenRes(res.quality);
          setScreenFps(res.fps);
          void start(res.quality, res.fps);
        })
        .catch(() => {
          screenBusyRef.current = false;
        });
      return;
    }
    void start(screenRes, screenFps);
  };

  const leave = () => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    onLeave();
  };

  const startAudio = async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.startAudio();
    const ctx = mixCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    setAudioBlocked(!room.canPlaybackAudio);
  };

  const setParticipantVolume = (identity: string, name: string, v: number) => {
    const clamped = Math.min(2, Math.max(0, v));
    storedVolumesRef.current.set(name, clamped);
    writeStoredVolume(name, clamped);
    setVolumes((prev) => ({ ...prev, [identity]: clamped }));
    const track = tracksRef.current.get(identity);
    if (track && !deafenedRef.current) applyVolumeToTrack(track, clamped);
  };

  const setScreenVolume = (identity: string, name: string, v: number) => {
    const clamped = Math.min(2, Math.max(0, v));
    storedScreenVolRef.current.set(name, clamped);
    writeStoredScreenVol(name, clamped);
    setScreenVolumes((prev) => ({ ...prev, [identity]: clamped }));
    const pb = screenPbRef.current.get(identity);
    if (pb && !deafenedRef.current) applyScreenVolumeToTrack(pb.track, clamped);
  };

  const meSpeaking = meIdentity ? speakingIds.includes(meIdentity) : false;

  const screenByIdentity = new Map<string, Track>();
  for (const s of screens) screenByIdentity.set(s.identity, s.track);
  const meScreen = meIdentity ? screenByIdentity.get(meIdentity) : undefined;

  return (
    <div className="pv-room voice-room">
      {!hideHead && (
        <div className="pv-room-head">
          <h2 className="pv-room-name">
            <span className="ch-icon">🔊</span> {channelName}
          </h2>
          <span className="pv-room-sub">голосовой канал · LiveKit</span>
        </div>
      )}

      <div className="pv-members">
        <div className={`pv-member ${meSpeaking ? "speaking" : ""}`}>
          <div className="pv-member-row">
            <Avatar src={meAvatar} name={meName} size={40} online />
            <span className="pv-member-name">{meName}</span>
            <span className="pv-member-owner">вы</span>
            {muted && (
              <span className="pv-member-ico" title="Микрофон выключен">
                <MicOffMiniIcon />
              </span>
            )}
            {deafened && (
              <span className="pv-member-ico" title="Оглушён">
                <DeafenOffMiniIcon />
              </span>
            )}
          </div>
          {meScreen && (
            <div className="pv-member-screen">
              <ScreenShareView track={meScreen} muted={true} />
              <span className="pv-member-screen-label">Ваш экран</span>
            </div>
          )}
        </div>
        {participants.length === 0 && (
          <p className="modal-note">Пока никто не подключился</p>
        )}
        {participants.map((p) => {
          const name = p.name ?? p.identity;
          const vol = volumes[p.identity] ?? 1;
          const screenTrack = screenByIdentity.get(p.identity);
          return (
            <div
              key={p.identity}
              className={`pv-member ${speakingIds.includes(p.identity) ? "speaking" : ""}`}
            >
              <div className="pv-member-row">
                <Avatar src={null} name={name} size={40} online />
                <span className="pv-member-name">{name}</span>
                {(!p.isMicrophoneEnabled || p.attributes?.gacha_muted === "1") && (
                  <span className="pv-member-ico" title="Микрофон выключен">
                    <MicOffMiniIcon />
                  </span>
                )}
                {p.attributes?.gacha_deafened === "1" && (
                  <span className="pv-member-ico" title="Оглушён">
                    <DeafenOffMiniIcon />
                  </span>
                )}
                <div className="pv-volume">
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={Math.round(vol * 100)}
                    onChange={(e) =>
                      setParticipantVolume(
                        p.identity,
                        name,
                        Number(e.target.value) / 100,
                      )
                    }
                    title={`Громкость ${name}`}
                  />
                  <span className="pv-volume-val">{Math.round(vol * 100)}%</span>
                </div>
              </div>
              {screenTrack && (
                <div className="pv-member-screen">
                  <ScreenShareView track={screenTrack} muted={deafened} />
                  <span className="pv-member-screen-label">{name}</span>
                  <div
                    className="pv-volume pv-screen-volume"
                    title={`Громкость трансляции ${name}`}
                  >
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={5}
                      value={Math.round((screenVolumes[p.identity] ?? 1) * 100)}
                      onChange={(e) =>
                        setScreenVolume(
                          p.identity,
                          name,
                          Number(e.target.value) / 100,
                        )
                      }
                    />
                    <span className="pv-volume-val">
                      {Math.round((screenVolumes[p.identity] ?? 1) * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {micUnavailable && (
        <p className="modal-note">
          Микрофон недоступен — вы слышите других, но вас не слышно.
        </p>
      )}
      {audioBlocked && (
        <div className="voice-unlock">
          <p className="modal-note">
            Браузер заблокировал звук. Нажмите кнопку, чтобы включить прослушивание.
          </p>
          <button className="btn primary" onClick={startAudio}>
            Включить звук
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="voice-controls-wrap">
        <div className="voice-controls">
          <button
            className={`voice-ctl ${muted ? "active" : ""}`}
            onClick={toggleMic}
            disabled={deafened}
            title={muted ? "Включить микрофон" : "Выключить микрофон"}
          >
            {muted ? <MicOffIcon /> : <MicIcon />}
          </button>
          <button
            className={`voice-ctl ${deafened ? "active" : ""}`}
            onClick={toggleDeafen}
            title={deafened ? "Снять оглушение" : "Оглушить"}
          >
            {deafened ? <DeafenOffIcon /> : <DeafenIcon />}
          </button>
          <button
            className={`voice-ctl ${sharingScreen ? "active" : ""}`}
            onClick={toggleScreenShare}
            disabled={!connected}
            title={
              sharingScreen
                ? "Остановить демонстрацию экрана"
                : "Демонстрация экрана"
            }
          >
            <ScreenShareIcon />
          </button>
          {!isDesktopApp && (
            <div className="voice-ctl-selects">
              <select
                className="pv-qsel"
                value={screenRes}
                disabled={sharingScreen}
                onChange={(e) => setScreenRes(e.target.value as "720" | "1080")}
                title="Разрешение трансляции"
              >
                <option value="720">720p</option>
                <option value="1080">1080p</option>
              </select>
              <select
                className="pv-qsel"
                value={String(screenFps)}
                disabled={sharingScreen}
                onChange={(e) =>
                  setScreenFps(Number(e.target.value) as 30 | 60 | 90)
                }
                title="Частота кадров"
              >
                <option value="30">30 fps</option>
                <option value="60">60 fps</option>
                <option value="90">90 fps</option>
              </select>
            </div>
          )}
        </div>
        <button className="voice-ctl exit" onClick={leave} title="Покинуть канал">
          <LeaveIcon />
        </button>
      </div>
    </div>
  );
}
