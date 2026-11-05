// トレイの行の並べ替えドラッグ。ドラッグ中のポインタ位置へ行を逐次移動する
// (undo はドラッグ全体で 1 エントリ)。ファイルのドロップ (HTML5 DnD) と競合しないようポインタで処理する
import { ref, type Ref } from "vue";
import { useDragUndo } from "./useUndo";
import { createRowDragGhost } from "../lib/drag-ghost";
import { doc, sync } from "../state/project";

export function useRowReorder(options: {
  rowSelector: string; // 行の高さの計測に使う要素
  count: () => number;
  move: (from: number, to: number) => void; // undo を積まない生操作
}): {
  draggingRow: Ref<number>; // 掴んでいる行の現在位置 (表示中のみ。それ以外は -1)
  startDragReorder: (list: HTMLElement, idx: number, down: PointerEvent) => void;
} {
  const draggingRow = ref(-1);

  function startDragReorder(list: HTMLElement, idx: number, down: PointerEvent): void {
    let lastTarget = idx;
    const dragUndo = useDragUndo();
    const ghost = createRowDragGhost(down.currentTarget as HTMLElement, down);
    const onMove = (ev: PointerEvent): void => {
      const started = ghost.move(ev);
      const h = list.querySelector<HTMLElement>(options.rowSelector)?.offsetHeight ?? 24;
      const row = Math.floor((list.scrollTop + ev.clientY - list.getBoundingClientRect().top) / h);
      if (row >= 0 && row < options.count() && row !== lastTarget) {
        dragUndo.onFirstMove();
        options.move(lastTarget, row);
        lastTarget = row;
        sync();
        doc.rev++;
      }
      if (started) draggingRow.value = lastTarget;
    };
    const onUp = (): void => {
      draggingRow.value = -1;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      ghost.remove();
      dragUndo.finish();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return { draggingRow, startDragReorder };
}
