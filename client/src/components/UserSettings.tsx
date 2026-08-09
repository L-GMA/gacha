import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { api, type User } from "../api.js";
import { highestRoleColor } from "../roleColor.js";
import { Avatar } from "./Avatar.js";
import { Toggle } from "./Toggle.js";
import { getSettings, setSetting, subscribeSettings } from "../settings.js";
import { playCustomSound } from "../sounds.js";
import { hotkeyLabel, isModifierKey, mouseHotkeyCode } from "../hotkeys.js";
import {
  openMicGraph,
  setGraphGain,
  getVoiceMicGraph,
  micLevel,
  clampGain,
  setMonitorMic,
  type MicGraph,
} from "../micPipeline.js";

type SectionId = "profile" | "sound" | "camera" | "notifications" | "hotkeys";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "profile", label: "Настройка профиля" },
  { id: "sound", label: "Настройка звука" },
  { id: "camera", label: "Настройка камеры" },
  { id: "notifications", label: "Уведомления" },
  { id: "hotkeys", label: "Горячие клавиши" },
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
    case "hotkeys":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01" />
          <path d="M10 10h.01" />
          <path d="M14 10h.01" />
          <path d="M18 10h.01" />
          <path d="M8 14h8" />
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
          {section === "notifications" && (
            <NotificationsSection me={me} onChanged={onChanged} />
          )}
          {section === "hotkeys" && <HotkeysSection />}
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
  const [uploading, setUploading] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNickname(me.nickname ?? "");
    setAvatar(me.avatar ?? "");
    setBio(me.bio ?? "");
  }, [me]);

  const roleColor = highestRoleColor(me.roles);
  const displayName = nickname.trim() || me.login;

  const handleAvatarFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      setAvatar(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await api.updateMe(nickname.trim() || null, avatar.trim(), bio.trim() || null);
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
            <div className="us-avatar-row">
              <Avatar src={avatar.trim() || me.avatar} name={displayName} size={40} />
              <button
                className="btn small"
                type="button"
                disabled={uploading}
                onClick={() => avatarFileRef.current?.click()}
              >
                {uploading ? "Загрузка…" : "Загрузить"}
              </button>
              {avatar && (
                <button
                  className="btn small"
                  type="button"
                  onClick={() => setAvatar("")}
                >
                  Удалить
                </button>
              )}
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAvatarFile}
              />
            </div>
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
          <small>Прослушать микрофон.</small>
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

function RangeRow({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
  disabled,
  format,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  format?: (v: number) => string;
}) {
  return (
    <div className="us-setting-row">
      <div className="us-setting-text">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <input
        type="range"
        className="us-gain-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="us-gain-val">{format ? format(value) : String(value)}</span>
    </div>
  );
}

