// 選択範囲 (スコープ) 表示帯
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect } from "../../lib/draw";
import { clockToX } from "../../lib/clock";
import { doc, clockView as projectClockView } from "../../state/project";

const canvasRef = ref<HTMLCanvasElement | null>(null);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [() => doc.rev, () => doc.scrollX, () => doc.zoom, () => doc.scope1, () => doc.scope2],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const view = projectClockView();
  fillRect(ctx, 0, 0, w, h, COLORS.rulerBg);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: false });
  if (doc.scope2 > doc.scope1) {
    const x1 = clockToX(view, doc.scope1) - doc.scrollX;
    const x2 = clockToX(view, doc.scope2) - doc.scrollX;
    fillRect(ctx, x1, 1, Math.max(0, x2 - x1), h - 2, COLORS.scope);
    fillRect(ctx, x1, 0, 1, h, COLORS.scopeBorder);
    fillRect(ctx, x2, 0, 1, h, COLORS.scopeBorder);
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
