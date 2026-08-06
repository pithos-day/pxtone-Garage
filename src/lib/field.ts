// キャンバスフィールド共通のポインタ・ホイールヘルパ
import { snapClock, xToClock, ZOOM_TABLE, type ClockView } from "./clock";

// キャンバス内のマウス座標 (CSS ピクセル)
export function fieldOffset(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// 画面 x 座標 → グリッドにスナップしたクロック。
// offsetX は鍵盤ストリップなどフィールド左端の除外幅
export function clockAtX(view: ClockView, divi: number, scrollX: number, x: number, offsetX = 0): number {
  return snapClock(view, divi, xToClock(view, x - offsetX + scrollX));
}

// Ctrl+ホイールのズーム切替。新しいズーム倍率を返す (Ctrl 以外は null)
export function zoomByWheel(e: WheelEvent, current: number): number | null {
  if (!e.ctrlKey) return null;
  e.preventDefault();
  const table = ZOOM_TABLE as readonly number[];
  const idx = table.indexOf(current);
  const next = e.deltaY < 0 ? Math.min(table.length - 1, idx + 1) : Math.max(0, idx - 1);
  return table[next]!;
}
