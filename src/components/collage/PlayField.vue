// ルーラーマーカー帯。小節番号は MeasNoField (別ストリップ) が表示する。
// マーカーは横向き五角形のタグ (REPEAT/LAST/START/END) で表示する。
// タグの幅は全ラベルで統一し、文字は太字で中央揃えに描画する。
// 上段 = Repeat/Last、下段 = Start/End (編集用再生範囲) に分離し、
// 重なりを防ぐ。右クリックメニューは上段で Repeat/Last、下段で Start/End を操作。
// 左クリック = シーク、左ドラッグ = 押した位置を Start、離した位置を End に設定。
// Start/End は線で繋ぎ、ドラッグ中は設定される Start/End を白黒タグでプレビューする。
<script setup lang="ts">
import { ref } from "vue";
import { ArrowLeftToLine, ArrowRightToLine, Flag, Repeat, SquareX } from "@lucide/vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, drawMarkerTag, drawPlayhead, markerTagContentW, markerTagFontSize } from "../../lib/draw";
import { clockAtX, capturePointer, releasePointerCapture } from "../../lib/field";
import { clockToX, measOfClock, xToClock, measStartClock } from "../../lib/clock";
import {
  doc,
  getService,
  clockContext,
  setRepeatMeas,
  setLastMeas,
  setPlayStart,
  setPlayEnd,
  setPlayRange,
  normalizePlayRange,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
import { t } from "../../i18n";
import CtxMenuItem from "../shell/CtxMenuItem.vue";

const canvasRef = ref<HTMLCanvasElement | null>(null);
// zone: "repeat" = 上段 (Repeat/Last), "range" = 下段 (Start/End)
const menu = ref<{ x: number; y: number; meas: number; zone: "repeat" | "range" } | null>(null);
// 左ドラッグ (Start/End 設定)。x0/y0 = 押下位置、x/y = 現在位置 (すべて canvas 座標 px)
const drag = ref<{ x0: number; y0: number; x: number; y: number; moved: boolean } | null>(null);
// タグの幅を揃えるための全ラベル (最も広いラベルが基準幅になる)
const MARKER_LABELS = ["REPEAT", "LAST", "START", "END"];

useCtxMenuClose(menu);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [
    () => doc.rev,
    () => doc.scrollX,
    () => doc.zoom,
    () => currentClock.value,
    () => drag.value?.x ?? -1, // ドラッグ中プレビューの再描画
    () => drag.value?.moved ?? false,
  ],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = clockContext();
  // 帯色は半透明のため fieldBg の上に重ねる (canvas 下の --background が透けないように)
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  fillRect(ctx, 0, 0, w, h, COLORS.playfieldBg);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: false, fillBackground: false });

  const band = h / 2; // 上段 = Repeat/Last、下段 = Start/End
  const tagH = band - 2; // タグ (横向き五角形) の高さ
  // タグの幅は全ラベルで統一する (最も広い REPEAT に合わせ、文字は中央揃え)
  const tagTextW = markerTagContentW(ctx, markerTagFontSize(tagH), MARKER_LABELS);
  const topY = band / 2; // 上段のタグ中心
  const bottomY = band + band / 2; // 下段のタグ中心
  const lastX = clockToX(view, measStartClock(view, s.master.lastMeas)) - doc.scrollX;
  const startX = doc.playStart >= 0 ? clockToX(view, measStartClock(view, doc.playStart)) - doc.scrollX : 0;
  const endX = doc.playEnd > 0 ? clockToX(view, measStartClock(view, doc.playEnd)) - doc.scrollX : 0;

  // Start/End を線で繋ぐ (両方設定時)
  if (doc.playStart >= 0 && doc.playEnd > 0) {
    fillRect(ctx, startX, bottomY - 1, endX - startX, 2, COLORS.marker);
  }

  // 上段: Repeat / Last (境界線側が平らな端、先端は範囲の内側を向く)
  if (doc.repeatMeas > 0) {
    // Repeat は 1-based (エンジン/ファイルは 0-based) なので (repeatMeas - 1) 小節目の開始位置に描画
    const repeatX = clockToX(view, measStartClock(view, doc.repeatMeas - 1)) - doc.scrollX;
    drawMarkerTag(ctx, repeatX, topY, tagH, "right", "REPEAT", COLORS.marker, COLORS.markerText, tagTextW);
  }
  if (s.master.lastMeas > 0) {
    drawMarkerTag(ctx, lastX, topY, tagH, "left", "LAST", COLORS.marker, COLORS.markerText, tagTextW);
  }

  // 下段: Start / End (編集用再生範囲)
  if (doc.playStart >= 0) {
    drawMarkerTag(ctx, startX, bottomY, tagH, "right", "START", COLORS.marker, COLORS.markerText, tagTextW);
  }
  if (doc.playEnd > 0) {
    drawMarkerTag(ctx, endX, bottomY, tagH, "left", "END", COLORS.marker, COLORS.markerText, tagTextW);
  }

  // ドラッグ中のプレビュー (離したときに設定される Start/End を白黒タグで表示)
  const d = drag.value;
  if (d?.moved) {
    const { start, end } = dragRange(d.x0, d.x);
    const sx = clockToX(view, measStartClock(view, start)) - doc.scrollX;
    const ex = clockToX(view, measStartClock(view, end)) - doc.scrollX;
    fillRect(ctx, sx, bottomY - 1, ex - sx, 2, COLORS.markerPreview);
    drawMarkerTag(ctx, sx, bottomY, tagH, "right", "START", COLORS.markerPreview, COLORS.markerPreviewText, tagTextW);
    drawMarkerTag(ctx, ex, bottomY, tagH, "left", "END", COLORS.markerPreview, COLORS.markerPreviewText, tagTextW);
  }

  // プレイヘッド (上下段を貫通)
  if (isPlayingNow.value) {
    drawPlayhead(ctx, clockToX(view, currentClock.value) - doc.scrollX, w, h);
  }
}

