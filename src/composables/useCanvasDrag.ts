// キャンバスフィールド共通のドラッグ編集ジェスチャ。
// pointerdown/move/up + ポインタキャプチャ + 1 ジェスチャ = 1 undo の骨格を共通化し、
// モード固有の処理 (ヒットテスト・イベント書き換え・クリック時のシーク・試聴サステイン) を
// コールバックで注入する (KeyField / VolumeField / PinnedLanes で使用)
import { ref, type Ref } from "vue";
import { useDragUndo } from "./useUndo";
import { capturePointer, fieldOffset, releasePointerCapture } from "../lib/field";

// ドラッグ状態の共通部分。button: 0=左 (書込) / 2=右 (削除)
export interface CanvasDragState {
  button: number;
  x1: number;
  x2: number;
}

export interface CanvasDragHooks<T extends CanvasDragState> {
  canvasRef: Ref<HTMLCanvasElement | null>;
  // x (CSS px) → グリッドにスナップした clock (フィールド左端の除外幅はここで吸収)
  clockAt(x: number): number;
  // pointerdown: ドラッグを開始する場合に初期状態を返し、それ以外は null を返す
  // (ルーラー帯シーク・鍵盤試聴・インライン入力などはここで完結させる)
  beginDrag(e: PointerEvent, pt: { x: number; y: number }): T | null;
  // ドラッグ中のイベント書き換え (x2 が変わったときのみ呼ばれる)
  applyDrag(d: T, pt: { x: number; y: number }, e: PointerEvent): void;
  // ドラッグを伴わないクリック時 (undo が積まれていない場合のみ呼ばれる)
  onClick?(d: T, e: PointerEvent): void;
  // pointerup 時の後始末 (試聴サステインの停止など)
  onEnd?(e: PointerEvent): void;
  // true なら pointerdown 時にも undo を積む (押下時に書き込む VolumeField 用)
  undoOnDown?: boolean;
}

export function useCanvasDrag<T extends CanvasDragState>(hooks: CanvasDragHooks<T>): {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
} {
  const drag = ref<T | null>(null);
  const dragUndo = useDragUndo();

  function onPointerDown(e: PointerEvent): void {
    const c = hooks.canvasRef.value;
    if (!c) return;
    const pt = fieldOffset(c, e);
    const d = hooks.beginDrag(e, pt);
    if (!d) return;
    if (hooks.undoOnDown) dragUndo.onFirstMove();
    capturePointer(c, e);
    drag.value = d;
  }

  function onPointerMove(e: PointerEvent): void {
    const d = drag.value;
    if (!d) return;
    const pt = fieldOffset(hooks.canvasRef.value!, e);
    const clock = hooks.clockAt(pt.x);
    if (clock === d.x2) return;
    // 最初の移動時に undo を積む (クリックのみなら積まない)
    if (!hooks.undoOnDown) dragUndo.onFirstMove();
    d.x2 = clock;
    hooks.applyDrag(d, pt, e);
  }

  function onPointerUp(e: PointerEvent): void {
    hooks.onEnd?.(e);
    releasePointerCapture(hooks.canvasRef.value, e);
    const d = drag.value;
    drag.value = null;
    if (!d) return;
    if (dragUndo.finish()) return;
    hooks.onClick?.(d, e);
  }

  return { onPointerDown, onPointerMove, onPointerUp };
}
