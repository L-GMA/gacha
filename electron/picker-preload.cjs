const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pickerAPI", {
  list: () => ipcRenderer.invoke("picker:list"),
  select: (id) => ipcRenderer.invoke("picker:select", id),
  cancel: () => ipcRenderer.invoke("picker:cancel"),
});
