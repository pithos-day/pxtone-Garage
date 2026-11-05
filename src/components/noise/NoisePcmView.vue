<script setup lang="ts">
// ビルド済みノイズ波形のビュー (本家 ptNoise の PcmTable 準拠)。
// 固定ズームで描き、はみ出した分はホイールとスクロールバーで横に送る。クリックで play を通知する
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { fillRect } from "../../lib/draw";
import { clamp } from "../../lib/clamp";
import { PCM_VIEW_ZOOM, PCM_VIEW_ZOOMS, pcmScrollMax, pcmScrollThumb, pcmViewWidth } from "../../lib/pcm-view";
import { t } from "../../i18n";

const props = defineProps<{ pcm: Float32Array | null }>();
const emit = defineEmits<{ (e: "play"): void }>();

const waveRef = ref<HTMLCanvasElement | null>(null);
const waveWrapRef = ref<HTMLDivElement | null>(null);
const scrollTrackRef = ref<HTMLDivElement | null>(null);

// 本家同様、全体を横幅に押し込めず固定ズームで描き、はみ出した分は横スクロールする。
// 押し込むと 1px に何百サンプルも入り、波形が単なる長方形になってしまうため。
const waveViewW = ref(0);
const waveTrackW = ref(0);
const waveScrollPx = ref(0);
const waveZoom = ref(PCM_VIEW_ZOOM);
// renderNoise はステレオ (L/R) を返す
const PCM_CHANNELS = 2;
// 本家 if_PcmTable の塗り (サンプル値からチャンネル下端) と中央線。
// 背景は以前と同じテーマのフィールド色、波形は以前の緑 (テーマの accent) に戻す
const PCM_LINE = "#a0a0ff";
const waveTotalPx = computed(() => {
  const pcm = props.pcm;
  return pcm ? pcmViewWidth(Math.floor(pcm.length / PCM_CHANNELS), waveZoom.value) : 0;
});
const maxWaveScroll = computed(() => pcmScrollMax(waveTotalPx.value, waveViewW.value));
const waveScrollable = computed(() => maxWaveScroll.value > 0);
const waveThumb = computed(() =>
  pcmScrollThumb(waveTotalPx.value, waveViewW.value, waveScrollPx.value, waveTrackW.value),
);

// ズーム変更時は左端の時刻を保つ (本家 if_PcmTable_SetParameter の offset * old / new)
watch(waveZoom, (zoom, oldZoom) => {
  waveScrollPx.value = clampWaveScroll((waveScrollPx.value * oldZoom) / zoom);
});

// 波形の長さや表示幅が変わったら、スクロール位置を範囲内へ戻す
watch([waveTotalPx, waveViewW], () => {
  if (waveScrollPx.value > maxWaveScroll.value) waveScrollPx.value = maxWaveScroll.value;
});

let waveResizeObserver: ResizeObserver | null = null;
onMounted(() => {
  const el = waveWrapRef.value;
  const track = scrollTrackRef.value;
  if (!el || !track) return;
  waveResizeObserver = new ResizeObserver(() => {
    waveViewW.value = el.clientWidth;
    waveTrackW.value = track.clientWidth;
  });
  waveResizeObserver.observe(el);
  waveResizeObserver.observe(track);
  waveViewW.value = el.clientWidth;
  waveTrackW.value = track.clientWidth;
});
onBeforeUnmount(() => {
  waveResizeObserver?.disconnect();
  waveResizeObserver = null;
});

function clampWaveScroll(v: number): number {
  return clamp(v, 0, maxWaveScroll.value);
}

function scrollWaveBy(delta: number): void {
  waveScrollPx.value = clampWaveScroll(waveScrollPx.value + delta);
}

function onWaveWheel(e: WheelEvent): void {
  if (!waveScrollable.value) return;
  // 横スクロールを優先し、縦ホイールでも波形を送れるようにする
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (delta === 0) return;
  e.preventDefault();
  scrollWaveBy(delta);
}

// スクロールバーのドラッグ。トラックのクリックはサムの中心をその位置へ移動する
let scrollDrag: { startX: number; startScroll: number } | null = null;

