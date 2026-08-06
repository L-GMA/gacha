const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pickerAPI", {
  list: () => ipcRenderer.invoke("picker:list"),
  select: (id, quality, fps) =>
    ipcRenderer.invoke("picker:select", id, quality, fps),
  cancel: () => ipcRenderer.invoke("picker:cancel"),
});
