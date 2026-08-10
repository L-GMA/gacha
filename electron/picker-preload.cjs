const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pickerAPI", {
  list: () => ipcRenderer.invoke("picker:list"),
  select: (id, quality, fps) =>
    ipcRenderer.invoke("picker:select", id, quality, fps),
  cancel: () => ipcRenderer.invoke("picker:cancel"),
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