function onScrollPointerDown(e: PointerEvent): void {
  if (!waveScrollable.value) return;
  const track = scrollTrackRef.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const thumb = waveThumb.value;
  const x = e.clientX - rect.left;
  if (x < thumb.left || x > thumb.left + thumb.width) {
    const range = rect.width - thumb.width;
    if (range <= 0) return;
    waveScrollPx.value = clampWaveScroll(((x - thumb.width / 2) / range) * maxWaveScroll.value);
  }
  scrollDrag = { startX: e.clientX, startScroll: waveScrollPx.value };
  track.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onScrollPointerMove(e: PointerEvent): void {
  if (!scrollDrag) return;
  const range = waveTrackW.value - waveThumb.value.width;
  if (range <= 0) return;
  waveScrollPx.value = clampWaveScroll(
    scrollDrag.startScroll + ((e.clientX - scrollDrag.startX) / range) * maxWaveScroll.value,
  );
}

function onScrollPointerUp(e: PointerEvent): void {
  scrollDrag = null;
  const track = scrollTrackRef.value;
  if (track?.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
}

function drawPcm(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  const pcm = props.pcm;
  if (!pcm || pcm.length === 0) return;
  const frames = Math.floor(pcm.length / PCM_CHANNELS);
  const chH = h / PCM_CHANNELS;
  const startFrame = Math.floor(waveScrollPx.value * waveZoom.value);

  // 本家 _PutSample (16bit) と同じく、上位バイトを 1/2 にして
  // 「サンプル値からチャンネル下端まで」を縦棒で塗る。
  // 無音時は中央から下端までが塗られる (本家の見た目)。
  ctx.fillStyle = COLORS.accent;
  for (let px = 0; px < w; px++) {
    const f = startFrame + px * waveZoom.value;
    if (f >= frames) break;
    for (let c = 0; c < PCM_CHANNELS; c++) {
      const v = pcm[f * PCM_CHANNELS + c]!;
      const s16 = clamp(Math.round(v * 32768), -32768, 32767);
      const hi = s16 >> 8;
      const center = chH * (c + 0.5);
      const baseline = chH * (c + 1);
      const top = Math.round(center - hi / 2);
      const bottom = Math.round(baseline);
      if (bottom > top) ctx.fillRect(px, top, 1, bottom - top);
    }
  }

  // 各チャンネルの中央線 (本家 _line_color。BGR のため実際は薄い青)
  ctx.strokeStyle = PCM_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c < PCM_CHANNELS; c++) {
    const y = Math.round(chH * (c + 0.5)) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

useCanvas(waveRef, drawPcm, [() => props.pcm, () => waveScrollPx.value, () => waveZoom.value]);
</script>

<template>
  <div class="ne-wave-card">
    <div ref="waveWrapRef" class="ne-wave-wrap">
      <div class="ne-wave-head">
        <span>{{ t("noise.wavePreview") }}</span>
        <select v-model.number="waveZoom" class="ne-wave-zoom" :title="t('noise.zoom')" :aria-label="t('noise.zoom')">
          <option v-for="z in PCM_VIEW_ZOOMS" :key="z.zoom" :value="z.zoom">{{ z.label }}</option>
        </select>
      </div>
      <canvas
        ref="waveRef"
        class="field-canvas ne-wave"
        @click="emit('play')"
        @wheel="onWaveWheel"
        @contextmenu.prevent
      />
      <div
        ref="scrollTrackRef"
        class="ne-wave-scroll"
        @pointerdown="onScrollPointerDown"
        @pointermove="onScrollPointerMove"
        @pointerup="onScrollPointerUp"
        @pointercancel="onScrollPointerUp"
      >
        <div
          class="ne-wave-thumb"
          :style="{ width: `${waveThumb.width}px`, transform: `translateX(${waveThumb.left}px)` }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ne-wave-card {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--muted);
  border-radius: var(--radius);
  padding: var(--space-md);
}

/* 波形領域は高さに余裕があれば本家 PcmTable と同じ 256px。スクロールバーはアプリ標準のテーマ色 */
.ne-wave-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ne-wave-head {
  flex: none;
  box-sizing: border-box;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: 0 2px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
}

.ne-wave-zoom {
  flex: none;
  height: 18px;
  padding: 0 2px;
  border: none;
  background: var(--control-surface);
  color: var(--foreground);
  font-size: var(--text-xs);
}

.ne-wave {
  flex: 1;
  min-height: 0;
  height: auto;
  width: 100%;
  cursor: pointer;
}

/* アプリ標準のテーマ色スクロールバー */
.ne-wave-scroll {
  flex: none;
  position: relative;
  box-sizing: border-box;
  height: 10px;
  margin-top: 2px;
  border-radius: 5px;
  background: var(--control-surface);
  cursor: pointer;
  user-select: none;
  touch-action: none;
}

.ne-wave-thumb {
  position: absolute;
  top: 1px;
  bottom: 1px;
  left: 0;
  border-radius: 4px;
  background: var(--control-thumb);
}

.ne-wave-thumb:hover,
.ne-wave-thumb:active {
  background: var(--control-fill);
}

@media (max-width: 700px) {
  .ne-wave-wrap {
    flex: none;
    height: 288px;
  }
}
</style>
