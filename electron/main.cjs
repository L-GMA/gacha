const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  desktopCapturer,
  session,
  Tray,
  Menu,
  nativeImage,
  net,
} = require("electron");
const path = require("path");
const crypto = require("crypto");
const { mkdir, readdir, writeFile, unlink, stat } = require("fs/promises");
const { pathToFileURL } = require("url");
const { autoUpdater } = require("electron-updater");
const { uIOhook, UiohookKey } = require("uiohook-napi");

let mainWindow = null;
let splashWindow = null;
let updateSkipped = false;
let pickerWindow = null;
let pendingPickResolve = null;
let pendingScreenSelection = null;
let currentScreenPrefs = { quality: "1080", fps: 30 };
const pickerSources = new Map();

let tray = null;
let isQuitting = false;
let globalPtt = { keycode: null, mouseButton: null, enabled: false };
let hookRunning = false;

function sendUpdateStatus(status) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("update:status", status);
  }
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function openMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    closeSplash();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#313338",
    frame: false,
    autoHideMenuBar: true,
    title: "GACHA",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  const forwardMaximized = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window:maximized", mainWindow.isMaximized());
    }
  };
  mainWindow.on("maximize", forwardMaximized);
  mainWindow.on("unmaximize", forwardMaximized);
  mainWindow.webContents.on("did-finish-load", forwardMaximized);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadFile(path.join(__dirname, "..", "client", "dist", "index.html"));

  mainWindow.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  closeSplash();
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    openMainWindow();
  }
}

function createTray() {
  const isMac = process.platform === "darwin";
  const iconPath = path.join(
    __dirname,
    isMac ? "tray-iconTemplate.png" : "tray-icon.png",
  );
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip("GACHA");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Открыть GACHA", click: () => showMainWindow() },
      { type: "separator" },
      {
        label: "Выйти",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  if (process.platform === "win32") {
    tray.on("click", () => showMainWindow());
  }
  tray.on("double-click", () => showMainWindow());
}

const WEB_TO_UIOHOOK_DIRECT = {
  Space: UiohookKey.Space,
  Escape: UiohookKey.Escape,
  Tab: UiohookKey.Tab,
  Enter: UiohookKey.Enter,
  NumpadEnter: UiohookKey.NumpadEnter,
  Backspace: UiohookKey.Backspace,
  CapsLock: UiohookKey.CapsLock,
  NumLock: UiohookKey.NumLock,
  ScrollLock: UiohookKey.ScrollLock,
  PageUp: UiohookKey.PageUp,
  PageDown: UiohookKey.PageDown,
  Home: UiohookKey.Home,
  End: UiohookKey.End,
  Insert: UiohookKey.Insert,
  Delete: UiohookKey.Delete,
  ArrowUp: UiohookKey.ArrowUp,
  ArrowDown: UiohookKey.ArrowDown,
  ArrowLeft: UiohookKey.ArrowLeft,
  ArrowRight: UiohookKey.ArrowRight,
  ControlLeft: UiohookKey.Ctrl,
  ControlRight: UiohookKey.CtrlRight,
  ShiftLeft: UiohookKey.Shift,
  ShiftRight: UiohookKey.ShiftRight,
  AltLeft: UiohookKey.Alt,
  AltRight: UiohookKey.AltRight,
  MetaLeft: UiohookKey.Meta,
  MetaRight: UiohookKey.MetaRight,
  Semicolon: UiohookKey.Semicolon,
  Equal: UiohookKey.Equal,
  Comma: UiohookKey.Comma,
  Minus: UiohookKey.Minus,
  Period: UiohookKey.Period,
  Slash: UiohookKey.Slash,
  Backquote: UiohookKey.Backquote,
  BracketLeft: UiohookKey.BracketLeft,
  Backslash: UiohookKey.Backslash,
  BracketRight: UiohookKey.BracketRight,
  Quote: UiohookKey.Quote,
};

const WEB_MOUSE_TO_UIOHOOK = { 1: 3, 3: 4, 4: 5 };

// Переводит web-код горячей клавиши ("KeyA", "F1", "Mouse3"…) в код
// системного хука. null — клавиша не поддерживается для глобального PTT.
function webCodeToUiohook(code) {
  if (!code || typeof code !== "string") return null;
  const mouse = code.match(/^Mouse(\d+)$/);
  if (mouse) {
    const button = WEB_MOUSE_TO_UIOHOOK[Number(mouse[1])];
    return button ? { mouseButton: button } : null;
  }
  if (WEB_TO_UIOHOOK_DIRECT[code] != null) {
    return { keycode: WEB_TO_UIOHOOK_DIRECT[code] };
  }
  const key = code.match(/^Key([A-Z])$/);
  if (key && UiohookKey[key[1]] != null) return { keycode: UiohookKey[key[1]] };
  const digit = code.match(/^Digit([0-9])$/);
  if (digit && UiohookKey[digit[1]] != null) {
    return { keycode: UiohookKey[digit[1]] };
  }
  const f = code.match(/^F(\d{1,2})$/);
  if (f && UiohookKey[`F${f[1]}`] != null) {
    return { keycode: UiohookKey[`F${f[1]}`] };
  }
  const num = code.match(/^Numpad(\d)$/);
  if (num && UiohookKey[`Numpad${num[1]}`] != null) {
    return { keycode: UiohookKey[`Numpad${num[1]}`] };
  }
  return null;
}

function sendGlobalPtt(down) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("voice:global-ptt", down);
  }
}

