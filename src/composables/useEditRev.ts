// 編集リビジョン (rev/touch) の定型。
// undo/redo (メニュー) 後の再描画駆動もまとめて行う
import { ref } from "vue";
import { useUndoRedoRedraw } from "./useUndoRedoRedraw";

export function useEditRev(
  doc: () => { undoStack: unknown[]; redoStack: unknown[] } | null | undefined,
  touchExtra?: () => void,
  onUndoRedo?: () => void,
): { rev: import("vue").Ref<number>; touch: () => void } {
  const rev = ref(0);
  function touch(): void {
    rev.value++;
    touchExtra?.();
  }
  // メニュー経由の編集 (undo/redo) でも再描画されるようにする
  useUndoRedoRedraw(doc, () => {
    touch();
    onUndoRedo?.();
  });
  return { rev, touch };
}
