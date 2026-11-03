import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, net, protocol, session } from "electron";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, "..", "dist");
const DEV_URL = "http://localhost:5173";
const useDevServer = !app.isPackaged && !process.argv.includes("--prod");
const AUDIO_EXT = /\.(mp3|wav|flac|ogg|m4a|aac|aiff?|opus)$/i;

// Files the user picked; the renderer may only read these.
const allowedFiles = new Set();

protocol.registerSchemesAsPrivileged([
  { privileges: { secure: true, standard: true, supportFetchAPI: true }, scheme: "app" },
]);

const serveDist = () => {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(distDir, decodeURIComponent(pathname)));
    if (!file.startsWith(distDir)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
};

const scanFolder = async (dir) => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && AUDIO_EXT.test(e.name))
    .map((e) => path.join(e.parentPath, e.name))
    .sort((a, b) => a.localeCompare(b));
};

ipcMain.handle("pick-audio", async (event, kind) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(window, {
    filters: kind === "files" ? [{ extensions: ["mp3", "wav", "flac", "ogg", "m4a", "aac", "aif", "aiff", "opus"], name: "Audio" }] : [],
    properties: kind === "folder" ? ["openDirectory"] : ["openFile", "multiSelections"],
    title: kind === "folder" ? "Import music folder" : "Add audio files",
  });
  if (result.canceled) return [];
  const files = kind === "folder" ? await scanFolder(result.filePaths[0]) : result.filePaths;
  for (const file of files) allowedFiles.add(file);
  return files.map((file) => ({ name: path.basename(file), path: file }));
});

ipcMain.handle("read-audio", async (_event, file) => {
  if (!allowedFiles.has(file)) throw new Error("File was not picked by the user");
  const data = await readFile(file);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
});

const createWindow = () => {
  const win = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    height: 960,
    minHeight: 700,
    minWidth: 1200,
    title: "OpenDeck",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(here, "preload.cjs"),
      sandbox: true,
    },
    width: 1600,
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void win.loadURL(useDevServer ? DEV_URL : "app://opendeck/index.html");
};

app.whenReady().then(() => {
  serveDist();
  // A local DJ app: allow audio device access and output selection without prompts.
  const allowed = new Set(["media", "speaker-selection", "midi"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(allowed.has(permission))
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
