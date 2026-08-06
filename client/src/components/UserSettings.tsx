import { useEffect, useRef, useState } from "react";
import { api, type User } from "../api.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";
import { Toggle } from "./Toggle.js";
import { getSettings, setSetting, subscribeSettings } from "../settings.js";
import {
  openMicGraph,
  setGraphGain,
  getVoiceMicGraph,
  micLevel,
  clampGain,
  setMonitorMic,
  type MicGraph,
} from "../micPipeline.js";

type SectionId = "profile" | "sound" | "camera" | "notifications";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "profile", label: "Настройка профиля" },
  { id: "sound", label: "Настройка звука" },
  { id: "camera", label: "Настройка камеры" },
  { id: "notifications", label: "Уведомления" },
];

function SectionIcon({ id }: { id: SectionId }) {
  switch (id) {
    case "profile":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "sound":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      );
    case "camera":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    case "notifications":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
  }
}

export function UserSettings({
  me,
  onClose,
  onChanged,
}: {
  me: User;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [section, setSection] = useState<SectionId>("profile");
  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="user-settings">
      <aside className="us-nav">
        <div className="us-nav-head">Пользовательские настройки</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`us-nav-item ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <SectionIcon id={s.id} />
            <span>{s.label}</span>
          </button>
        ))}
        <AppVersion />
      </aside>
      <section className="us-content">
        <header className="us-content-head">
          <h2>{current.label}</h2>
          <button className="icon-btn" title="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="us-content-body" key={section}>
          {section === "profile" && <ProfileSection me={me} onChanged={onChanged} />}
          {section === "sound" && <SoundSection />}
          {section === "camera" && <CameraSection />}
          {section === "notifications" && <NotificationsSection />}
        </div>
      </section>
    </div>
  );
}

function AppVersion() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (window.desktop?.getVersion) {
      window.desktop.getVersion().then(setVersion).catch(() => setVersion(__APP_VERSION__));
    } else {
      setVersion(__APP_VERSION__);
    }
  }, []);

  if (!version) return null;
  return <div className="us-nav-version">Версия {version}</div>;
}

function ProfileSection({ me, onChanged }: { me: User; onChanged: () => void }) {
  const [nickname, setNickname] = useState(me.nickname ?? "");
  const [avatar, setAvatar] = useState(me.avatar ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNickname(me.nickname ?? "");
    setAvatar(me.avatar ?? "");
    setBio(me.bio ?? "");
  }, [me]);

  const roleColor = highestRoleColor(me.roles);
  const displayName = nickname.trim() || me.login;

  const save = async () => {
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await api.updateMe(nickname.trim() || null, avatar.trim() || null, bio.trim() || null);
      onChanged();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="us-profile">
      <div className="us-profile-hero">
        <Avatar src={avatar.trim() || me.avatar} name={displayName} size={88} />
        <div className="us-profile-hero-info">
          <span className="profile-nick" style={roleColor ? { color: roleColor } : undefined}>
            {displayName}
          </span>
          <span className="profile-login">@{me.login}</span>
        </div>
      </div>

      <div className="us-group">
        <div className="us-group-head">Профиль</div>
        <div className="us-stack">
          <label className="us-setting-row us-row-field us-row-field-stacked">
            <span className="us-field-label">Ник</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={me.login} maxLength={32} />
          </label>
          <label className="us-setting-row us-row-field us-row-field-stacked">
            <span className="us-field-label">Аватар</span>
            <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
          </label>
          <label className="us-setting-row us-row-field us-row-field-stacked">
            <span className="us-field-label">О себе</span>
            <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Кратко о себе…" maxLength={50} />
            <span className="field-counter">{bio.length}/50</span>
          </label>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {saved && <p className="us-saved">Изменения сохранены</p>}
      <div className="us-actions">
        <button className="btn primary" disabled={saving} onClick={save}>
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

function useDevices(kind: "audioinput" | "videoinput"): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    let alive = true;
    navigator.mediaDevices
      .enumerateDevices()
      .then((ds) => {
        if (alive) setDevices(ds.filter((d) => d.kind === kind));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kind]);
  return devices;
}

function DeviceSelect({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="us-setting-row">
      <div className="us-setting-text">
        <span>{label}</span>
      </div>
      <select className="us-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Системное устройство по умолчанию</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Устройство (${d.deviceId.slice(0, 8)}…)`}
          </option>
        ))}
      </select>
    </div>
  );
}

