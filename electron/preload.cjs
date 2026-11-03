const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("opendeckNative", {
  pickAudio: (kind) => ipcRenderer.invoke("pick-audio", kind),
  platform: process.platform,
  readAudio: (path) => ipcRenderer.invoke("read-audio", path),
});
