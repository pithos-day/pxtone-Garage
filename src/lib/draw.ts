// Canvas 描画ヘルパ (グリッド・ノート・プレイヘッドなど)
import { COLORS } from "./theme";
import { getUnitColor } from "./theme";
import type { ClockView } from "./clock";
import { clockToX, measOfClock, clockToMeasBeatClock } from "./clock";

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
  },
): void {
  const { w, h, scrollX, view } = opts;
  const top = opts.top ?? 0;
  const bottom = opts.bottom ?? h;
  // meas width is derived from view

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, bottom - top);
  ctx.clip();

  // 背景
  fillRect(ctx, 0, top, w, bottom - top, COLORS.fieldBg);

  // 小節線・拍線
  const startMeas = Math.floor(scrollX / (view.beatClock * view.beatNum)) - 1;
  const endMeas = Math.ceil((scrollX + w) / (view.beatClock * view.beatNum)) + 1;
  for (let m = startMeas; m <= endMeas; m++) {
    const measClock = m * view.beatClock * view.beatNum;
    const x0 = clockToX(view, measClock) - scrollX;
    ctx.strokeStyle = COLORS.measureLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, top);
    ctx.lineTo(x0 + 0.5, bottom);
    ctx.stroke();
    if (opts.showNumber) {
      const ny = opts.numberTop ?? top;
      fillRect(ctx, x0, ny, 26, 10, COLORS.measureBox);
      ctx.fillStyle = "#c8ffc8";
      ctx.font = "8px sans-serif";
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

// プレイヘッド (現在位置)
export function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
): void {
  fillRect(ctx, x - 1, top, 2, bottom - top, COLORS.playhead);
  ctx.fillStyle = COLORS.playhead;
  ctx.beginPath();
  ctx.moveTo(x - 2, top);
  ctx.lineTo(x + 2, top);
  ctx.lineTo(x, top + 4);
  ctx.closePath();
  ctx.fill();
}

// ノートの色 (ユニット色 × ベロシティ/音量)
export function noteFill(unitNo: number, playing: boolean, vel: number, vol: number): string {
  return getUnitColor(unitNo).note(playing, vel, vol);
}

export function noteShadow(unitNo: number, playing: boolean, vel: number, vol: number): string {
  return getUnitColor(unitNo).shadow(playing, vel, vol);
}

// クロック位置のラベル (小節:拍:クロック)
export function clockLabel(view: ClockView, clock: number): string {
  const [m, b, c] = clockToMeasBeatClock(view, clock);
  return `${m + 1}:${b + 1}:${c}`;
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
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

export { measOfClock };
