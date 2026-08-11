// 選択範囲 (スコープ) 表示帯
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, drawPlayhead, drawScopeBand } from "../../lib/draw";
import { clockToX } from "../../lib/clock";
import { doc, clockContext } from "../../state/project";
import { currentClock, isPlaying as isPlayingNow } from "../../state/player";

const canvasRef = ref<HTMLCanvasElement | null>(null);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [() => doc.rev, () => doc.scrollX, () => doc.zoom, () => doc.scope1, () => doc.scope2, () => currentClock.value],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const view = clockContext();
  fillRect(ctx, 0, 0, w, h, COLORS.rulerBg);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: false });
  if (doc.scope2 > doc.scope1) {
    const x1 = clockToX(view, doc.scope1) - doc.scrollX;
    const x2 = clockToX(view, doc.scope2) - doc.scrollX;
    drawScopeBand(ctx, x1, x2, 1, h - 2, COLORS.scope);
    fillRect(ctx, x1, 0, 1, h, COLORS.scopeBorder);
    fillRect(ctx, x2, 0, 1, h, COLORS.scopeBorder);
  }
  // プレイヘッド (再生バー)
  if (isPlayingNow.value) {
    drawPlayhead(ctx, clockToX(view, currentClock.value) - doc.scrollX, w, h);
  }
}
</script>

<template>
  <div class="scopefield">
    <canvas ref="canvasRef" class="field-canvas" />
  </div>
</template>

<style scoped>
.scopefield {
  height: 10px;
  position: relative;
  border-bottom: 1px solid var(--border);
}
</style>