function SoundSection() {
  const [settings, setLocal] = useState(getSettings());
  const mics = useDevices("audioinput");

  useEffect(() => subscribeSettings(() => setLocal(getSettings())), []);

  return (
    <>
      <div className="us-group">
        <div className="us-group-head">Микрофон</div>
        <div className="us-stack">
          <DeviceSelect
            label="Микрофон"
            devices={mics}
            value={settings.micDeviceId}
            onChange={(id) => setSetting("micDeviceId", id)}
          />
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Режим микрофона</span>
              <small>
                Режим голоса — микрофон работает постоянно. Режим рации — говорите,
                пока зажата клавиша или кнопка микрофона. Мут и оглушение —
                приоритетный слой: при включённом муте рация не передаёт звук,
                а само зажатие рации не меняет состояние мута.
              </small>
            </div>
            <select
              className="us-select"
              value={settings.voiceMode}
              onChange={(e) =>
                setSetting("voiceMode", e.target.value as "voice" | "ptt")
              }
            >
              <option value="voice">Режим голоса</option>
              <option value="ptt">Режим рации</option>
            </select>
          </div>
          <RangeRow
            label="Задержка после отпускания"
            hint="Сколько секунд микрофон остаётся открытым после отпускания клавиши рации"
            min={1}
            max={10}
            step={1}
            value={settings.pttTailSec}
            disabled={settings.voiceMode !== "ptt"}
            onChange={(v) => setSetting("pttTailSec", v)}
            format={(v) => `${v} сек`}
          />
          <RangeRow
            label="Громкость щелчка рации"
            hint="Звук при нажатии и отпускании клавиши рации (0 — выключен)"
            min={0}
            max={100}
            step={5}
            value={settings.pttSoundVol}
            disabled={settings.voiceMode !== "ptt"}
            onChange={(v) => setSetting("pttSoundVol", v)}
            format={(v) => `${v}%`}
          />
        </div>
        <MicLevelMeter settings={settings} />
      </div>

      <div className="us-group">
        <div className="us-group-head">Подавление шума (Krisp)</div>
        <div className="us-stack">
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>AI-шумоподавление</span>
              <small>Очистка голоса от фонового шума в реальном времени.</small>
            </div>
            <Toggle checked={settings.krisp} onChange={(v) => setSetting("krisp", v)} label="Krisp" />
          </div>
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Степень очистки</span>
              <small>Чем выше, тем чище звук, но больше нагрузка на ЦП.</small>
            </div>
            <select
              className="us-select"
              value={settings.krispQuality}
              disabled={!settings.krisp}
              onChange={(e) => setSetting("krispQuality", e.target.value as "low" | "medium" | "high")}
            >
              <option value="low">Минимальная</option>
              <option value="medium">Средняя</option>
              <option value="high">Максимальная</option>
            </select>
          </div>
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Подавление фоновых голосов</span>
              <small>
                Убирает чужие голоса на фоне (люди, ТВ, кафе). Работает не на всех
                микрофонах.
              </small>
            </div>
            <Toggle
              checked={settings.krispBvc}
              disabled={!settings.krisp}
              onChange={(v) => setSetting("krispBvc", v)}
              label="BVC"
            />
          </div>
        </div>
      </div>

      <div className="us-group">
        <div className="us-group-head">Системные фильтры микрофона</div>
        <div className="us-stack">
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Шумоподавление устройства</span>
              <small>Встроенный фильтр системы/браузера — дополнительный слой к AI-очистке.</small>
            </div>
            <Toggle
              checked={settings.micNoiseSuppression}
              onChange={(v) => setSetting("micNoiseSuppression", v)}
              label="NS"
            />
          </div>
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Подавление эха</span>
              <small>Убирает эхо от динамиков. Рекомендуется держать включённым.</small>
            </div>
            <Toggle
              checked={settings.micEchoCancellation}
              onChange={(v) => setSetting("micEchoCancellation", v)}
              label="AEC"
            />
          </div>
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Автоуровень (AGC)</span>
              <small>Автоматически подстраивает громкость. Выключите, если голос «плавает».</small>
            </div>
            <Toggle
              checked={settings.micAutoGainControl}
              onChange={(v) => setSetting("micAutoGainControl", v)}
              label="AGC"
            />
          </div>
          <p className="hint">Изменения применяются к текущему микрофону сразу.</p>
        </div>
      </div>

      <div className="us-group">
        <div className="us-group-head">Нойз-гейт</div>
        <div className="us-stack">
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Шумовой затвор</span>
              <small>
                Приглушает микрофон в тишине — убирает дыхание, клавиатуру и фоновый
                гул в паузах между репликами.
              </small>
            </div>
            <Toggle checked={settings.gate} onChange={(v) => setSetting("gate", v)} label="Гейт" />
          </div>
          <RangeRow
            label="Порог срабатывания"
            hint="Уровень, ниже которого микрофон приглушается"
            min={1}
            max={60}
            step={1}
            value={settings.gateThreshold}
            disabled={!settings.gate}
            onChange={(v) => setSetting("gateThreshold", v)}
            format={(v) => `${v}%`}
          />
          <RangeRow
            label="Открытие (атака)"
            hint="Как быстро микрофон открывается в начале речи"
            min={5}
            max={100}
            step={5}
            value={settings.gateAttackMs}
            disabled={!settings.gate}
            onChange={(v) => setSetting("gateAttackMs", v)}
            format={(v) => `${v} мс`}
          />
          <RangeRow
            label="Закрытие (сброс)"
            hint="Как быстро микрофон приглушается после речи"
            min={50}
            max={800}
            step={25}
            value={settings.gateReleaseMs}
            disabled={!settings.gate}
            onChange={(v) => setSetting("gateReleaseMs", v)}
            format={(v) => `${v} мс`}
          />
          <p className="hint">
            Если гейт «режет» начала слов — снизьте порог или увеличьте время открытия.
            Слушайте результат через «Прослушать микрофон».
          </p>
        </div>
      </div>
    </>
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

function audioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const cleanup = () => {
      URL.revokeObjectURL(url);
      el.src = "";
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = el.duration;
      cleanup();
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.onerror = () => {
      cleanup();
      reject(new Error("Не удалось прочитать аудиофайл"));
    };
    el.src = url;
  });
}

