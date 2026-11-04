const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("opendeckNative", {
  importDjayCues: () => ipcRenderer.invoke("import-djay-cues"),
  pickAudio: (kind) => ipcRenderer.invoke("pick-audio", kind),
  platform: process.platform,
  readAudio: (path) => ipcRenderer.invoke("read-audio", path),
  scanFolder: () => ipcRenderer.invoke("scan-folder"),
});
