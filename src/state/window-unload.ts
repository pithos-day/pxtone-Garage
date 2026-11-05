// スタンドアロン版のウィンドウを閉じる / 再読み込みする前の確認。
// 未保存の変更があれば確認し、退避を終えてから実行する
import { t } from "../i18n";
import { appConfirm } from "./dialog";
import { flushDrafts, hasUnsavedDocuments } from "./drafts";

// 確認中にもう一度操作されても、ダイアログを重ねない
let confirming = false;

async function confirmUnload(controls: WindowControls, message: string): Promise<boolean> {
  if (hasUnsavedDocuments()) {
    controls.reveal();
    if (!(await appConfirm(message))) return false;
  }
  if (await flushDrafts()) return true;
  // 復元できない状態で閉じないよう、失敗を知らせた上で改めて確認する
  controls.reveal();
  return appConfirm(t("confirm.unloadWithoutDraft"));
}

async function run(controls: WindowControls, message: string, proceed: () => void, cancel?: () => void): Promise<void> {
  if (confirming) {
    controls.reveal();
    return;
  }
  confirming = true;
  try {
    if (await confirmUnload(controls, message)) proceed();
    else cancel?.();
  } finally {
    confirming = false;
  }
}

export function requestWindowClose(controls: WindowControls): void {
  void run(
    controls,
    t("confirm.windowClose"),
    () => controls.approveClose(),
    () => controls.cancelClose(),
  );
}

export function requestWindowReload(controls: WindowControls): void {
  void run(controls, t("confirm.windowReload"), () => controls.reload());
}
