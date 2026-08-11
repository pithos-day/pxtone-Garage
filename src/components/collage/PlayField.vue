// ルーラーマーカー帯。小節番号は MeasNoField (別ストリップ) が表示する。
// 上段 = Repeat/Last、下段 = Start/End (編集用再生範囲) に分離し、
// 重なりを防ぐ。右クリックメニューは上段で Repeat/Last、下段で Start/End を操作。
// 左クリック = シーク、左ドラッグ (下段) = Start/End の設定。
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText, drawPlayhead } from "../../lib/draw";
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
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
import { t } from "../../i18n";

const canvasRef = ref<HTMLCanvasElement | null>(null);
// zone: "repeat" = 上段 (Repeat/Last), "range" = 下段 (Start/End)
const menu = ref<{ x: number; y: number; meas: number; zone: "repeat" | "range" } | null>(null);

useCtxMenuClose(menu);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [() => doc.rev, () => doc.scrollX, () => doc.zoom, () => currentClock.value],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = clockContext();
  fillRect(ctx, 0, 0, w, h, COLORS.rulerBg);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: false });

  const band = h / 2; // 上段 = Repeat/Last、下段 = Start/End
  const lastX = clockToX(view, measStartClock(view, s.master.lastMeas)) - doc.scrollX;

  // 上段: Repeat / Last
  if (doc.repeatMeas > 0) {
    // Repeat は 1-based (エンジン/ファイルは 0-based) なので (repeatMeas - 1) 小節目の開始位置に描画
    const repeatX = clockToX(view, measStartClock(view, doc.repeatMeas - 1)) - doc.scrollX;
    fillRect(ctx, repeatX, 2, 2, band - 4, COLORS.repeatMark);
    fillText(ctx, "R", repeatX + 3, band - 4, COLORS.repeatMark, 9);
  }
  if (s.master.lastMeas > 0) {
    fillRect(ctx, lastX, 2, 2, band - 4, COLORS.lastMark);
    fillText(ctx, "L", lastX - 3, band - 4, COLORS.lastMark, 9, "right");
  }

  // 下段: Start / End (編集用再生範囲)
  if (doc.playStart >= 0) {
    const sx = clockToX(view, measStartClock(view, doc.playStart)) - doc.scrollX;
    fillRect(ctx, sx, band + 2, 2, h - band - 4, COLORS.playhead);
    fillText(ctx, "S", sx + 3, h - 6, COLORS.playhead, 9);
  }
  if (doc.playEnd > 0) {
    const ex = clockToX(view, measStartClock(view, doc.playEnd)) - doc.scrollX;
    fillRect(ctx, ex, band + 2, 2, h - band - 4, COLORS.playhead);
    fillText(ctx, "E", ex - 3, h - 6, COLORS.playhead, 9, "right");
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
const drag = ref<{ x0: number; y0: number; moved: boolean } | null>(null);

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  const r = c.getBoundingClientRect();
  if (e.button === 0) {
    drag.value = { x0: e.clientX, y0: e.clientY, moved: false };
    capturePointer(c, e);
    return;
  }
  if (e.button === 2) {
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
  if (Math.abs(e.clientX - d.x0) > 4 || Math.abs(e.clientY - d.y0) > 4) d.moved = true;
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  releasePointerCapture(c, e);
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  const r = c!.getBoundingClientRect();
  if (!d.moved) {
    // クリック = シーク
    seekToClock(clockAt(d.x0 - r.left));
    return;
  }
  // ドラッグ = Start/End 設定 (本家準拠: 小節の前半=Start、後半=End)
  const view = clockContext();
  const x = d.x0 - r.left;
  const clock = xToClock(view, doc.scrollX + x);
  const measW = view.beatNum * view.beatClock;
  const fMeas = clock / measW;
  const meas = Math.floor(fMeas);
  if (fMeas - meas < 0.5) setPlayStart(meas);
  else setPlayEnd(meas + 1);
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
    <div v-if="menu" class="ctxmenu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <template v-if="menu.zone === 'repeat'">
        <button @click="onMenuAction('setRepeat')">{{ t("playfield.setRepeat") }}</button>
        <button @click="onMenuAction('setLast')">{{ t("playfield.setLast") }}</button>
        <div class="sep" />
        <button @click="onMenuAction('clearRepeat')">{{ t("playfield.clearRepeat") }}</button>
        <button @click="onMenuAction('clearLast')">{{ t("playfield.clearLast") }}</button>
      </template>
      <template v-else>
        <button @click="onMenuAction('setStart')">{{ t("playfield.setStart") }}</button>
        <button @click="onMenuAction('setEnd')">{{ t("playfield.setEnd") }}</button>
        <div class="sep" />
        <button @click="onMenuAction('clearStart')">{{ t("playfield.clearStart") }}</button>
        <button @click="onMenuAction('clearEnd')">{{ t("playfield.clearEnd") }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.playfield {
  height: 32px;
  position: relative;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.playfield-canvas {
  /* 上段/下段で右クリックメニューを分けるため、描画は canvas 内で行う */
}
</style>
