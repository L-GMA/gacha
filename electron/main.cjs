const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  desktopCapturer,
  session,
} = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let splashWindow = null;
let updateSkipped = false;
let pickerWindow = null;
let pendingPickResolve = null;
let pendingScreenSelection = null;
let currentScreenPrefs = { quality: "1080", fps: 30 };
const pickerSources = new Map();

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadFile(path.join(__dirname, "..", "client", "dist", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  closeSplash();
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
        callback({ video: sel.source });
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
          callback({ video: sources[0] });
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

  ipcMain.handle("screen:pick", (_e, prefs) => {
    if (pendingPickResolve) return { cancelled: true };
    if (prefs && typeof prefs === "object") {
      currentScreenPrefs = {
        quality: prefs.quality === "720" ? "720" : "1080",
        fps: prefs.fps === 90 ? 90 : prefs.fps === 60 ? 60 : 30,
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
        fps: fps === 90 ? 90 : fps === 60 ? 60 : 30,
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

  if (app.isPackaged || process.env.GACHA_SPLASH === "1") {
    createSplashWindow();
    setupAutoUpdater();
  } else {
    openMainWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
