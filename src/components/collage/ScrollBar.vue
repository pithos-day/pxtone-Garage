// ドラッグ式スクロールバー (縦/横)
<script setup lang="ts">
import { computed, ref } from "vue";
import { doc, getService } from "../../state/project";
// clockView is provided by project store

const props = defineProps<{
  vertical?: boolean;
  length?: number; // 縦: ユニット数 (0: 無効)
}>();

const trackRef = ref<HTMLElement | null>(null);
const dragging = ref(false);
const offsetAtStart = ref(0);
const mouseAtStart = ref(0);

const total = computed(() => {
  if (props.vertical) return Math.max(1, props.length ?? 0);
  return 0;
});

const viewSize = computed(() => {
  const track = trackRef.value;
  if (!track) return 1;
  return props.vertical ? track.clientHeight : track.clientWidth;
});

const contentSize = computed(() => {
  if (props.vertical) return total.value * 16;
  const s = getService();
  if (!s) return 1;
  const meas = Math.max(s.master.measNum, s.master.playMeas + 1);
  return meas * s.master.beatNum * s.master.beatClock * (doc.zoom / s.master.beatClock);
});

const thumbSize = computed(() => {
  const vs = viewSize.value;
  const cs = Math.max(contentSize.value, vs);
  return Math.max(16, (vs / cs) * vs);
});

const offset = computed(() => {
  if (props.vertical) return doc.scrollYUnit * 16;
  return doc.scrollX;
});

const maxOffset = computed(() => Math.max(0, contentSize.value - viewSize.value));

function onPointerDown(e: PointerEvent): void {
  const track = trackRef.value;
  if (!track) return;
  track.setPointerCapture(e.pointerId);
  dragging.value = true;
  offsetAtStart.value = offset.value;
  mouseAtStart.value = props.vertical ? e.clientY : e.clientX;
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  const track = trackRef.value;
  if (!track) return;
  const pos = props.vertical ? e.clientY : e.clientX;
  const cs = Math.max(contentSize.value, viewSize.value);
  const delta = ((pos - mouseAtStart.value) / viewSize.value) * cs;
  setOffset(offsetAtStart.value + delta);
}

function onPointerUp(e: PointerEvent): void {
  dragging.value = false;
  const track = trackRef.value;
  if (track?.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
}

function setOffset(v: number): void {
  const m = maxOffset.value;
  const clamped = Math.max(0, Math.min(m, v));
  if (props.vertical) {
    doc.scrollYUnit = Math.round(clamped / 16);
  } else {
    doc.scrollX = Math.round(clamped);
  }
}

// トラッククリックでジャンプ
function onTrackClick(e: PointerEvent): void {
  if (dragging.value) return;
  const track = trackRef.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const pos = props.vertical ? e.clientY - rect.top : e.clientX - rect.left;
  const cs = Math.max(contentSize.value, viewSize.value);
  setOffset((pos / viewSize.value) * cs - thumbSize.value / 2);
}
</script>

<template>
  <div
    ref="trackRef"
    class="scroll-track"
    :class="{ vertical: vertical, horizontal: !vertical }"
    @pointerdown="onTrackClick"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div
      class="scroll-thumb"
      :style="{
        [vertical ? 'height' : 'width']: thumbSize + 'px',
        [vertical ? 'top' : 'left']: offset + 'px',
      }"
      @pointerdown.stop="onPointerDown"
    />
  </div>
</template>

<style scoped>
.scroll-track {
  position: relative;
  background: var(--panel-dark);
  border: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  touch-action: none;
}

.scroll-thumb {
  position: absolute;
  background: #4a4860;
  border: 1px solid #6a6780;
}

.scroll-thumb:hover,
.scroll-thumb:active {
  background: var(--accent-dark);
}

.vertical {
  width: 100%;
  height: 100%;
}

.vertical .scroll-thumb {
  left: 1px;
  right: 1px;
}

.horizontal {
  width: 100%;
  height: 100%;
}

.horizontal .scroll-thumb {
  top: 1px;
  bottom: 1px;
}
</style>
