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
  onGlobalPtt: (callback) => {
    const listener = (_event, down) => callback(Boolean(down));
    ipcRenderer.on("voice:global-ptt", listener);
    return () => ipcRenderer.removeListener("voice:global-ptt", listener);
  },
});

contextBridge.exposeInMainWorld("gachaScreen", {
  pick: (prefs) => ipcRenderer.invoke("screen:pick", prefs),
});