function MicLevelMeter({ settings }: { settings: ReturnType<typeof getSettings> }) {
  const meterRef = useRef<MicGraph | null>(null);
  const ownedRef = useRef<MicGraph | null>(null);
  const monitorRef = useRef(false);
  const [level, setLevel] = useState(0);
  const [monitor, setMonitor] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    ownedRef.current?.close();
    ownedRef.current = null;
    meterRef.current = null;
    setError("");
    setLevel(0);

    const voice = getVoiceMicGraph();
    if (voice) {
      meterRef.current = voice;
      setMonitorMic(voice, monitorRef.current);
    } else {
      openMicGraph(getSettings().micDeviceId)
        .then((g) => {
          if (!alive) {
            g.close();
            return;
          }
          ownedRef.current = g;
          meterRef.current = g;
          setMonitorMic(g, monitorRef.current);
        })
        .catch(() => {
          if (alive) setError("Нет доступа к микрофону. Разрешите доступ в системе.");
        });
    }

    const timer = setInterval(() => {
      setLevel(micLevel(meterRef.current));
    }, 120);

    return () => {
      alive = false;
      clearInterval(timer);
      setMonitorMic(meterRef.current, false);
      ownedRef.current?.close();
      ownedRef.current = null;
      meterRef.current = null;
    };
  }, [settings.micDeviceId]);

  const toggleMonitor = () => {
    monitorRef.current = !monitorRef.current;
    setMonitor(monitorRef.current);
    setMonitorMic(meterRef.current, monitorRef.current);
  };

  const changeGain = (percent: number) => {
    const g = clampGain(percent / 100);
    setSetting("micGain", g);
    setGraphGain(meterRef.current, g);
    const voice = getVoiceMicGraph();
    if (voice) setGraphGain(voice, g);
  };

  const norm = Math.min(1, level * 3);

  return (
    <div className="us-stack">
      <div className="us-setting-row">
        <div className="us-setting-text">
          <span>Индикатор голоса</span>
          <small>Показывает, что микрофон передаёт звук</small>
        </div>
        {error ? (
          <span className="us-mic-status err">{error}</span>
        ) : (
          <div className="us-mic-meter">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className={`us-mic-bar ${norm * 14 >= i + 1 ? "on" : ""}`} />
            ))}
          </div>
        )}
      </div>
      <div className="us-setting-row">
        <div className="us-setting-text">
          <span>Прослушать микрофон</span>
          <small>Воспроизведение вашего голоса через динамики. Лучше в наушниках.</small>
        </div>
        <button
          className={`btn small ${monitor ? "primary" : ""}`}
          disabled={!!error}
          onClick={toggleMonitor}
        >
          {monitor ? "Остановить" : "Прослушать"}
        </button>
      </div>
      <div className="us-setting-row">
        <div className="us-setting-text">
          <span>Усиление микрофона</span>
          <small>Громкость вашего микрофона для собеседников</small>
        </div>
        <input
          type="range"
          className="us-gain-range"
          min={50}
          max={300}
          step={5}
          value={Math.round(clampGain(settings.micGain) * 100)}
          onChange={(e) => changeGain(Number(e.target.value))}
        />
        <span className="us-gain-val">{Math.round(clampGain(settings.micGain) * 100)}%</span>
      </div>
    </div>
  );
}

