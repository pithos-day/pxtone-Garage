// 再生範囲マーカー帯 (repeat / last / start / end) + ルーラークリックでのシーク。
// 左クリック = シーク、左ドラッグ = 編集用再生範囲 (Start/End) の設定 (本家準拠:
// 小節の前半=Start、後半=End、同値の再設定で解除)。
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText } from "../../lib/draw";
import { clockAtX } from "../../lib/field";
import { clockToX, measOfClock } from "../../lib/clock";
import {
  doc,
  getService,
  clockView as projectClockView,
  setRepeatMeas,
  setLastMeas,
  setPlayStart,
  setPlayEnd,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
import { t } from "../../i18n";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const menu = ref<{ x: number; y: number; meas: number } | null>(null);

useCtxMenuClose(menu);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [() => doc.rev, () => doc.scrollX, () => doc.zoom, () => currentClock.value],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = projectClockView();
  fillRect(ctx, 0, 0, w, h, COLORS.rulerBg);

  // マーカー位置の小節番号ボックスはスキップ (重なり防止)
  const skip: number[] = [];
  if (s.master.repeatMeas > 0) skip.push(s.master.repeatMeas);
  if (s.master.lastMeas > 0) skip.push(s.master.lastMeas);
  if (doc.playStart >= 0) skip.push(doc.playStart);
  if (doc.playEnd > 0) skip.push(doc.playEnd);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: true, numberTop: 0, skipNumberMeas: skip });

  const repeatX = clockToX(view, s.master.repeatMeas * view.beatClock * view.beatNum) - doc.scrollX;
  const lastX = clockToX(view, s.master.lastMeas * view.beatClock * view.beatNum) - doc.scrollX;

  // repeat マーカー (開始地点・右向き)
  if (s.master.repeatMeas > 0) {
    fillRect(ctx, repeatX, 2, 2, h - 4, COLORS.repeatMark);
    fillText(ctx, "R", repeatX + 3, 11, COLORS.repeatMark, 9);
  }
  // last マーカー (終端・ラベルは左側)
  if (s.master.lastMeas > 0) {
    fillRect(ctx, lastX, 2, 2, h - 4, COLORS.lastMark);
    fillText(ctx, "L", lastX - 3, 11, COLORS.lastMark, 9, "right");
  }
  // start / end マーカー (編集用再生範囲)
  if (doc.playStart >= 0) {
    const sx = clockToX(view, doc.playStart * view.beatClock * view.beatNum) - doc.scrollX;
    fillRect(ctx, sx, 2, 2, h - 4, COLORS.playhead);
    fillText(ctx, "S", sx + 3, 11, COLORS.playhead, 9);
  }
  if (doc.playEnd > 0) {
    const ex = clockToX(view, doc.playEnd * view.beatClock * view.beatNum) - doc.scrollX;
    fillRect(ctx, ex, 2, 2, h - 4, COLORS.playhead);
    fillText(ctx, "E", ex - 3, 11, COLORS.playhead, 9, "right");
  }

  // プレイヘッド
  if (isPlayingNow.value) {
    const px = clockToX(view, currentClock.value) - doc.scrollX;
    if (px >= 0 && px <= w) {
      fillRect(ctx, px - 1, 0, 2, h, COLORS.playhead);
    }
  }
}

function clockAt(x: number): number {
  return clockAtX(projectClockView(), doc.divi, doc.scrollX, x);
}

// ---- 左クリック = シーク / 左ドラッグ = Start/End 設定 ----
const drag = ref<{ x0: number; y0: number; moved: boolean } | null>(null);

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  if (e.button === 0) {
    drag.value = { x0: e.clientX, y0: e.clientY, moved: false };
    c.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button === 2) {
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const view = projectClockView();
    const clock = doc.scrollX + (x / view.zoom) * view.beatClock;
    const meas = measOfClock(view, clock);
    menu.value = { x: e.clientX, y: e.clientY, meas };
    e.preventDefault();
  }
}

function onPointerMove(e: PointerEvent): void {
  const d = drag.value;
  if (!d) return;
  if (Math.abs(e.clientX - d.x0) > 4 || Math.abs(e.clientY - d.y0) > 4) d.moved = true;
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  if (c && c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  if (!d.moved) {
    // クリック = シーク
    const r = c!.getBoundingClientRect();
    seekToClock(clockAt(d.x0 - r.left));
    return;
  }
  // ドラッグ = Start/End 設定 (本家準拠: 小節の前半=Start、後半=End)
  const r = c!.getBoundingClientRect();
  const view = projectClockView();
  const x = d.x0 - r.left;
  const clock = doc.scrollX + (x / view.zoom) * view.beatClock;
  const measW = view.beatNum * view.beatClock;
  const fMeas = clock / measW;
  const meas = Math.floor(fMeas);
  if (fMeas - meas < 0.5) setPlayStart(meas);
  else setPlayEnd(meas + 1);
}

function onMenuAction(action: "setRepeat" | "setLast" | "cutRepeat" | "cutLast"): void {
  const m = menu.value;
  menu.value = null;
  if (!m) return;
  switch (action) {
    case "setRepeat":
      setRepeatMeas(m.meas);
      break;
    case "setLast":
      // 本家準拠: last は「最後の小節番号」(終端境界 = (meas+1) 小節目の開始)
      setLastMeas(m.meas + 1);
      break;
    case "cutRepeat":
      setRepeatMeas(0);
      break;
    case "cutLast":
      setLastMeas(0);
      break;
  }
}
</script>

<template>
  <div class="playfield">
    <canvas
      ref="canvasRef"
      class="field-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @contextmenu.prevent
    />
    <div v-if="menu" class="ctxmenu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <button @click="onMenuAction('setRepeat')">{{ t("playfield.setRepeat") }}</button>
      <button @click="onMenuAction('setLast')">{{ t("playfield.setLast") }}</button>
      <div class="sep" />
      <button @click="onMenuAction('cutRepeat')">{{ t("playfield.clearRepeat") }}</button>
      <button @click="onMenuAction('cutLast')">{{ t("playfield.clearLast") }}</button>
    </div>
  </div>
</template>

<style scoped>
.playfield {
  height: 16px;
  position: relative;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
</style>
