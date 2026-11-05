// 未保存のタブを閉じるフロー (タブの X / メニューの「閉じる」「全て閉じる」と 3 択ダイアログ)
import { ref, type Ref } from "vue";
import type { AppMode } from "../lib/modes";
import { t } from "../i18n";
import { appAlert } from "../state/dialog";
import { saveDraftsNow } from "../state/drafts";
import { MODE_DOCS, type ModeTab } from "../state/mode-docs";

// 未保存のタブを閉じる際の確認ダイアログ
interface CloseRequest {
  mode: AppMode;
  id: number;
  name: string;
  canSave: boolean;
}

export function useTabCloseFlow(activeTab: Ref<AppMode>) {
  const closeRequest = ref<CloseRequest | null>(null);
  const closeBusy = ref(false);
  // 「全て閉じる」で未保存確認を待っている残りのタブ (先頭から順に処理する)
  let pendingCloseAll: { mode: AppMode; ids: number[] } | null = null;

  function closeNow(mode: AppMode, id: number): void {
    MODE_DOCS[mode].close(id);
    closeRequest.value = null;
    // 閉じたタブを退避データからも消す (次回起動時に復活させない)
    void saveDraftsNow(activeTab.value);
  }

  function findTab(mode: AppMode, id: number): ModeTab | undefined {
    return MODE_DOCS[mode].tabs().find((tab) => tab.id === id);
  }

  // 非アクティブタブの「保存」は現在のタブを保存してしまうため、対象へ切り替えてから確認する
  function askUnsaved(mode: AppMode, tab: ModeTab): void {
    MODE_DOCS[mode].switchTo(tab.id);
    closeRequest.value = { mode, id: tab.id, name: tab.title, canSave: !tab.readonly };
  }

  // タブの X / メニューの「閉じる」から呼ばれる。未保存なら 3 択ダイアログを出す
  function requestClose(mode: AppMode, id: number): void {
    pendingCloseAll = null;
    const tab = findTab(mode, id);
    if (!tab) return;
    if (tab.dirty) askUnsaved(mode, tab);
    else closeNow(mode, id);
  }

  // メニューの「全て閉じる」から呼ばれる。未保存のタブだけ順番に 3 択ダイアログを出し、
  // 全て解決したらまとめて閉じる (途中でキャンセルされたら何も閉じない)
  function requestCloseAll(mode: AppMode): void {
    const ids = MODE_DOCS[mode].tabs().map((tab) => tab.id);
    if (ids.length === 0) return;
    pendingCloseAll = { mode, ids };
    advanceCloseAll();
  }

  // 次の未保存タブを確認する。無くなったら実際に閉じる
  function advanceCloseAll(): void {
    const job = pendingCloseAll;
    if (!job) return;
    while (job.ids.length > 0) {
      const tab = findTab(job.mode, job.ids.shift()!);
      if (!tab?.dirty) continue;
      askUnsaved(job.mode, tab);
      return;
    }
    pendingCloseAll = null;
    closeAllNow(job.mode);
  }

  function closeAllNow(mode: AppMode): void {
    // Collage は最低 1 タブ必要なため、閉じた後に空プロジェクトを開き直す (closeAllProjects)
    MODE_DOCS[mode].closeAll();
    closeRequest.value = null;
    // 閉じたタブを退避データからも消す (次回起動時に復活させない)
    void saveDraftsNow(activeTab.value);
  }

  // 未保存確認の結果を反映する。全て閉じるの途中なら次のタブへ進む
  function finishClose(req: CloseRequest): void {
    if (pendingCloseAll) {
      closeRequest.value = null;
      advanceCloseAll();
      return;
    }
    closeNow(req.mode, req.id);
  }

  async function onUnsavedSave(): Promise<void> {
    const req = closeRequest.value;
    if (!req || closeBusy.value) return;
    closeBusy.value = true;
    let saved = false;
    try {
      saved = await MODE_DOCS[req.mode].save();
    } catch {
      void appAlert(t("error.save"));
    } finally {
      closeBusy.value = false;
    }
    // 保存ダイアログをキャンセルした場合はダイアログを開いたままにする
    if (saved) finishClose(req);
  }

  function onUnsavedDiscard(): void {
    const req = closeRequest.value;
    if (req) finishClose(req);
  }

  // ダイアログのキャンセル。「全て閉じる」は途中から再開せず全体を中止する
  function onUnsavedCancel(): void {
    closeRequest.value = null;
    pendingCloseAll = null;
  }

  return { closeRequest, closeBusy, requestClose, requestCloseAll, onUnsavedSave, onUnsavedDiscard, onUnsavedCancel };
}