function SoundSection() {
  const [settings, setLocal] = useState(getSettings());
  const mics = useDevices("audioinput");

  useEffect(() => subscribeSettings(() => setLocal(getSettings())), []);

  return (
    <div className="us-group">
      <div className="us-group-head">Звук</div>
      <div className="us-stack">
        <div className="us-setting-row">
          <div className="us-setting-text">
            <span>Звуки входа и выхода из голосового канала</span>
            <small>Звуковые сигналы при подключении/отключении участников</small>
          </div>
          <Toggle checked={settings.sounds} onChange={(v) => setSetting("sounds", v)} label="Звуки" />
        </div>
      </div>
      <div className="us-group-head">Голос</div>
      <MicLevelMeter settings={settings} />
      <div className="us-stack">
        <DeviceSelect
          label="Микрофон"
          devices={mics}
          value={settings.micDeviceId}
          onChange={(id) => setSetting("micDeviceId", id)}
        />
      </div>
      <div className="us-stack">
        <div className="us-setting-row">
          <div className="us-setting-text">
            <span>Подавление шума (Krisp)</span>
            <small>AI-очистка голоса от фонового шума. Обработка локальная, без записи звука</small>
          </div>
          <Toggle checked={settings.krisp} onChange={(v) => setSetting("krisp", v)} label="Krisp" />
        </div>
        <div className="us-setting-row">
          <div className="us-setting-text">
            <span>Степень подавления шума</span>
            <small>Максимальная чистит сильнее, но нагружает процессор</small>
          </div>
          <select
            className="us-select"
            value={settings.krispQuality}
            disabled={!settings.krisp}
            onChange={(e) => setSetting("krispQuality", e.target.value as "low" | "medium" | "high")}
          >
            <option value="low">Экономная</option>
            <option value="medium">Стандартная</option>
            <option value="high">Максимальная</option>
          </select>
        </div>
      </div>
      <p className="hint">Смена микрофона применится после повторного входа в голосовой канал. Усиление слышно собеседникам сразу.</p>
    </div>
  );
}

function CameraPreview({ deviceId }: { deviceId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: deviceId ? { deviceId } : true, audio: false })
      .then((s) => {
        if (!alive) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        if (alive) setError("Нет доступа к камере. Разрешите доступ в браузере.");
      });
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  return (
    <div className="cam-preview">
      {error ? (
        <p className="hint">{error}</p>
      ) : (
        <video ref={videoRef} muted playsInline />
      )}
    </div>
  );
}

function CameraSection() {
  const [settings, setLocal] = useState(getSettings());
  const cams = useDevices("videoinput");

  useEffect(() => subscribeSettings(() => setLocal(getSettings())), []);

  return (
    <div className="us-group">
      <div className="us-group-head">Камера</div>
      <CameraPreview deviceId={settings.cameraDeviceId} />
      <div className="us-stack">
        <DeviceSelect
          label="Камера"
          devices={cams}
          value={settings.cameraDeviceId}
          onChange={(id) => setSetting("cameraDeviceId", id)}
        />
      </div>
      <p className="hint">Видеозвонки и трансляция появятся позже — пока можно проверить камеру и выбрать устройство.</p>
    </div>
  );
}

function NotificationsSection() {
  const [settings, setLocal] = useState(getSettings());
  const [perm, setPerm] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  useEffect(() => subscribeSettings(() => setLocal(getSettings())), []);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
    } catch {
      /* не поддерживается */
    }
  };

  return (
    <div className="us-group">
      <div className="us-group-head">Уведомления</div>
      <div className="us-stack">
        <div className="us-setting-row">
          <div className="us-setting-text">
            <span>Уведомления о новых сообщениях</span>
            <small>Показывать системные уведомления, когда приходят сообщения</small>
          </div>
          <Toggle checked={settings.notifications} onChange={(v) => setSetting("notifications", v)} label="Уведомления" />
        </div>

        {typeof Notification !== "undefined" && (
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Разрешение браузера</span>
              <small>
                {perm === "granted"
                  ? "Уведомления разрешены"
                  : perm === "denied"
                    ? "Уведомления заблокированы браузером"
                    : "Разрешение ещё не выдано"}
              </small>
            </div>
            {perm !== "granted" && perm !== "denied" && (
              <button className="btn small" onClick={requestPermission}>
                Разрешить
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
