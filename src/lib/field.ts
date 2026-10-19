// キャンバスフィールド共通のポインタ・ホイールヘルパ
import { clampZoom, snapClock, xToClock, type ClockView } from "./clock";

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

// Ctrl+ホイールの連続ズーム。新しいズーム倍率を返す (Ctrl 以外は null)
// deltaMode (0=px / 1=行 / 2=ページ) を px に正規化し、指数スケールで変化させる。
// トラックパッドのピンチは小さな deltaY が連続して届くため、指数スケールだと自然に追従する
export function zoomByWheel(e: WheelEvent, current: number): number | null {
  if (!e.ctrlKey) return null;
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const delta = e.deltaY * unit;
  if (delta === 0) return clampZoom(current);
  return clampZoom(current * Math.exp(-delta * 0.002));
}

// ポインタ位置のクロックを保つ scrollX。
// x はフィールド内のポインタ x (CSS px)、offsetX は鍵盤ストリップなど
// 時間軸より左にある領域の幅。そちらを指しているときは左端基準にする。
export function zoomAnchorScrollX(
  currentZoom: number,
  nextZoom: number,
  scrollX: number,
  x: number,
  offsetX = 0,
): number {
  const anchor = Math.max(0, x - offsetX);
  return Math.max(0, (scrollX + anchor) * (nextZoom / currentZoom) - anchor);
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
