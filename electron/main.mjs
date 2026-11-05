// スタンドアロン版 (Electron) のメインプロセス。
// ビルド済みの dist を独自プロトコルで配信する。file:// では Worklet の読み込みや fetch が
// 制限され、IndexedDB の保存先となる origin も安定しないため使わない
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from "electron";
import { sep, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEME = "app";
const ORIGIN = `${SCHEME}://bundle`;
const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));
const PRELOAD_PATH = fileURLToPath(new URL("./preload.cjs", import.meta.url));
// 内部のページに許可する権限 (ファイルの読み書きとローカルフォントの列挙)
const ALLOWED_PERMISSIONS = new Set(["fileSystem", "local-fonts"]);

// 閉じる / 再読み込みの確認の文言は表示言語ではなく OS の言語に合わせる (ページの状態を同期で読めないため)
const UNLOAD_MESSAGES = {
  ja: {
    close: {
      message: "保存されていない変更があります。閉じますか？",
      detail: "閉じても、次回起動時に変更内容を復元します。",
      confirm: "閉じる",
    },
    reload: {
      message: "保存されていない変更があります。再読み込みしますか？",
      detail: "再読み込みしても、変更内容を復元します。",
      confirm: "再読み込み",
    },
    cancel: "キャンセル",
  },
  en: {
    close: {
      message: "You have unsaved changes. Close the app?",
      detail: "Your changes will be restored the next time you start the app.",
      confirm: "Close",
    },
    reload: {
      message: "You have unsaved changes. Reload the app?",
      detail: "Your changes will be restored after reloading.",
      confirm: "Reload",
    },
    cancel: "Cancel",
  },
};

// 再読み込みボタンを押してから、ページが切り替わるか確認が出るまでの webContents
const pendingReloads = new WeakSet();

// 画面側のボタンから呼ぶウィンドウ操作
const WINDOW_ACTIONS = {
  reload(window) {
    pendingReloads.add(window.webContents);
    window.webContents.reload();
  },
  minimize: (window) => window.minimize(),
  toggleMaximize: (window) => (window.isMaximized() ? window.unmaximize() : window.maximize()),
  close: (window) => window.close(),
};

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function isInternalUrl(url) {
  return url === ORIGIN || url.startsWith(`${ORIGIN}/`);
}

// dist の中のファイルだけを返す (.. で外へ出られないようにする)
function serveBundle() {
  const notFound = () => new Response("Not Found", { status: 404 });
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
    const file = resolve(DIST_DIR, `.${relative}`);
    if (!file.startsWith(`${DIST_DIR}${sep}`)) return notFound();
    return net.fetch(pathToFileURL(file).toString()).catch(notFound);
  });
}

function restrictPermissions() {
  const allowed = (permission, origin) => isInternalUrl(origin) && ALLOWED_PERMISSIONS.has(permission);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(allowed(permission, contents.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => allowed(permission, origin));
}

function configureMenu() {
  // Windows と Linux は画面内のメニューだけを使う。macOS は終了やコピーのキー操作に標準メニューが必要
  const template = process.platform === "darwin" ? [{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }] : null;
  Menu.setApplicationMenu(template && Menu.buildFromTemplate(template));
}

// 内部のページからの IPC だけを受け付ける
function senderWindow(event) {
  const url = event.senderFrame?.url;
  return url && isInternalUrl(url) ? BrowserWindow.fromWebContents(event.sender) : null;
}

function handleWindowControls() {
  ipcMain.on("window:action", (event, action) => {
    const window = senderWindow(event);
    if (window && Object.hasOwn(WINDOW_ACTIONS, action)) WINDOW_ACTIONS[action](window);
  });
  ipcMain.handle("window:is-maximized", (event) => senderWindow(event)?.isMaximized() ?? false);
}

function confirmUnload(window, event, kind) {
  const texts = app.getLocale().startsWith("ja") ? UNLOAD_MESSAGES.ja : UNLOAD_MESSAGES.en;
  const text = texts[kind];
  const choice = dialog.showMessageBoxSync(window, {
    type: "question",
    message: text.message,
    detail: text.detail,
    buttons: [text.confirm, texts.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  // preventDefault で beforeunload の引き止めを無視し、そのまま閉じる (再読み込みする)
  if (choice === 0) event.preventDefault();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    // タイトルバーは出さず、画面上部のメニューバーで移動とウィンドウ操作を受け持つ
    frame: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: PRELOAD_PATH },
  });
  const { webContents } = window;
  // Electron は beforeunload のダイアログを出さず、閉じる操作を黙って止めるため自前で確認する
  webContents.on("will-prevent-unload", (event) => {
    confirmUnload(window, event, pendingReloads.delete(webContents) ? "reload" : "close");
  });
  // 引き止められなかった再読み込みの印を残さない (次に閉じるときの文言を誤らないように)。
  // did-start-loading は beforeunload より先に発火するので使えない
  webContents.on("did-navigate", () => pendingReloads.delete(webContents));
  const notifyMaximized = (maximized) => {
    if (!webContents.isDestroyed()) webContents.send("window:maximized", maximized);
  };
  window.on("maximize", () => notifyMaximized(true));
  window.on("unmaximize", () => notifyMaximized(false));
  // 外部リンクは既定のブラウザで開き、アプリの画面は内部のページから移動させない
  webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: "allow" };
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (!isInternalUrl(url)) event.preventDefault();
  });
  void window.loadURL(`${ORIGIN}/`);
  return window;
}

// 同じ保存先を複数のプロセスで使わないよう、2 つ目の起動は既存のウィンドウを前面に出す
if (!app.requestSingleInstanceLock()) app.quit();

app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.whenReady().then(() => {
  serveBundle();
  restrictPermissions();
  configureMenu();
  handleWindowControls();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