function clockAt(x: number): number {
  return clockAtX(clockContext(), doc.divi, doc.scrollX, x);
}

// ---- ポインタ操作 ----

// カーソル位置 (canvas 座標 px) を最寄りの小節境界 (小節番号) にスナップする
// (本家準拠: 小節の前半 = その小節の開始、後半 = 次の小節の開始)
function boundaryAt(x: number): number {
  const view = clockContext();
  const clock = xToClock(view, doc.scrollX + x);
  const measW = view.beatNum * view.beatClock;
  const fMeas = clock / measW;
  const meas = Math.floor(fMeas);
  return fMeas - meas < 0.5 ? meas : meas + 1;
}

// ドラッグ範囲 (押下位置 x0 → 現在位置 x1) から設定される Start/End (小節) を求める。
// プレビューと確定で共用し、逆方向のドラッグや同値 (1小節未満) も同じ結果に正規化する
function dragRange(x0: number, x1: number): { start: number; end: number } {
  const measNum = getService()?.master.measNum ?? 1;
  return normalizePlayRange(boundaryAt(x0), boundaryAt(x1), measNum);
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  const r = c.getBoundingClientRect();
  if (e.button === 0) {
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    drag.value = { x0: x, y0: y, x, y, moved: false };
    capturePointer(c, e);
    return;
  }
  if (e.button === 2) {
    // 読み取り専用タブではコンテキストメニューを出さない
    if (doc.readOnly) return;
    const x = e.clientX - r.left;
    const view = clockContext();
    const clock = xToClock(view, doc.scrollX + x);
    const meas = measOfClock(view, clock);
    // 上段 (Repeat/Last) か下段 (Start/End) か
    const y = e.clientY - r.top;
    menu.value = { x: e.clientX, y: e.clientY, meas, zone: y < r.height / 2 ? "repeat" : "range" };
    e.preventDefault();
  }
}

