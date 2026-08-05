// ドラッグ式スクロールバー (縦/横)
// 正規化位置 (0..1) で thumb 位置とコンテンツオフセットを対応させる
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { doc, getService } from "../../state/project";

const props = defineProps<{
  vertical?: boolean;
  length?: number; // 縦: ユニット数 (0: 無効)
}>();

const trackRef = ref<HTMLElement | null>(null);
const dragging = ref(false);
const fracAtStart = ref(0);
const mouseAtStart = ref(0);
// トラックのリサイズを computed に伝えるための tick
const viewTick = ref(0);

onMounted(() => {
  const track = trackRef.value;
  if (!track) return;
  const ro = new ResizeObserver(() => viewTick.value++);
  ro.observe(track);
  onBeforeUnmount(() => ro.disconnect());
});

const total = computed(() => {
  if (props.vertical) return Math.max(1, props.length ?? 0);
  return 0;
});

const viewSize = computed(() => {
  void viewTick.value;
  const track = trackRef.value;
  if (!track) return 1;
  return props.vertical ? track.clientHeight : track.clientWidth;
});

const contentSize = computed(() => {
  void doc.rev; // openProject / 編集で再計算
  void viewTick.value;
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

// thumb が動ける範囲 (track 幅 - thumb 幅)
const trackRange = computed(() => Math.max(1, viewSize.value - thumbSize.value));
// コンテンツが動ける範囲 (コンテンツ幅 - 表示幅)
const contentRange = computed(() => Math.max(0, contentSize.value - viewSize.value));

const offset = computed(() => {
  if (props.vertical) return doc.scrollYUnit * 16;
  return doc.scrollX;
});

// 正規化位置 (0..1)
const frac = computed(() => {
  const cr = contentRange.value;
  if (cr <= 0) return 0;
  return Math.min(1, Math.max(0, offset.value / cr));
});

const thumbPos = computed(() => frac.value * trackRange.value);

function setFrac(f: number): void {
  const clamped = Math.max(0, Math.min(1, f));
  const v = clamped * contentRange.value;
  if (props.vertical) {
    doc.scrollYUnit = Math.round(v / 16);
  } else {
    doc.scrollX = Math.round(v);
  }
}

function onPointerDown(e: PointerEvent): void {
  const track = trackRef.value;
  if (!track) return;
  track.setPointerCapture(e.pointerId);
  dragging.value = true;
  fracAtStart.value = frac.value;
  mouseAtStart.value = props.vertical ? e.clientY : e.clientX;
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return;
  const track = trackRef.value;
  if (!track) return;
  const pos = props.vertical ? e.clientY : e.clientX;
  const d = (pos - mouseAtStart.value) / trackRange.value;
  setFrac(fracAtStart.value + d);
}

function onPointerUp(e: PointerEvent): void {
  dragging.value = false;
  const track = trackRef.value;
  if (track?.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
}

// トラッククリックで thumb 中央をそこへジャンプ
function onTrackClick(e: PointerEvent): void {
  if (dragging.value) return;
  const track = trackRef.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const pos = props.vertical ? e.clientY - rect.top : e.clientX - rect.left;
  const f = (pos - thumbSize.value / 2) / trackRange.value;
  setFrac(f);
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
        [vertical ? 'top' : 'left']: thumbPos + 'px',
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
