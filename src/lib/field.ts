// キャンバスフィールド共通のポインタ・ホイールヘルパ
import { snapClock, xToClock, ZOOM_TABLE, type ClockView } from "./clock";

// キャンバス内のマウス座標 (CSS ピクセル)
export function fieldOffset(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// 画面 x 座標 → グリッドにスナップしたクロック。
// offsetX は鍵盤ストリップなどフィールド左端の除外幅。
// フィールド左端より外 (ポインタキャプチャで負の x) は 0 にクランプする
// (本家 if_Cursor.cpp の if (*p_clock1 < 0) *p_clock1 = 0; 相当。
//  負のクロックへイベントを書けないため、書込系はすべてここで止める)
export function clockAtX(view: ClockView, divi: number, scrollX: number, x: number, offsetX = 0): number {
  return Math.max(0, snapClock(view, divi, xToClock(view, x - offsetX + scrollX)));
}

// Ctrl+ホイールのズーム切替。新しいズーム倍率を返す (Ctrl 以外は null)
// ZOOM_TABLE に現在値がない場合は最小ズームへ落とす
export function zoomByWheel(e: WheelEvent, current: number): number | null {
  if (!e.ctrlKey) return null;
  e.preventDefault();
  const idx = ZOOM_TABLE.indexOf(current as (typeof ZOOM_TABLE)[number]);
  const base = idx < 0 ? 0 : idx;
  const next = e.deltaY < 0 ? Math.min(ZOOM_TABLE.length - 1, base + 1) : Math.max(0, base - 1);
  return ZOOM_TABLE[next]!;
}

// Shift+ホイールの横スクロール量 (px)。Shift 以外は null
const WHEEL_PAN_STEP = 48;
export function wheelPanX(e: WheelEvent): number | null {
  if (!e.shiftKey) return null;
  return e.deltaY > 0 ? WHEEL_PAN_STEP : -WHEEL_PAN_STEP;
}

// Ctrl+ホイールのズーム / Shift+ホイールの横スクロールをまとめて判定。
// どちらでもなければ { zoom: null, pan: null } (呼び出し側で通常スクロールへ)
// 適用先 (doc.zoom / doc.scrollX) は state 層に依存するため呼び出し側で行う
export function zoomOrPan(e: WheelEvent, current: number): { zoom: number | null; pan: number | null } {
  const zoom = zoomByWheel(e, current);
  if (zoom !== null) return { zoom, pan: null };
  return { zoom: null, pan: wheelPanX(e) };
}

// ---- ポインタキャプチャ ----

export function capturePointer(el: { setPointerCapture(pointerId: number): void } | null | undefined, e: PointerEvent): void {
  el?.setPointerCapture(e.pointerId);
}

export function hasPointerCapture(el: { hasPointerCapture(pointerId: number): boolean } | null | undefined, e: PointerEvent): boolean {
  return !!el?.hasPointerCapture(e.pointerId);
}

export function releasePointerCapture(el: { hasPointerCapture(pointerId: number): boolean; releasePointerCapture(pointerId: number): void } | null | undefined, e: PointerEvent): void {
  if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
}
