// スタンドアロン版のウィンドウ操作を画面側へ公開する。
// sandbox 有効のプリロードは ES Modules を読めないため CommonJS で書く
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("windowControls", {
  reload: () => ipcRenderer.send("window:action", "reload"),
  minimize: () => ipcRenderer.send("window:action", "minimize"),
  toggleMaximize: () => ipcRenderer.send("window:action", "toggleMaximize"),
  close: () => ipcRenderer.send("window:action", "close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  // 解除用の関数を返す
  onMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
});
