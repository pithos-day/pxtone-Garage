// 再生範囲マーカー帯 (repeat / last) + ルーラークリックでのシーク
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText } from "../../lib/draw";
import { clockAtX } from "../../lib/field";
import { clockToX, measOfClock } from "../../lib/clock";
import { doc, getService, clockView as projectClockView, setRepeatMeas, setLastMeas } from "../../state/project";
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
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: true, numberTop: 0 });

  const repeatX = clockToX(view, s.master.repeatMeas * view.beatClock * view.beatNum) - doc.scrollX;
  const lastX = clockToX(view, s.master.lastMeas * view.beatClock * view.beatNum) - doc.scrollX;

  // repeat マーカー
  if (s.master.repeatMeas > 0) {
    fillRect(ctx, repeatX, 2, 2, h - 4, COLORS.repeatMark);
    fillText(ctx, "R", repeatX + 3, 11, COLORS.repeatMark, 9);
  }
  // last マーカー
  if (s.master.lastMeas > 0) {
    fillRect(ctx, lastX, 2, 2, h - 4, COLORS.lastMark);
    fillText(ctx, "L", lastX + 3, 11, COLORS.lastMark, 9);
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

function onPointerDown(e: PointerEvent): void {
  if (e.button === 0) {
    // ルーラークリック = シーク
    const c = canvasRef.value!;
    const r = c.getBoundingClientRect();
    seekToClock(clockAt(e.clientX - r.left));
    return;
  }
  if (e.button === 2) {
    const c = canvasRef.value!;
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const view = projectClockView();
    const clock = doc.scrollX + (x / view.zoom) * view.beatClock;
    const meas = measOfClock(view, clock);
    menu.value = { x: e.clientX, y: e.clientY, meas };
    e.preventDefault();
  }
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
      setLastMeas(m.meas);
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
    <canvas ref="canvasRef" class="field-canvas" @pointerdown="onPointerDown" @contextmenu.prevent />
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