function onPointerMove(e: PointerEvent): void {
  const d = drag.value;
  if (!d) return;
  const c = canvasRef.value;
  if (!c) return;
  const r = c.getBoundingClientRect();
  d.x = e.clientX - r.left;
  d.y = e.clientY - r.top;
  if (Math.abs(d.x - d.x0) > 4 || Math.abs(d.y - d.y0) > 4) d.moved = true;
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  releasePointerCapture(c, e);
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  if (!d.moved) {
    // クリック = シーク
    seekToClock(clockAt(d.x0));
    return;
  }
  // ドラッグ = Start/End をまとめて設定 (押した位置が Start、離した位置が End)。
  // 離した位置は onPointerMove が保持している最新の canvas 座標を使う (プレビューと同じ値)
  const { start, end } = dragRange(d.x0, d.x);
  setPlayRange(start, end);
}

function onMenuAction(action: "setRepeat" | "setLast" | "clearRepeat" | "clearLast" | "setStart" | "setEnd" | "clearStart" | "clearEnd"): void {
  const m = menu.value;
  menu.value = null;
  if (!m) return;
  switch (action) {
    case "setRepeat":
      // Repeat は 1-based で保持 (エンジン/ファイルは 0-based)
      setRepeatMeas(m.meas + 1);
      break;
    case "setLast":
      // 本家準拠: last は「最後の小節番号」(終端境界 = (meas+1) 小節目の開始)
      setLastMeas(m.meas + 1);
      break;
    case "clearRepeat":
      setRepeatMeas(0);
      break;
    case "clearLast":
      setLastMeas(0);
      break;
    case "setStart":
      setPlayStart(m.meas);
      break;
    case "setEnd":
      setPlayEnd(m.meas + 1);
      break;
    case "clearStart":
      setPlayStart(-1);
      break;
    case "clearEnd":
      setPlayEnd(-1);
      break;
  }
}
</script>

<template>
  <div class="playfield">
    <canvas
      ref="canvasRef"
      class="field-canvas playfield-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @contextmenu.prevent
    />
    <div v-if="menu" class="ctxmenu popup" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <template v-if="menu.zone === 'repeat'">
        <CtxMenuItem :icon="Repeat" @click="onMenuAction('setRepeat')">{{ t("playfield.setRepeat") }}</CtxMenuItem>
        <CtxMenuItem :icon="Flag" @click="onMenuAction('setLast')">{{ t("playfield.setLast") }}</CtxMenuItem>
        <div class="sep" />
        <CtxMenuItem :icon="SquareX" @click="onMenuAction('clearRepeat')">{{ t("playfield.clearRepeat") }}</CtxMenuItem>
        <CtxMenuItem :icon="SquareX" @click="onMenuAction('clearLast')">{{ t("playfield.clearLast") }}</CtxMenuItem>
      </template>
      <template v-else>
        <CtxMenuItem :icon="ArrowLeftToLine" @click="onMenuAction('setStart')">{{ t("playfield.setStart") }}</CtxMenuItem>
        <CtxMenuItem :icon="ArrowRightToLine" @click="onMenuAction('setEnd')">{{ t("playfield.setEnd") }}</CtxMenuItem>
        <div class="sep" />
        <CtxMenuItem :icon="SquareX" @click="onMenuAction('clearStart')">{{ t("playfield.clearStart") }}</CtxMenuItem>
        <CtxMenuItem :icon="SquareX" @click="onMenuAction('clearEnd')">{{ t("playfield.clearEnd") }}</CtxMenuItem>
      </template>
    </div>
  </div>
</template>

<style scoped>
.playfield {
  height: 36px;
  position: relative;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.playfield-canvas {
  /* 上段/下段で右クリックメニューを分けるため、描画は canvas 内で行う */
}
</style>