function onHookKeyDown(e) {
  if (globalPtt.enabled && globalPtt.keycode != null && e.keycode === globalPtt.keycode) {
    sendGlobalPtt(true);
  }
}

function onHookKeyUp(e) {
  if (globalPtt.enabled && globalPtt.keycode != null && e.keycode === globalPtt.keycode) {
    sendGlobalPtt(false);
  }
}

function onHookMouseDown(e) {
  if (globalPtt.enabled && globalPtt.mouseButton != null && e.button === globalPtt.mouseButton) {
    sendGlobalPtt(true);
  }
}

function onHookMouseUp(e) {
  if (globalPtt.enabled && globalPtt.mouseButton != null && e.button === globalPtt.mouseButton) {
    sendGlobalPtt(false);
  }
}

function ensureHookRunning(running) {
  if (running && !hookRunning) {
    uIOhook.on("keydown", onHookKeyDown);
    uIOhook.on("keyup", onHookKeyUp);
    uIOhook.on("mousedown", onHookMouseDown);
    uIOhook.on("mouseup", onHookMouseUp);
    try {
      uIOhook.start();
      hookRunning = true;
    } catch (err) {
      console.error("uiohook start failed:", err);
      uIOhook.removeListener("keydown", onHookKeyDown);
      uIOhook.removeListener("keyup", onHookKeyUp);
      uIOhook.removeListener("mousedown", onHookMouseDown);
      uIOhook.removeListener("mouseup", onHookMouseUp);
    }
  } else if (!running && hookRunning) {
    try {
      uIOhook.stop();
    } catch {
      /* ignore */
    }
    uIOhook.removeListener("keydown", onHookKeyDown);
    uIOhook.removeListener("keyup", onHookKeyUp);
    uIOhook.removeListener("mousedown", onHookMouseDown);
    uIOhook.removeListener("mouseup", onHookMouseUp);
    hookRunning = false;
  }
}

function setGlobalPtt(code, enabled) {
  const mapped = enabled ? webCodeToUiohook(code) : null;
  if (mapped) {
    globalPtt = {
      keycode: mapped.keycode ?? null,
      mouseButton: mapped.mouseButton ?? null,
      enabled: true,
    };
    ensureHookRunning(true);
  } else {
    globalPtt = { keycode: null, mouseButton: null, enabled: false };
    ensureHookRunning(false);
  }
  return { mapped: Boolean(mapped) };
}

const SOUND_CACHE_MAX_FILES = 300;

