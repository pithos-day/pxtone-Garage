<script setup lang="ts">
// レイヤーのエンベロープグラフ。x は区間長 (ms) で、表示は累積座標。
// 左ドラッグ = 点の移動 / 空き領域クリック = 点の追加 / 右クリック = 点の削除
// (操作は Voice のエンベロープと揃える)。点数は NOISE_ENVE_NUM まで、最低 1 点。
import { ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { capturePointer, fieldOffset, releasePointerCapture } from "../../lib/field";
import { COLORS } from "../../lib/theme";
import { fillRect } from "../../lib/draw";
import { nearestPoint } from "../../lib/voice-geometry";
import {
  noiseEnveCumulative,
  noiseEnveDelete,
  noiseEnveInsert,
  noiseEnveMove,
  noiseEnveViewMax,
  type NoiseEnvePoint,
} from "../../lib/noise";

const props = defineProps<{ enves: NoiseEnvePoint[]; maxPoints: number; rev: number }>();
const emit = defineEmits<{
  (e: "begin"): void;
  (e: "update", enves: NoiseEnvePoint[]): void;
}>();

const PAD = 6;
const POINT_R = 3.5;
const canvasRef = ref<HTMLCanvasElement | null>(null);

// ドラッグ中は表示範囲を固定する (動かした点の位置でスケールが変わらないように)
const dragView = ref<{ index: number; maxX: number; moved: boolean } | null>(null);

function viewMax(): number {
  return dragView.value?.maxX ?? noiseEnveViewMax(props.enves);
}

function xToPx(x: number, w: number, maxX: number): number {
  return PAD + (x / maxX) * (w - PAD * 2);
}
function yToPx(y: number, h: number): number {
  return h - PAD - (y / 100) * (h - PAD * 2);
}
function pxToX(px: number, w: number, maxX: number): number {
  return ((px - PAD) / (w - PAD * 2)) * maxX;
}
function pxToY(py: number, h: number): number {
  return ((h - PAD - py) / (h - PAD * 2)) * 100;
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  const cum = noiseEnveCumulative(props.enves);
  const maxX = viewMax();
  // エンジンは振幅 0 から始まり、最後の点の値を保持する
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xToPx(0, w, maxX), yToPx(0, h));
  props.enves.forEach((p, i) => ctx.lineTo(xToPx(cum[i]!, w, maxX), yToPx(p.y, h)));
  const last = props.enves[props.enves.length - 1];
  if (last) ctx.lineTo(w - PAD, yToPx(last.y, h));
  ctx.stroke();
  ctx.fillStyle = COLORS.textBright;
  props.enves.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xToPx(cum[i]!, w, maxX), yToPx(p.y, h), POINT_R, 0, Math.PI * 2);
    ctx.fill();
  });
}

useCanvas(canvasRef, draw, [() => props.rev, () => props.enves]);

function hitIndex(px: number, py: number, w: number, h: number): number {
  const cum = noiseEnveCumulative(props.enves);
  const maxX = viewMax();
  return nearestPoint(
    props.enves.map((p, i) => ({ x: xToPx(cum[i]!, w, maxX), y: yToPx(p.y, h) })),
    px,
    py,
  );
}

function onPointerDown(e: PointerEvent): void {
  const el = canvasRef.value;
  if (!el) return;
  const { x, y } = fieldOffset(el, e);
  const w = el.clientWidth;
  const h = el.clientHeight;
  const hit = hitIndex(x, y, w, h);
  if (e.button === 2) {
    if (hit < 0) return;
    const next = noiseEnveDelete(props.enves, hit);
    if (!next) return;
    emit("begin");
    emit("update", next);
    return;
  }
  if (e.button !== 0) return;
  if (hit >= 0) {
    dragView.value = { index: hit, maxX: viewMax(), moved: false };
    capturePointer(el, e);
    return;
  }
  const next = noiseEnveInsert(props.enves, pxToX(x, w, viewMax()), pxToY(y, h), props.maxPoints);
  if (!next) return;
  emit("begin");
  emit("update", next);
}

function onPointerMove(e: PointerEvent): void {
  const d = dragView.value;
  const el = canvasRef.value;
  if (!d || !el) return;
  const { x, y } = fieldOffset(el, e);
  if (!d.moved) {
    d.moved = true;
    emit("begin");
  }
  emit("update", noiseEnveMove(props.enves, d.index, pxToX(x, el.clientWidth, d.maxX), pxToY(y, el.clientHeight)));
}

function onPointerUp(e: PointerEvent): void {
  releasePointerCapture(canvasRef.value, e);
  dragView.value = null;
}

// undo などで点数が減ったら、消えた点のドラッグを続けない
watch(
  () => props.enves.length,
  (n) => {
    if (dragView.value && dragView.value.index >= n) dragView.value = null;
  },
);
</script>

<template>
  <canvas
    ref="canvasRef"
    class="field-canvas noise-enve-graph"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @contextmenu.prevent
  />
</template>

<style scoped>
.noise-enve-graph {
  /* 枠の余った高さを埋める (canvas の内部解像度に高さを引きずられないよう基準は固定) */
  flex: 1 1 48px;
  height: 48px;
  min-height: 48px;
  border-radius: calc(var(--radius) - 2px);
  cursor: crosshair;
}
</style>
