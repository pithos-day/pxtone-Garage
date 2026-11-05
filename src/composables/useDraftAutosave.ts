// 未保存ドラフトの自動退避 (編集の監視による遅延保存と、ページを離れるときの保存)
import { onBeforeUnmount, watch, type Ref } from "vue";
import type { AppMode } from "../lib/modes";
import { cancelDraftSave, hasUnsavedDocuments, saveDraftsNow, scheduleDraftSave } from "../state/drafts";
import { noiseRevision } from "../state/noise";
import { doc } from "../state/project";
import { projects } from "../state/projects";
import { voiceRevision } from "../state/voice";

const SAFETY_SAVE_INTERVAL_MS = 30000;

export function useDraftAutosave(activeTab: Ref<AppMode>): void {
  // 編集 (doc.rev / dirty / voice・noise の revision) を監視して遅延保存する
  watch(
    [
      () => doc.rev,
      () => doc.dirty,
      () => projects.value.map((p) => `${p.id}:${p.dirty}`).join("|"),
      voiceRevision,
      noiseRevision,
    ],
    () => scheduleDraftSave(activeTab.value),
  );
  watch(activeTab, () => scheduleDraftSave(activeTab.value));

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (!hasUnsavedDocuments()) return;
    // ここで書き込みを始めておくことで、確認ダイアログで「離れる」を選んでも復元できる
    void saveDraftsNow(activeTab.value);
    e.preventDefault();
    e.returnValue = "";
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") void saveDraftsNow(activeTab.value);
  }

  window.addEventListener("beforeunload", onBeforeUnload);
  document.addEventListener("visibilitychange", onVisibilityChange);
  // 編集を検知できない経路 (直接のデータ変更など) の保険
  const safetySaveTimer = window.setInterval(() => {
    if (hasUnsavedDocuments()) void saveDraftsNow(activeTab.value);
  }, SAFETY_SAVE_INTERVAL_MS);
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.clearInterval(safetySaveTimer);
    cancelDraftSave();
  });
}
