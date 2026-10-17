// キャンバスフィールド共通のドラッグ編集ジェスチャ。
// pointerdown/move/up + ポインタキャプチャ + 1 ジェスチャ = 1 undo の骨格を共通化し、
// モード固有の処理 (ヒットテスト・イベント書き換え・クリック時のシーク・試聴サステイン) を
// コールバックで注入する (KeyField / VolumeField / PinnedLanes で使用)
import { ref, type Ref } from "vue";
import { useDragUndo } from "./useUndo";
import { capturePointer, fieldOffset, releasePointerCapture } from "../lib/field";

// ドラッグ状態の共通部分。button: 0=左 (書込) / 2=右 (削除)。
// clock1/clock2 はドラッグの始端・終端クロック (px ではなく clockAt の戻り値)
export interface CanvasDragState {
  button: number;
  clock1: number;
  clock2: number;
}

export interface CanvasDragOptions<T extends CanvasDragState> {
  canvasRef: Ref<HTMLCanvasElement | null>;
  // x (CSS px) → グリッドにスナップした clock (フィールド左端の除外幅はここで吸収)
  clockAt(x: number): number;
  // pointerdown: ドラッグを開始する場合に初期状態を返し、それ以外は null を返す
  // (ルーラー帯シーク・鍵盤試聴・インライン入力などはここで完結させる)
  beginDrag(e: PointerEvent, pt: { x: number; y: number }): T | null;
  // ドラッグ中のイベント書き換え (isMove が true を返したときに呼ばれる)
  applyDrag(d: T, pt: { x: number; y: number }, e: PointerEvent): void;
  // applyDrag を実行するかの判定 (省略時は clock が動いたとき)。
  // 縦方向だけの移動で適用するツール (スマートのノート移動) で用いる
  isMove?(d: T, pt: { x: number; y: number }, clock: number): boolean;
  // ドラッグを伴わないクリック時 (undo が積まれていない場合のみ呼ばれる)
  onClick?(d: T, e: PointerEvent): void;
  // pointerup 時の後始末 (試聴サステインの停止など)
  onEnd?(e: PointerEvent): void;
  // true なら pointerdown 時にも undo を積む (押下時に書き込む VolumeField 用)
  undoOnDown?: boolean;
}

export function useCanvasDrag<T extends CanvasDragState>(options: CanvasDragOptions<T>): {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  drag: Ref<T | null>;
} {
  const drag = ref<T | null>(null) as Ref<T | null>;
  const dragUndo = useDragUndo();

  function onPointerDown(e: PointerEvent): void {
    const c = options.canvasRef.value;
    if (!c) return;
    const pt = fieldOffset(c, e);
    const d = options.beginDrag(e, pt);
    if (!d) return;
    if (options.undoOnDown) dragUndo.onFirstMove();
    capturePointer(c, e);
    drag.value = d;
  }

  function onPointerMove(e: PointerEvent): void {
    const d = drag.value;
    if (!d) return;
    const pt = fieldOffset(options.canvasRef.value!, e);
    const clock = options.clockAt(pt.x);
    const moved = options.isMove ? options.isMove(d, pt, clock) : clock !== d.clock2;
    if (!moved) return;
    // 最初の移動時に undo を積む (クリックのみなら積まない)
    if (!options.undoOnDown) dragUndo.onFirstMove();
    d.clock2 = clock;
    options.applyDrag(d, pt, e);
  }

  function onPointerUp(e: PointerEvent): void {
    options.onEnd?.(e);
    releasePointerCapture(options.canvasRef.value, e);
    const d = drag.value;
    drag.value = null;
    if (!d) return;
    if (dragUndo.finish()) return;
    options.onClick?.(d, e);
  }

  return { onPointerDown, onPointerMove, onPointerUp, drag };
}
