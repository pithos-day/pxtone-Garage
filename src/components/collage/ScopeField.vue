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
  // 帯色は半透明のため fieldBg の上に重ねる (canvas 下の --background が透けないように)
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  fillRect(ctx, 0, 0, w, h, COLORS.scopefieldBg);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: false, fillBackground: false });
  if (doc.scope2 > doc.scope1) {
    const x1 = clockToX(view, doc.scope1) - doc.scrollX;
    const x2 = clockToX(view, doc.scope2) - doc.scrollX;
    // 中央と縁で明暗が分かれないよう、帯全体を同じ色で塗る
    drawScopeBand(ctx, x1, x2, 0, h, COLORS.scope);
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
  /* 音階1個分 (KEY_HEIGHT) と同じ高さ */
  height: var(--key-h);
  position: relative;
  border-bottom: 1px solid var(--border);
}
</style>
