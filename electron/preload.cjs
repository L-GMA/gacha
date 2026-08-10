const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
  skipUpdate: () => ipcRenderer.send("update:skip"),
  setGlobalPtt: (payload) => ipcRenderer.invoke("ptt:set", payload),
  getSound: (url) => ipcRenderer.invoke("sound:get", url),
  onGlobalPtt: (callback) => {
    const listener = (_event, down) => callback(Boolean(down));
    ipcRenderer.on("voice:global-ptt", listener);
    return () => ipcRenderer.removeListener("voice:global-ptt", listener);
  },
  windowControls: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizedChange: (callback) => {
      const listener = (_event, maximized) => callback(Boolean(maximized));
      ipcRenderer.on("window:maximized", listener);
      return () => ipcRenderer.removeListener("window:maximized", listener);
    },
  },
});

contextBridge.exposeInMainWorld("gachaScreen", {
  pick: (prefs) => ipcRenderer.invoke("screen:pick", prefs),
});
