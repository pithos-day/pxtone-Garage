// Canvas 描画ヘルパ (グリッド・ノート・プレイヘッドなど)
import { COLORS } from "./theme";
import { getUnitColor } from "./theme";
import { canvasFontStack } from "../state/fonts";
import { clockToX, gridLineWidth } from "./clock";
import type { ClockView } from "./clock";

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
    ctx.lineWidth = gridLineWidth(view.zoom);
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, top);
    ctx.lineTo(x0 + 0.5, bottom);
    ctx.stroke();
    if (showNumber) {
      const ny = numberTop ?? top;
      fillRect(ctx, x0, ny, 30, 11, COLORS.measureBox);
      ctx.fillStyle = COLORS.measureText;
      ctx.font = `9px ${canvasFontStack()}`;
      ctx.textBaseline = "middle";
      ctx.fillText(String(m + 1), x0 + 2, ny + 5.5);
    }
    for (let b = 1; b < view.beatNum; b++) {
      const bx = x0 + b * view.zoom;
      ctx.strokeStyle = COLORS.beatLine;
      ctx.lineWidth = gridLineWidth(view.zoom);
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

// マーカータグの文字サイズ (タグの高さから決まる)
export function markerTagFontSize(h: number): number {
  return Math.max(8, h - 4);
}

// マーカータグ用フォント (ラベルは太字)
function markerFont(size: number): string {
  return `bold ${size}px ${canvasFontStack()}`;
}

// タグの文字領域の幅。全ラベルで幅を揃えるため、最も広いラベルを基準にする
// (短いラベルは中央揃えで余白が広がる)
export function markerTagContentW(ctx: CanvasRenderingContext2D, size: number, labels: string[]): number {
  ctx.font = markerFont(size);
  return Math.ceil(Math.max(...labels.map((l) => ctx.measureText(l).width)));
}

// マーカータグ (横向き五角形 + ラベル文字)。anchorX 側が平らな端 (マーカー位置)、
// 先端は dir 方向 (範囲の内側) を向く。
// 例: 範囲の開始 (|START▶) は dir="right"、終了 (◀END|) は dir="left"
// contentW を渡すと文字領域の幅を固定し、文字はその中央に描画する (全ラベルで幅を統一)
export function drawMarkerTag(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  centerY: number,
  h: number,
  dir: "right" | "left",
  text: string,
  fill: string,
  textColor: string,
  contentW = 0,
): void {
  const size = markerTagFontSize(h);
  const tip = Math.round(h / 2);
  const padX = 4;
  ctx.font = markerFont(size);
  const textW = Math.max(Math.ceil(ctx.measureText(text).width), contentW);
  const w = tip + padX * 2 + textW;
  const s = dir === "right" ? 1 : -1;
  // 五角形: 平らな端 (anchorX) → 上辺 → 先端 → 下辺
  ctx.beginPath();
  ctx.moveTo(anchorX, centerY - h / 2);
  ctx.lineTo(anchorX + s * (w - tip), centerY - h / 2);
  ctx.lineTo(anchorX + s * w, centerY);
  ctx.lineTo(anchorX + s * (w - tip), centerY + h / 2);
  ctx.lineTo(anchorX, centerY + h / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, anchorX + s * (padX + textW / 2), centerY);
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
