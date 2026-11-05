// スタンドアロン版 (Electron) のメインプロセス。
// ビルド済みの dist を独自プロトコルで配信する。file:// では Worklet の読み込みや fetch が
// 制限され、IndexedDB の保存先となる origin も安定しないため使わない
import { app, BrowserWindow, dialog, ipcMain, Menu, net, powerMonitor, protocol, session, shell } from "electron";
import { sep, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEME = "app";
const ORIGIN = `${SCHEME}://bundle`;
const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));
const PRELOAD_PATH = fileURLToPath(new URL("./preload.cjs", import.meta.url));
// 内部のページに許可する権限 (ファイルの読み書きとローカルフォントの列挙)
const ALLOWED_PERMISSIONS = new Set(["fileSystem", "local-fonts"]);

// 閉じる要求に画面が応答するまでの猶予。過ぎたら固まっているとみなしてネイティブのダイアログを出す
const CLOSE_ACK_TIMEOUT_MS = 3000;

// 画面が固まったときの確認の文言。ページから表示言語を読めないので OS の言語に合わせる
const FORCE_CLOSE_MESSAGES = {
  ja: {
    message: "アプリが応答していません。強制的に閉じますか？",
    detail: "最後に自動で退避した後の変更は失われる可能性があります。",
    close: "閉じる",
    cancel: "キャンセル",
  },
  en: {
    message: "The app is not responding. Force it to close?",
    detail: "Changes made after the last automatic backup may be lost.",
    close: "Close",
    cancel: "Cancel",
  },
};

// 画面側で確認が済み、そのまま閉じてよいウィンドウ
const closeApproved = new WeakSet();
// 閉じる要求を受け取れる状態のページ (読み込み中やクラッシュ後は含まない)
const closeRequestReady = new WeakSet();
const closeAckTimers = new WeakMap();
// OS のシャットダウン中は確認を待つと終了を妨げるので、そのまま閉じる
let systemEnding = false;
// macOS は全ウィンドウを閉じてもアプリが残るので、終了操作だったかを覚えておく
let quitRequested = false;

// 画面側のボタンから呼ぶウィンドウ操作
const WINDOW_ACTIONS = {
  reload: (window) => window.webContents.reload(),
  minimize: (window) => window.minimize(),
  toggleMaximize: (window) => (window.isMaximized() ? window.unmaximize() : window.maximize()),
  close: (window) => window.close(),
  // 確認ダイアログが見えるよう前面に出す
  reveal: revealWindow,
  approveClose(window) {
    closeApproved.add(window);
    window.close();
  },
  cancelClose() {
    quitRequested = false;
  },
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
  ipcMain.on("window:close-ready", (event) => {
    if (senderWindow(event)) closeRequestReady.add(event.sender);
  });
  ipcMain.on("window:close-ack", (event) => {
    const window = senderWindow(event);
    if (window) clearTimeout(closeAckTimers.get(window));
  });
}

function revealWindow(window) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

// 画面が応答しないときだけ使う。画面側の確認を経ずに閉じるので beforeunload も待たない
function confirmForceClose(window) {
  if (window.isDestroyed()) return;
  const text = app.getLocale().startsWith("ja") ? FORCE_CLOSE_MESSAGES.ja : FORCE_CLOSE_MESSAGES.en;
  const choice = dialog.showMessageBoxSync(window, {
    type: "warning",
    message: text.message,
    detail: text.detail,
    buttons: [text.close, text.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  if (choice === 0) window.destroy();
  else quitRequested = false;
}

// 閉じる操作 (ボタン / Alt+F4 / タスクバー / 終了操作) はすべて close イベントに集まる。
// いったん止めて画面側へ確認を任せ、承認されたら approveClose でもう一度閉じる
function guardClose(window) {
  const { webContents } = window;
  window.on("close", (event) => {
    if (systemEnding || closeApproved.has(window) || !closeRequestReady.has(webContents)) return;
    event.preventDefault();
    clearTimeout(closeAckTimers.get(window));
    closeAckTimers.set(window, setTimeout(() => confirmForceClose(window), CLOSE_ACK_TIMEOUT_MS));
    webContents.send("window:close-requested");
  });
  window.on("closed", () => clearTimeout(closeAckTimers.get(window)));
  // 確認は画面側で済んでいるので、ページの beforeunload の引き止めは無視する
  webContents.on("will-prevent-unload", (event) => event.preventDefault());
  webContents.on("did-navigate", () => closeRequestReady.delete(webContents));
  webContents.on("render-process-gone", () => closeRequestReady.delete(webContents));
  // Windows のシャットダウン。macOS と Linux は powerMonitor の shutdown で受ける
  window.on("session-end", () => {
    systemEnding = true;
  });
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
  guardClose(window);
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
  revealWindow(window);
});

app.on("before-quit", () => {
  quitRequested = true;
});

app.whenReady().then(() => {
  serveBundle();
  restrictPermissions();
  configureMenu();
  handleWindowControls();
  powerMonitor.on("shutdown", () => {
    systemEnding = true;
    app.quit();
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || quitRequested) app.quit();
});
