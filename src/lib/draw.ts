// Canvas 描画ヘルパ (グリッド・ノート・プレイヘッドなど)
import { COLORS } from "./theme";
import { getUnitColor } from "./theme";
import { canvasFontStack } from "../state/fonts";
import type { ClockView } from "./clock";
import { clockToX } from "./clock";

export function fillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// 小節グリッド (背景・小節線・拍線・小節番号)
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  opts: {
    w: number;
    h: number;
    scrollX: number;
    view: ClockView;
    top?: number;
    bottom?: number;
    showNumber?: boolean;
    numberTop?: number;
    fillBackground?: boolean; // false なら線のみ (行色の上に再描画する場合)
  },
): void {
  const { w, h, scrollX, view, top = 0, bottom = h, showNumber, numberTop, fillBackground = true } = opts;
  // 1小節の幅 (px) = 拍数 × 1拍の幅
  const measW = view.beatNum * view.zoom;
  const measNum = view.measNum ?? Number.POSITIVE_INFINITY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, bottom - top);
  ctx.clip();

  // 背景
  if (fillBackground) fillRect(ctx, 0, top, w, bottom - top, COLORS.fieldBg);

  // 小節線・拍線 (scrollX は px。曲の小節数まで描画)
  const startMeas = Math.max(0, Math.floor(scrollX / measW) - 1);
  const endMeas = Math.min(measNum - 1, Math.ceil((scrollX + w) / measW) + 1);
  for (let m = startMeas; m <= endMeas; m++) {
    const measClock = m * view.beatClock * view.beatNum;
    const x0 = clockToX(view, measClock) - scrollX;
    ctx.strokeStyle = COLORS.measureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, top);
    ctx.lineTo(x0 + 0.5, bottom);
    ctx.stroke();
    if (showNumber) {
      const ny = numberTop ?? top;
      fillRect(ctx, x0, ny, 26, 10, COLORS.measureBox);
      ctx.fillStyle = COLORS.measureText;
      ctx.font = `8px ${canvasFontStack()}`;
      ctx.textBaseline = "middle";
      ctx.fillText(String(m + 1), x0 + 2, ny + 5);
    }
    for (let b = 1; b < view.beatNum; b++) {
      const bx = x0 + b * view.zoom;
      ctx.strokeStyle = COLORS.beatLine;
      ctx.beginPath();
      ctx.moveTo(bx + 0.5, top);
      ctx.lineTo(bx + 0.5, bottom);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ノートの色 (ユニット色 × ベロシティ/音量)
export function noteFill(unitNo: number, playing: boolean, vel: number, vol: number): string {
  return getUnitColor(unitNo).note(playing, vel, vol);
}

export function noteShadow(unitNo: number, playing: boolean, vel: number, vol: number): string {
  return getUnitColor(unitNo).shadow(playing, vel, vol);
}

// 再生位置の縦線 (幅 2px)。x がフィールド幅 w の範囲外なら描画しない
export function drawPlayhead(ctx: CanvasRenderingContext2D, x: number, w: number, h: number): void {
  if (x >= 0 && x <= w) fillRect(ctx, x - 1, 0, 2, h, COLORS.playhead);
}

// 選択範囲 (スコープ) 帯。x1..x2 はフィールド座標 (px)。空幅は 0 にクランプして描画
export function drawScopeBand(ctx: CanvasRenderingContext2D, x1: number, x2: number, top: number, h: number, color: string): void {
  fillRect(ctx, x1, top, Math.max(0, x2 - x1), h, color);
}

// Play アイコン (三角形 ▶) を描画。本家 ptCollage の Velocity 表示 (rcNote) 相当
export function fillPlayIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 6);
  ctx.lineTo(x - 3, y + 6);
  ctx.lineTo(x + 4, y);
  ctx.closePath();
  ctx.fill();
}

// ドラッグ範囲の両端に縦線を描画する (範囲選択中の可視化)
export function drawDragRange(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  top: number,
  bottom: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of [x1, x2]) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  ctx.stroke();
}

export function fillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string = COLORS.text,
  size = 11,
  align: CanvasTextAlign = "left",
  baseline: CanvasTextBaseline = "alphabetic",
): void {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${canvasFontStack()}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}
