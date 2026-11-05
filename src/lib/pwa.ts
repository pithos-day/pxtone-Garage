export function shouldRegisterServiceWorker(protocol: string, hasServiceWorker: boolean, isProduction: boolean): boolean {
  // スタンドアロン版 (app:) は本体を同梱しているので Service Worker を使わない
  return isProduction && hasServiceWorker && (protocol === "https:" || protocol === "http:");
}