const SOUND_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
];

function NotificationsSection({ me, onChanged }: { me: User; onChanged: () => void }) {
  const [settings, setLocal] = useState(getSettings());
  const [perm, setPerm] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const [busy, setBusy] = useState<"join" | "leave" | null>(null);
  const [error, setError] = useState("");
  const joinInputRef = useRef<HTMLInputElement>(null);
  const leaveInputRef = useRef<HTMLInputElement>(null);

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

  const pickSound = async (type: "join" | "leave", file: File | null) => {
    setError("");
    if (!file) return;
    if (!SOUND_MIME.includes(file.type.toLowerCase())) {
      setError("Можно загружать только аудио (mp3, wav, ogg, m4a)");
      return;
    }
    let duration = 0;
    try {
      duration = await audioDuration(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось прочитать аудиофайл");
      return;
    }
    if (duration > 3.05) {
      setError("Звук слишком длинный — максимум 3 секунды");
      return;
    }
    setBusy(type);
    try {
      await api.uploadSound(type, file);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(null);
    }
  };

  const resetSound = async (type: "join" | "leave") => {
    setError("");
    setBusy(type);
    try {
      await api.clearSound(type);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
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

      <div className="us-group">
        <div className="us-group-head">Звуки голосового канала</div>
        <div className="us-stack">
          <div className="us-setting-row">
            <div className="us-setting-text">
              <span>Звуки входа и выхода</span>
              <small>Сигналы при подключении и отключении участников</small>
            </div>
            <Toggle checked={settings.sounds} onChange={(v) => setSetting("sounds", v)} label="Звуки" />
          </div>

          <SoundUploadRow
            label="Звук при входе"
            url={me.join_sound_url ?? null}
            busy={busy === "join"}
            inputRef={joinInputRef}
            onPick={(f) => pickSound("join", f)}
            onReset={() => resetSound("join")}
          />
          <SoundUploadRow
            label="Звук при выходе"
            url={me.leave_sound_url ?? null}
            busy={busy === "leave"}
            inputRef={leaveInputRef}
            onPick={(f) => pickSound("leave", f)}
            onReset={() => resetSound("leave")}
          />
        </div>
        <p className="hint">
          Свой звук услышат все участники голосового канала, когда вы заходите или выходите.
          Длительность — не более 3 секунд.
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}

function SoundUploadRow({
  label,
  url,
  busy,
  inputRef,
  onPick,
  onReset,
}: {
  label: string;
  url: string | null;
  busy: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onPick: (file: File | null) => void;
  onReset: () => void;
}) {
  const play = () => {
    if (!url) return;
    try {
      void playCustomSound(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="us-setting-row">
      <div className="us-setting-text">
        <span>{label}</span>
        <small>{url ? "Ваш звук (до 3 секунд)" : "Стандартный звук"}</small>
      </div>
      <div className="us-sound-actions">
        {url && (
          <button className="btn small" type="button" onClick={play}>
            Играть
          </button>
        )}
        <button
          className="btn small"
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Загрузка…" : "Загрузить"}
        </button>
        {url && (
          <button className="btn small ghost" type="button" disabled={busy} onClick={onReset}>
            Сбросить
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            onPick(file);
          }}
        />
      </div>
    </div>
  );
}

type HotkeyTarget = "ptt" | "mute" | "deafen";

function HotkeysSection() {
  const [settings, setLocal] = useState(getSettings());
  const [capturing, setCapturing] = useState<HotkeyTarget | null>(null);

  useEffect(() => subscribeSettings(() => setLocal(getSettings())), []);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (isModifierKey(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setCapturing(null);
        return;
      }
      const hk = { ...getSettings().hotkeys };
      hk[capturing] = e.code;
      setSetting("hotkeys", hk);
      setCapturing(null);
    };
    const onMouse = (e: MouseEvent) => {
      const code = mouseHotkeyCode(e.button);
      if (!code) return;
      e.preventDefault();
      e.stopPropagation();
      const hk = { ...getSettings().hotkeys };
      hk[capturing] = code;
      setSetting("hotkeys", hk);
      setCapturing(null);
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    window.addEventListener("contextmenu", onContext, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
      window.removeEventListener("contextmenu", onContext, true);
    };
  }, [capturing]);

  const clearKey = (target: HotkeyTarget) => {
    const hk = { ...getSettings().hotkeys };
    hk[target] = "";
    setSetting("hotkeys", hk);
  };

  return (
    <div className="us-group">
      <div className="us-group-head">Горячие клавиши</div>
      <div className="us-stack">
        <HotkeyRow
          label="Клавиша рации"
          hint="Зажать и говорить (только в режиме рации)"
          value={settings.hotkeys.ptt}
          disabled={settings.voiceMode !== "ptt"}
          capturing={capturing === "ptt"}
          onCapture={() => setCapturing("ptt")}
          onClear={() => clearKey("ptt")}
        />
        <HotkeyRow
          label="Мут микрофона"
          hint="Нажал — включил, ещё раз — выключил"
          value={settings.hotkeys.mute}
          capturing={capturing === "mute"}
          onCapture={() => setCapturing("mute")}
          onClear={() => clearKey("mute")}
        />
        <HotkeyRow
          label="Оглушение"
          hint="Нажал — оглушил, ещё раз — снял"
          value={settings.hotkeys.deafen}
          capturing={capturing === "deafen"}
          onCapture={() => setCapturing("deafen")}
          onClear={() => clearKey("deafen")}
        />
      </div>
      <p className="hint">
        Нажмите на кнопку, затем нажмите нужную клавишу на клавиатуре или боковую кнопку мыши
        (назад/вперёд, средняя тоже подойдёт). Esc — отмена. Горячие клавиши работают, когда вы
        находитесь в голосовом канале, и не срабатывают, пока вы вводите текст (кроме кнопок мыши).
      </p>
    </div>
  );
}

function HotkeyRow({
  label,
  hint,
  value,
  disabled,
  capturing,
  onCapture,
  onClear,
}: {
  label: string;
  hint: string;
  value: string;
  disabled?: boolean;
  capturing: boolean;
  onCapture: () => void;
  onClear: () => void;
}) {
  return (
    <div className="us-setting-row">
      <div className="us-setting-text">
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <div className="us-sound-actions">
        <button
          className={`btn small hotkey-capture ${capturing ? "recording" : ""}`}
          type="button"
          disabled={disabled || capturing}
          onClick={onCapture}
        >
          {capturing ? "Нажмите клавишу…" : value ? hotkeyLabel(value) : "Не задано"}
        </button>
        {value && !capturing && (
          <button className="btn small ghost" type="button" disabled={disabled} onClick={onClear}>
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
