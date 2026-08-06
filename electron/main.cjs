const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let splashWindow = null;
let updateSkipped = false;

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

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 240,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    backgroundColor: "#1e1f22",
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