function extFromContentType(contentType) {
  const ct = String(contentType || "").split(";")[0].trim().toLowerCase();
  const map = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/opus": ".ogg",
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/aac": ".m4a",
    "audio/x-m4a": ".m4a",
  };
  return map[ct] ?? null;
}

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const m = /\.(mp3|wav|ogg|webm|m4a)$/i.exec(pathname);
    return m ? `.${m[1].toLowerCase()}` : null;
  } catch {
    return null;
  }
}

async function pruneSoundCache(dir, keep) {
  try {
    const entries = await readdir(dir);
    if (entries.length <= keep) return;
    const files = await Promise.all(
      entries.map(async (name) => {
        const full = path.join(dir, name);
        try {
          const s = await stat(full);
          return { name, full, mtime: s.mtimeMs };
        } catch {
          return null;
        }
      }),
    );
    files
      .filter(Boolean)
      .sort((a, b) => a.mtime - b.mtime)
      .slice(0, files.length - keep)
      .forEach((f) => {
        void unlink(f.full).catch(() => {});
      });
  } catch {
    /* ignore */
  }
}

// В renderer приложение грузится по file://, и <audio> отказывается играть
// удалённые http(s) URL ("Media load rejected by URL safety check"). Поэтому
// кастомные звуки качаем в main-процессе и отдаём локальный file:// URL.
async function ensureSoundLocal(url) {
  if (typeof url !== "string" || !url) return url;
  let target = url;
  if (target.startsWith("/")) {
    target = "https://gachandra.ru" + target;
  }
  if (!/^https?:\/\//i.test(target)) return url;
  try {
    const hash = crypto.createHash("sha256").update(target).digest("hex");
    const dir = path.join(app.getPath("userData"), "sound-cache");
    await mkdir(dir, { recursive: true });
    const entries = await readdir(dir).catch(() => []);
    const existing = entries.find((f) => f.startsWith(hash + "."));
    if (existing) {
      return pathToFileURL(path.join(dir, existing)).href;
    }
    const res = await net.fetch(target);
    if (!res.ok) return url;
    const ext =
      extFromUrl(target) || extFromContentType(res.headers.get("content-type")) || ".mp3";
    const file = path.join(dir, hash + ext);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
    void pruneSoundCache(dir, SOUND_CACHE_MAX_FILES);
    return pathToFileURL(file).href;
  } catch {
    return url;
  }
}

function windowFromEvent(event) {
  if (pickerWindow && !pickerWindow.isDestroyed() && event.sender === pickerWindow.webContents) {
    return pickerWindow;
  }
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return null;
}

function openPickerWindow() {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.focus();
    return;
  }
  pickerWindow = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 600,
    minHeight: 400,
    parent: mainWindow,
    modal: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#141517",
    title: "Демонстрация экрана",
    webPreferences: {
      preload: path.join(__dirname, "picker-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const forwardPickerMax = () => {
    if (pickerWindow && !pickerWindow.isDestroyed()) {
      pickerWindow.webContents.send("window:maximized", pickerWindow.isMaximized());
    }
  };
  pickerWindow.on("maximize", forwardPickerMax);
  pickerWindow.on("unmaximize", forwardPickerMax);
  pickerWindow.webContents.on("did-finish-load", forwardPickerMax);
  pickerWindow.loadFile(path.join(__dirname, "picker.html"));
  pickerWindow.on("closed", () => {
    pickerWindow = null;
    const pr = pendingPickResolve;
    pendingPickResolve = null;
    if (pr) {
      try {
        pr({ cancelled: true });
      } catch {
        /* ignore */
      }
    }
  });
}

function setupDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    if (pendingScreenSelection) {
      const sel = pendingScreenSelection;
      pendingScreenSelection = null;
      try {
        callback({ video: sel.source, audio: "loopback" });
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 },
      });
      if (sources.length > 0) {
        try {
          callback({ video: sources[0], audio: "loopback" });
        } catch {
          /* ignore */
        }
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      callback({});
    } catch {
      /* ignore */
    }
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 240,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));

  splashWindow.once("ready-to-show", () => splashWindow.show());

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus({ state: "checking", message: "Проверка обновлений…" });
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus({
      state: "downloading",
      message: `Доступна новая версия ${info.version}`,
    });
    autoUpdater.downloadUpdate().catch(() => {});
  });

  autoUpdater.on("update-not-available", () => {
    openMainWindow();
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus({
      state: "downloading",
      message: "Скачивание обновления…",
      progress: progress.percent / 100,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    if (updateSkipped) return;
    sendUpdateStatus({
      state: "installing",
      message: "Обновление загружено. Установка…",
    });
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true);
    }, 800);
  });

  autoUpdater.on("error", (err) => {
    console.error("Update error:", err);
    openMainWindow();
  });

  autoUpdater.checkForUpdates().then((result) => {
    if (!result || !result.updateInfo) openMainWindow();
  }).catch(() => {});
}

