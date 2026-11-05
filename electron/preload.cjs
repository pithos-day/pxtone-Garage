// スタンドアロン版のウィンドウ操作を画面側へ公開する。
// sandbox 有効のプリロードは ES Modules を読めないため CommonJS で書く
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("windowControls", {
  reload: () => ipcRenderer.send("window:action", "reload"),
  minimize: () => ipcRenderer.send("window:action", "minimize"),
  toggleMaximize: () => ipcRenderer.send("window:action", "toggleMaximize"),
  close: () => ipcRenderer.send("window:action", "close"),
  reveal: () => ipcRenderer.send("window:action", "reveal"),
  approveClose: () => ipcRenderer.send("window:action", "approveClose"),
  cancelClose: () => ipcRenderer.send("window:action", "cancelClose"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  // 閉じる要求を受け取る。応答 (ack) で画面が固まっていないことをメインプロセスへ伝える。
  // 解除用の関数を返す
  onCloseRequest: (callback) => {
    const listener = () => {
      ipcRenderer.send("window:close-ack");
      callback();
    };
    ipcRenderer.on("window:close-requested", listener);
    ipcRenderer.send("window:close-ready");
    return () => ipcRenderer.removeListener("window:close-requested", listener);
  },
  // 解除用の関数を返す
  onMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
});
