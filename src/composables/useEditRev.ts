// 編集リビジョン (rev/touch) の定型。
// undo/redo (メニュー) 後の再描画駆動もまとめて行う
import { ref, type Ref } from "vue";
import { useUndoRedoRedraw, type UndoAware } from "./useUndoRedoRedraw";

export function useEditRev(
  doc: () => UndoAware | null | undefined,
  touchExtra?: () => void,
  onUndoRedo?: () => void,
): { rev: Ref<number>; touch: () => void } {
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