app.whenReady().then(() => {
  if (process.platform === "win32") app.setAppUserModelId("ru.gacha.desktop");

  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.on("update:skip", () => {
    updateSkipped = true;
    openMainWindow();
  });

  ipcMain.on("window:minimize", (event) => {
    const w = windowFromEvent(event);
    if (w) w.minimize();
  });

  ipcMain.on("window:toggle-maximize", (event) => {
    const w = windowFromEvent(event);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });

  ipcMain.on("window:close", (event) => {
    if (pickerWindow && !pickerWindow.isDestroyed() && event.sender === pickerWindow.webContents) {
      pickerWindow.close();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });

  ipcMain.handle("window:is-maximized", (event) => {
    const w = windowFromEvent(event);
    return w ? w.isMaximized() : false;
  });

  ipcMain.handle("ptt:set", (_e, payload) => {
    const code =
      payload && typeof payload === "object" ? payload.code : undefined;
    const enabled = Boolean(payload && payload.enabled);
    return setGlobalPtt(typeof code === "string" ? code : "", enabled);
  });

  ipcMain.handle("sound:get", (_e, url) => ensureSoundLocal(url));

  ipcMain.handle("screen:pick", (_e, prefs) => {
    if (pendingPickResolve) return { cancelled: true };
    if (prefs && typeof prefs === "object") {
      currentScreenPrefs = {
        quality: prefs.quality === "720" ? "720" : "1080",
        fps: prefs.fps === 60 ? 60 : 30,
      };
    }
    openPickerWindow();
    return new Promise((resolve) => {
      pendingPickResolve = resolve;
    });
  });

  ipcMain.handle("picker:list", async () => {
    const screens = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 320, height: 200 },
    });
    const windows = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: true,
    });
    pickerSources.clear();
    const fmt = (s) => {
      pickerSources.set(s.id, s);
      return {
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      };
    };
    return {
      screens: screens.map(fmt),
      windows: windows.map(fmt),
      prefs: currentScreenPrefs,
    };
  });

  ipcMain.handle("picker:select", (_e, id, quality, fps) => {
    const source = pickerSources.get(id) ?? null;
    if (source) {
      currentScreenPrefs = {
        quality: quality === "720" ? "720" : "1080",
        fps: fps === 60 ? 60 : 30,
      };
      pendingScreenSelection = { source };
    }
    const pr = pendingPickResolve;
    pendingPickResolve = null;
    if (pr) {
      try {
        pr(
          source
            ? { quality: currentScreenPrefs.quality, fps: currentScreenPrefs.fps }
            : { cancelled: true },
        );
      } catch {
        /* ignore */
      }
    }
    if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();
  });

  ipcMain.handle("picker:cancel", () => {
    const pr = pendingPickResolve;
    pendingPickResolve = null;
    if (pr) {
      try {
        pr({ cancelled: true });
      } catch {
        /* ignore */
      }
    }
    pendingScreenSelection = null;
    if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();
  });

  setupDisplayMediaHandler();

  createTray();

  if (app.isPackaged || process.env.GACHA_SPLASH === "1") {
    createSplashWindow();
    setupAutoUpdater();
  } else {
    openMainWindow();
  }

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) showMainWindow();
    else openMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  ensureHookRunning(false);
});

app.on("window-all-closed", () => {
  if (tray) return;
  if (process.platform !== "darwin") app.quit();
});
