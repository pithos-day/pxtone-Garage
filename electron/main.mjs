// スタンドアロン版 (Electron) のメインプロセス。
// ビルド済みの dist を独自プロトコルで配信する。file:// では Worklet の読み込みや fetch が
// 制限され、IndexedDB の保存先となる origin も安定しないため使わない
import { app, BrowserWindow, dialog, Menu, net, protocol, session, shell } from "electron";
import { sep, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEME = "app";
const ORIGIN = `${SCHEME}://bundle`;
const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));
// 内部のページに許可する権限 (ファイルの読み書きとローカルフォントの列挙)
const ALLOWED_PERMISSIONS = new Set(["fileSystem", "local-fonts"]);

// 閉じる確認の文言は表示言語ではなく OS の言語に合わせる (ページの状態を同期で読めないため)
const CLOSE_MESSAGES = {
  ja: {
    message: "保存されていない変更があります。閉じますか？",
    detail: "閉じても、次回起動時に変更内容を復元します。",
    close: "閉じる",
    cancel: "キャンセル",
  },
  en: {
    message: "You have unsaved changes. Close the app?",
    detail: "Your changes will be restored the next time you start the app.",
    close: "Close",
    cancel: "Cancel",
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

function confirmClose(window, event) {
  const text = app.getLocale().startsWith("ja") ? CLOSE_MESSAGES.ja : CLOSE_MESSAGES.en;
  const choice = dialog.showMessageBoxSync(window, {
    type: "question",
    message: text.message,
    detail: text.detail,
    buttons: [text.close, text.cancel],
    defaultId: 1,
    cancelId: 1,
  });
  // preventDefault で beforeunload の引き止めを無視し、そのまま閉じる
  if (choice === 0) event.preventDefault();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const { webContents } = window;
  // Electron は beforeunload のダイアログを出さず、閉じる操作を黙って止めるため自前で確認する
  webContents.on("will-prevent-unload", (event) => confirmClose(window, event));
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
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
