// undo/redo (メニュー操作) 後の再描画を駆動する composable。
// undo スタックの長さ変化を監視して fn を呼ぶ (doc 自体は markRaw で
// リアクティブ追跡されないため、スタック長が変化の目印になる)
import { watch } from "vue";

export function useUndoRedoRedraw(
  doc: () => { undoStack: unknown[]; redoStack: unknown[] } | null | undefined,
  fn: () => void,
): void {
  watch(
    () => [doc()?.undoStack.length, doc()?.redoStack.length],
    () => fn(),
  );
}
