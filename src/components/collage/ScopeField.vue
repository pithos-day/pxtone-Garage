// 選択範囲 (スコープ) 表示帯。左ドラッグで範囲選択、左クリックでシーク (選択は維持)。
// 押下位置と現在位置をグリッド (divi) にスナップし、[scope1, scope2) を更新する
// (逆方向のドラッグは setScope が小さい方を scope1 にする)
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, drawPlayhead, drawScopeBand } from "../../lib/draw";
import { clockToX } from "../../lib/clock";
import { capturePointer, clockAtX, fieldOffset, releasePointerCapture } from "../../lib/field";
import { doc, clockContext, setScope } from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";

const canvasRef = ref<HTMLCanvasElement | null>(null);
// 左ドラッグの範囲選択状態 (clock1 = 押下位置、clock2 = 現在位置。どちらもスナップ済み)
let drag: { clock1: number; clock2: number; moved: boolean } | null = null;

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

// 画面 x (canvas 座標 px) → グリッドにスナップしたクロック
function clockAt(x: number): number {
  return clockAtX(clockContext(), doc.divi, doc.scrollX, x);
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c || e.button !== 0) return;
  const clock = clockAt(fieldOffset(c, e).x);
  drag = { clock1: clock, clock2: clock, moved: false };
  capturePointer(c, e);
}

function onPointerMove(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!drag || !c) return;
  const clock = clockAt(fieldOffset(c, e).x);
  // スナップ位置が変わったときだけ更新する (連続する pointermove での再描画を抑える)
  if (clock === drag.clock2) return;
  drag.clock2 = clock;
  drag.moved = true;
  setScope(drag.clock1, clock);
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  releasePointerCapture(c, e);
  const d = drag;
  drag = null;
  if (!d || d.moved) return;
  // ドラッグなしのクリック = シーク (選択範囲は変えない。他のフィールドと同じ)
  seekToClock(d.clock1);
}
</script>

<template>
  <div class="scopefield">
    <canvas
      ref="canvasRef"
      class="field-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @contextmenu.prevent
    />
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
