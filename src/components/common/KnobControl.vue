<script setup lang="ts">
// 回転ノブ + 数値入力。ダイアルは上下ドラッグ (Shift で微調整) と矢印キーで操作し、
// 細かい値は下の数値欄で入力する。begin は編集の直前に 1 ジェスチャ 1 回だけ発火する
import { computed, ref } from "vue";
import { KNOB_SWEEP, knobAngle, knobArcPath, knobNorm, knobValue } from "../../lib/knob";

const props = withDefaults(
  defineProps<{ modelValue: number; min: number; max: number; label: string; center?: number; log?: boolean }>(),
  { center: undefined, log: false },
);
const emit = defineEmits<{ (e: "update:modelValue", v: number): void; (e: "begin"): void }>();

// フルスケールに必要なドラッグ量 (px)
const DRAG_RANGE_PX = 150;
const FINE_FACTOR = 0.1;
const KEY_STEP_NORM = 0.01;
const KEY_PAGE_NORM = 0.1;

const CX = 24;
const CY = 24;
const RING_R = 20;
const BG_ARC = knobArcPath(-KNOB_SWEEP, KNOB_SWEEP, CX, CY, RING_R);

const norm = computed(() => knobNorm(props.modelValue, props.min, props.max, props.log));
const angle = computed(() => knobAngle(norm.value));
const valueArc = computed(() => {
  const base = knobNorm(props.center ?? props.min, props.min, props.max, props.log);
  return knobArcPath(knobAngle(base), angle.value, CX, CY, RING_R);
});
const pointer = computed(() => {
  const s = Math.sin(angle.value);
  const c = Math.cos(angle.value);
  return { x1: CX + 6 * s, y1: CY - 6 * c, x2: CX + 11 * s, y2: CY - 11 * c };
});

// ---- ドラッグ ----
const drag = ref<{ startY: number; startNorm: number; moved: boolean } | null>(null);

function setNorm(n: number): void {
  const v = knobValue(n, props.min, props.max, props.log);
  if (v !== props.modelValue) emit("update:modelValue", v);
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  drag.value = { startY: e.clientY, startNorm: norm.value, moved: false };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  const d = drag.value;
  if (!d) return;
  const dy = d.startY - e.clientY;
  if (dy === 0 && !d.moved) return;
  if (!d.moved) {
    d.moved = true;
    emit("begin");
  }
  const scale = e.shiftKey ? FINE_FACTOR : 1;
  setNorm(d.startNorm + (dy / DRAG_RANGE_PX) * scale);
}

function onPointerUp(e: PointerEvent): void {
  drag.value = null;
  const el = e.currentTarget as HTMLElement;
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
}

// ---- キーボード ----
// 整数 1 刻みより細かい範囲でも値が動くよう、正規化位置の刻みと 1 刻みの大きい方を使う
function stepBy(direction: number, stepNorm: number): void {
  const next = knobValue(norm.value + direction * stepNorm, props.min, props.max, props.log);
  const v = next === props.modelValue ? props.modelValue + direction : next;
  const clamped = Math.max(props.min, Math.min(props.max, v));
  if (clamped !== props.modelValue) emit("update:modelValue", clamped);
}

function onKeydown(e: KeyboardEvent): void {
  let dir = 0;
  let step = KEY_STEP_NORM;
  if (e.key === "ArrowUp" || e.key === "ArrowRight") dir = 1;
  else if (e.key === "ArrowDown" || e.key === "ArrowLeft") dir = -1;
  else if (e.key === "PageUp") [dir, step] = [1, KEY_PAGE_NORM];
  else if (e.key === "PageDown") [dir, step] = [-1, KEY_PAGE_NORM];
  else return;
  e.preventDefault();
  e.stopPropagation();
  if (!e.repeat) emit("begin");
  stepBy(dir, step);
}

function onNumberChange(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(v)) emit("update:modelValue", v);
}
</script>

<template>
  <div class="knob">
    <!-- ダイアルの undo は begin で管理するため、親のフォーカス時 undo へは伝えない -->
    <div
      class="knob-dial"
      role="slider"
      tabindex="0"
      :aria-label="label"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="modelValue"
      @focusin.stop
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path class="knob-bg" :d="BG_ARC" />
        <path class="knob-value" :d="valueArc" />
        <circle class="knob-cap" :cx="CX" :cy="CY" r="13" />
        <line class="knob-pointer" :x1="pointer.x1" :y1="pointer.y1" :x2="pointer.x2" :y2="pointer.y2" />
      </svg>
    </div>
    <span class="knob-label">{{ label }}</span>
    <input
      class="knob-num"
      type="number"
      :min="min"
      :max="max"
      :value="modelValue"
      :aria-label="label"
      @change="onNumberChange"
    />
  </div>
</template>

<style scoped>
.knob {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 0;
}

.knob-dial {
  width: 44px;
  height: 44px;
  cursor: ns-resize;
  touch-action: none;
  border-radius: 50%;
}

.knob-dial:focus-visible {
  outline: 2px solid var(--ring);
}

.knob-dial svg {
  display: block;
  width: 100%;
  height: 100%;
}

.knob-bg,
.knob-value {
  fill: none;
  stroke-width: 4;
  stroke-linecap: round;
}

.knob-bg {
  stroke: var(--secondary);
}

.knob-value {
  stroke: var(--primary);
}

.knob-cap {
  fill: var(--secondary);
}

.knob-pointer {
  stroke: var(--secondary-foreground);
  stroke-width: 2;
  stroke-linecap: round;
}

.knob-label {
  font-size: var(--text-2xs);
  color: var(--foreground);
  white-space: nowrap;
}

.knob-num {
  width: 100%;
  max-width: 64px;
  height: 20px;
  padding: 0 2px;
  border: none;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>
