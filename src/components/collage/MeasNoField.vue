// 小節番号ストリップ。マーカー (Repeat/Last/Start/End) と重ならないように
// ルーラーの最上部に独立して表示する。
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect } from "../../lib/draw";
import { doc, clockView as projectClockView } from "../../state/project";

const canvasRef = ref<HTMLCanvasElement | null>(null);

useCanvas(
  canvasRef,
  (ctx, w, h) => {
    const view = projectClockView();
    fillRect(ctx, 0, 0, w, h, COLORS.rulerBg);
    drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: true, numberTop: 0 });
  },
  [() => doc.rev, () => doc.scrollX, () => doc.zoom],
);
</script>

<template>
  <div class="measno">
    <canvas ref="canvasRef" class="field-canvas" />
  </div>
</template>

<style scoped>
.measno {
  height: 12px;
  position: relative;
  border-bottom: 1px solid var(--border);
}
</style>
