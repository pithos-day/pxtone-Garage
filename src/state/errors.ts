// 予期しないエラーの処理。ユーザーへ通知し、未保存の編集を退避する。
// 同じエラーが描画ループなどで繰り返されてもダイアログを積み続けないよう、
// メッセージごとに 1 回だけ通知する
import type { App } from "vue";
import { flushDrafts } from "./drafts";
import { appAlert } from "./dialog";
import { t } from "../i18n";

const notified = new Set<string>();

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

// 実害がなく、通知すべきでないもの
function isIgnorable(err: unknown): boolean {
  // ファイルピッカーのキャンセルなど
  if ((err as { name?: unknown } | null)?.name === "AbortError") return true;
  // ブラウザが window の error として報告する、描画に影響しない警告
  return errorMessage(err).startsWith("ResizeObserver loop");
}

export function reportUnexpectedError(err: unknown): void {
  if (isIgnorable(err)) return;
  console.error(err);
  // 退避自体の失敗は drafts 側で通知する。状態が壊れて同期で投げる場合もここで止める
  try {
    void flushDrafts();
  } catch (flushErr) {
    console.error(flushErr);
  }
  const message = errorMessage(err);
  if (notified.has(message)) return;
  notified.add(message);
  void appAlert(t("error.unexpected").replace("{message}", message));
}

export function installErrorHandlers(app: App): void {
  app.config.errorHandler = (err) => reportUnexpectedError(err);
  window.addEventListener("error", (e) => reportUnexpectedError(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportUnexpectedError(e.reason));
}
