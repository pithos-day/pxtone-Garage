<script setup lang="ts">
// ptNoise (PTN ノイズエディタ)。
// 上段にレイヤー1..4 を縦に並べ、下段に波形と History を置く。
// 画面が低いときは波形側を縮め、レイヤーはスクロールなしで全て見せる。
// ビルドボタンは廃止し、編集が 250ms デバウンスでリアルタイムに波形へ反映される。
// 波形クリック / Space で単発再生 (ループしない。本家 PcmTable_BuildAndPlay 準拠)。
// History リスト、WAV 書き出しを提供する。
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { useEditRev } from "../../composables/useEditRev";
import { useGlobalKeys } from "../../composables/useGlobalKeys";
import { useDebounced } from "../../composables/useDebounced";
import { useUndoOnce } from "../../composables/useUndo";
import { COLORS } from "../../lib/theme";
import { fillRect } from "../../lib/draw";
import { NOISE_BUILT_SPS, secToEnveX, pctToEnveY, type NoiseEnvePoint } from "../../lib/noise";
import { PCM_VIEW_ZOOM, PCM_VIEW_ZOOMS, pcmScrollMax, pcmScrollThumb, pcmViewWidth } from "../../lib/pcm-view";
import { WaveType } from "pxtone-ts";
import { ChevronLeft, ChevronRight, Play } from "@lucide/vue";
import KnobControl from "../common/KnobControl.vue";
import NoiseEnvelopeGraph from "./NoiseEnvelopeGraph.vue";
import NoiseWaveTypeSelect from "./NoiseWaveTypeSelect.vue";
import { currentNoise, newNoise, editNoise, restoreNoiseHistory, pushNoiseHistory, NOISE_UNIT_NUM, NOISE_ENVE_NUM, resizeNoiseEnves } from "../../state/noise";
import { isModalOpen } from "../../state/ui";
import { renderNoise, playPcmOnce } from "../../engine/preview";
import { t } from "../../i18n";
import { clamp } from "../../lib/clamp";

// v-show で常時マウントされるため、Space は noise モードのときだけ有効にする
const props = defineProps<{ active: boolean }>();

const noise = computed(() => currentNoise());
// 編集リビジョン。undo/redo 後はリアルタイム反映のため再ビルドを予約する
const { rev, touch } = useEditRev(() => noise.value, undefined, () => scheduleEditBuild());

// 変調の流れに合わせて Frequency → Main ← Volume の順に並べる
const OSC_IDS = ["freq", "main", "volu"] as const;

// 全レイヤーを縦に並べる (read 直後は有効ユニット数ぶん)
const unitList = computed(() => {
  const n = noise.value?.noise;
  if (!n) return [] as number[];
  const out: number[] = [];
  for (let u = 0; u < n.unitNum && u < NOISE_UNIT_NUM; u++) out.push(u);
  return out;
});

// レイヤー番号 → ユニット (編集ハンドラ用。タブが無ければ null)
function unitAt(u: number) {
  return noise.value?.noise.getUnit(u) ?? null;
}

// テンプレートの v-for に渡すレイヤー行 (index とユニットの組)。
// undo/redo や History の反映はユニットを作り直すため、
// rev を参照して行の unit 参照も更新する (markRaw のため自動追跡されない)
const unitRows = computed(() => {
  void rev.value;
  return unitList.value.map((u) => ({ index: u, unit: noise.value!.noise.getUnit(u)! }));
});

// テーブル編集は直接 Noise を書き、undo はフォーカス時に1エントリ積む。
// (markRaw なので reactive にならない。rev はテンプレートの :data-rev で再描画を駆動)
const fieldUndo = useUndoOnce(() => editNoise(() => {}));
function onFieldChange(): void {
  const d = noise.value;
  if (d) {
    // 公式の範囲クランプを適用 (freq 0..44100, volume 0..200, offset 0..100, pan ±100, enve x/y)
    d.noise.fix();
  }
  touch();
  scheduleEditBuild();
}

// オシレータの値を直接書き換え (undo はフォーカス時に1エントリ)。
// field は "type" | "bRev" が非数値、それ以外 (freq/volume/offset) は数値
function setOsc(u: number, osc: (typeof OSC_IDS)[number], field: "type" | "bRev" | "freq" | "volume" | "offset", v: number | boolean): void {
  const o = unitAt(u)?.[osc];
  if (!o) return;
  if (field === "type") o.type = v as WaveType;
  else if (field === "bRev") o.bRev = v as boolean;
  else o[field] = v as number;
  onFieldChange();
}

// ノブのドラッグは 1 ジェスチャごとに undo を積む (フォーカスが残っていても別エントリにする)
function onKnobBegin(): void {
  fieldUndo.reset();
  fieldUndo.onBegin();
}

function setPan(u: number, v: number): void {
  const unit = unitAt(u);
  if (!unit) return;
  unit.pan = v;
  onFieldChange();
}

// エンベロープ点数 (1..3) の変更 (undo 1エントリ + 配列長を合わせる)。
// 0 点はエンジン上で無音になるため許可しない (旧データは readNoiseBytes で 1 点へ正規化)
function onEnveNumChange(u: number, v: number): void {
  const unit = unitAt(u);
  if (!unit) return;
  editNoise(() => {
    unit.enves = resizeNoiseEnves(unit.enves, v);
    unit.enveNum = unit.enves.length;
  });
  touch();
  scheduleEditBuild();
}

// グラフ操作の反映 (undo は begin で onKnobBegin が積む)
function setEnves(u: number, enves: NoiseEnvePoint[]): void {
  const unit = unitAt(u);
  if (!unit) return;
  unit.enves = enves;
  unit.enveNum = enves.length;
  onFieldChange();
}

// エンベロープ: 秒 (x/1000) と % (y)。変換と範囲クランプは lib/noise が担当
function setEnveSec(u: number, i: number, raw: string): void {
  const unit = unitAt(u);
  if (!unit || !unit.enves[i]) return;
  const v = secToEnveX(raw);
  if (v === null) return;
  unit.enves[i]!.x = v;
  onFieldChange();
}
function setEnvePct(u: number, i: number, raw: string): void {
  const unit = unitAt(u);
  if (!unit || !unit.enves[i]) return;
  const v = pctToEnveY(raw);
  if (v === null) return;
  unit.enves[i]!.y = v;
  onFieldChange();
}


// ---- リアルタイムビルド (250ms デバウンス) ----
// 波形とビルド履歴はタブごとの内容を表示する (履歴の実体は doc 側が持つ)
const builtPcm = ref<Float32Array | null>(null);

// デバウンス実行時に「履歴に積むか」を受け取る (編集 = true / 表示のみ = false)
const scheduleRebuild = useDebounced((record: boolean) => rebuild(record)).run;

// 編集後の再ビルド (履歴に積む)
function scheduleEditBuild(): void {
  scheduleRebuild(true);
}

// 表示だけの再ビルド (タブ切替・起動直後。履歴に積まない)
function schedulePreview(): void {
  scheduleRebuild(false);
}

// タブを切り替えたら、前のファイルの波形を残さず新しいタブの波形を描き直す。
// 切替は編集ではないため履歴には積まない (保留中の編集ビルドも切替後の内容で塗り替える)
watch(noise, () => {
  builtPcm.value = null;
  schedulePreview();
});

// record=true のときだけビルドを履歴へ積む
function rebuild(record: boolean): void {
  const d = noise.value;
  if (!d) return;
  const pcm = renderNoise(d.noise, NOISE_BUILT_SPS);
  if (!pcm) return;
  builtPcm.value = pcm;
  // 履歴は現在のタブへ積む (連続編集を1件にまとめるルールは lib/noise)
  if (record) pushNoiseHistory(pcm, new Date().toLocaleTimeString("ja-JP", { hour12: false }));
  touch();
}

// 波形クリック = 単発再生 (ループしない。本家準拠)
function onPcmClick(): void {
  if (builtPcm.value) playPcmOnce(builtPcm.value);
}

function playHistory(i: number): void {
  const e = noise.value?.history[i];
  if (e) playPcmOnce(e.pcm);
}

// ダブルクリックでエディタに反映 (undo 1エントリ + 再ビルド)
function applyHistory(i: number): void {
  const d = noise.value;
  const e = d?.history[i];
  if (!d || !e) return;
  editNoise(() => {
    restoreNoiseHistory(d, e);
  });
  touch();
  scheduleEditBuild();
}

// WAV 書き出しは File メニュー (menu.file.exportWav) から行うため、ボタンは廃止した

// ---- Space: ビルド済み波形の再生 (未反映なら即ビルドして再生) ----
function onKeydown(e: KeyboardEvent): void {
  if (e.code !== "Space") return;
  // モーダルダイアログ表示中はショートカットを止める (CollageEditor / MenuBar と同じ)
  if (isModalOpen()) return;
  e.preventDefault();
  if (e.repeat) return;
  if (!builtPcm.value) rebuild(false);
  if (builtPcm.value) playPcmOnce(builtPcm.value);
}

useGlobalKeys(() => props.active, { keydown: onKeydown });
onMounted(() => {
  // 開いた直後にも波形を表示する (表示だけ。履歴には積まない)
  schedulePreview();
});

// ---- 波形プレビュー描画 (本家 ptNoise の PcmTable 準拠) ----
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
  const pcm = builtPcm.value;
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
  const pcm = builtPcm.value;
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

useCanvas(waveRef, drawPcm, [() => rev.value, () => noise.value, () => waveScrollPx.value, () => waveZoom.value]);
</script>

<template>
  <div class="noise-editor">
    <div v-if="!noise" class="editor-empty">
      <h2>{{ t("noise.title") }}</h2>
      <p>{{ t("noise.empty") }}</p>
      <button class="btn btn-accent" @click="newNoise()">{{ t("menu.file.new") }}</button>
    </div>
    <div v-else class="ne-main" :data-rev="rev">
      <div class="ne-layers" @focusin="fieldUndo.onBegin" @focusout="fieldUndo.reset">
        <div v-for="row in unitRows" :key="row.index" class="ne-layer" :class="{ 'is-off': !row.unit.bEnable }">
          <div class="ne-module ne-layer-head">
            <label class="ne-layer-title">
              <input v-model="row.unit.bEnable" class="switch" type="checkbox" :aria-label="t('noise.enable')" @change="onFieldChange" />
              <span class="ne-layer-name">{{ t("noise.layer") }} {{ row.index + 1 }}</span>
            </label>
              <KnobControl
                class="ne-off-target"
              :inert="!row.unit.bEnable"
                :model-value="row.unit.pan"
                :min="-100"
                :max="100"
                :center="0"
                :label="t('noise.pan')"
                @begin="onKnobBegin"
                @update:model-value="setPan(row.index, $event)"
              />
          </div>
          <template v-for="osc in OSC_IDS" :key="osc">
            <ChevronRight v-if="osc === 'main'" :size="16" class="ne-flow ne-off-target" aria-hidden="true" />
            <ChevronLeft v-else-if="osc === 'volu'" :size="16" class="ne-flow ne-off-target" aria-hidden="true" />
            <div class="ne-module ne-osc ne-off-target" :class="{ 'is-main': osc === 'main' }" :inert="!row.unit.bEnable">
              <div class="ne-osc-head">
                <span class="ne-osc-name">{{ t(`noise.${osc}`) }}</span>
                <div class="ne-osc-type">
                  <NoiseWaveTypeSelect
                    :model-value="row.unit[osc].type"
                    @update:model-value="setOsc(row.index, osc, 'type', $event)"
                  />
                </div>
                <label class="ne-osc-rev" :title="t('noise.reverse')">
                  <span class="ne-osc-rev-text">{{ t("noise.reverse") }}</span>
                  <input
                    class="switch"
                    type="checkbox"
                    :aria-label="t('noise.reverse')"
                    :checked="row.unit[osc].bRev"
                    @change="setOsc(row.index, osc, 'bRev', ($event.target as HTMLInputElement).checked)"
                  />
                </label>
              </div>
              <div class="ne-osc-knobs">
                <KnobControl
                  :model-value="row.unit[osc].freq"
                  :min="0"
                  :max="44100"
                  log
                  :label="t('noise.freqValue')"
                  @begin="onKnobBegin"
                  @update:model-value="setOsc(row.index, osc, 'freq', $event)"
                />
                <KnobControl
                  :model-value="row.unit[osc].volume"
                  :min="0"
                  :max="200"
                  :label="t('noise.oscVolume')"
                  @begin="onKnobBegin"
                  @update:model-value="setOsc(row.index, osc, 'volume', $event)"
                />
                <KnobControl
                  :model-value="row.unit[osc].offset"
                  :min="0"
                  :max="100"
                  :label="t('noise.offset')"
                  @begin="onKnobBegin"
                  @update:model-value="setOsc(row.index, osc, 'offset', $event)"
                />
              </div>
            </div>
          </template>
          <ChevronRight :size="16" class="ne-flow ne-off-target" aria-hidden="true" />
          <div class="ne-module ne-enve ne-off-target" :inert="!row.unit.bEnable">
            <div class="ne-enve-head">
              <span class="ne-enve-title">{{ t("noise.envelope") }}</span>
              <select :value="row.unit.enveNum" :aria-label="t('noise.envePoint')" @change="onEnveNumChange(row.index, Number(($event.target as HTMLSelectElement).value))">
                <option v-for="n in NOISE_ENVE_NUM" :key="n" :value="n">{{ n }}</option>
              </select>
            </div>
            <NoiseEnvelopeGraph
              :enves="row.unit.enves"
              :max-points="NOISE_ENVE_NUM"
              :rev="rev"
              @begin="onKnobBegin"
              @update="setEnves(row.index, $event)"
            />
            <div class="ne-enve-points">
              <div v-for="(p, i) in row.unit.enves" :key="i" class="ne-enve-point">
                <span class="ne-enve-no">{{ t("noise.envePoint") }}{{ i + 1 }}</span>
                <input
                  type="number"
                  class="ne-enve-pct"
                  :value="p.y"
                  min="0"
                  max="100"
                  title="%"
                  @change="setEnvePct(row.index, i, ($event.target as HTMLInputElement).value)"
                />
                <input
                  type="number"
                  class="ne-enve-sec"
                  :value="p.x / 1000"
                  min="0"
                  max="10"
                  step="0.001"
                  :title="t('wav.sec')"
                  @change="setEnveSec(row.index, i, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="ne-preview">
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
              @click="onPcmClick"
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
        <div class="ne-history">
          <div class="ne-history-title">{{ t("noise.history") }}</div>
          <div class="ne-hint">{{ t("noise.historyHint") }}</div>
          <div class="ne-history-list">
            <button
              v-for="(h, i) in noise.history"
              :key="i"
              type="button"
              class="ne-history-item"
              :title="t('noise.historyHint')"
              @click="playHistory(i)"
              @dblclick="applyHistory(i)"
            >
              <Play :size="11" class="ne-history-play" />
              {{ h.label }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.noise-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px;
  background: var(--background);
}

.editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  color: var(--muted-foreground);
  text-align: center;
  white-space: pre-line;
}

.ne-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  /* 極端に低い画面でレイヤーと波形の最小高さすら入らないときだけスクロールする */
  overflow-y: auto;
}

/* 全レイヤーを縦に並べる。常に全高を確保し、足りない高さは波形側が譲る */
.ne-layers {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  font-size: var(--text-sm);
}

/* 1 レイヤー = 横一列のラック。折り返すと高さが倍になるため 1 行に保つ */
.ne-layer {
  display: flex;
  align-items: stretch;
  gap: var(--space-xs);
  flex: none;
}

.ne-module {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--muted);
  border-radius: var(--radius);
}

.ne-layer-head {
  flex: 0 0 118px;
  align-items: center;
}

/* 無効レイヤーは有効スイッチ以外をグレーアウトして操作不可にする (inert と併用) */
.ne-layer.is-off .ne-off-target {
  opacity: 0.4;
  filter: grayscale(1);
}

.ne-layer-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}

.ne-layer-name {
  font-size: var(--text-xs);
  font-weight: bold;
  white-space: nowrap;
  color: var(--foreground);
}

.ne-flow {
  flex: none;
  align-self: center;
  color: var(--control-fill);
}

.ne-osc {
  flex: 1 1 0;
}

/* 変調を受ける Main を周囲より目立たせる */
.ne-osc.is-main {
  box-shadow: inset 0 0 0 1px var(--control-fill);
}

.ne-osc-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  height: 24px;
}

.ne-osc-name {
  flex: none;
  width: 58px;
  font-size: var(--text-xs);
  font-weight: bold;
  color: var(--foreground);
}

.ne-osc-type {
  flex: 1;
  min-width: 0;
  height: 100%;
}

.ne-osc-rev {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--text-2xs);
  color: var(--foreground);
  cursor: pointer;
}

.ne-osc-knobs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
}

.ne-enve {
  flex: 1.8 1 0;
  color: var(--foreground);
}

.ne-enve-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.ne-enve-title {
  font-weight: bold;
  font-size: var(--text-xs);
}

.ne-enve-points {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
}

.ne-enve-point {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.ne-enve input,
.ne-enve select {
  height: 20px;
  padding: 0 2px;
  border: none;
  background: var(--control-surface);
  color: var(--foreground);
  font-size: var(--text-xs);
}

.ne-enve select {
  width: 36px;
}

.ne-enve-no {
  font-size: var(--text-2xs);
}

.ne-enve .ne-enve-pct {
  width: 48px;
}

.ne-enve .ne-enve-sec {
  width: 60px;
}

.ne-preview {
  /* 基本の高さは波形領域 288px + 上下の余白。レイヤーが入らない分だけ縮む */
  flex: 0 1 calc(288px + 2 * var(--space-md));
  min-height: 100px;
  display: flex;
  gap: var(--space-md);
}

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

.ne-history {
  flex: none;
  width: 240px;
  min-height: 0;
  background: var(--muted);
  border-radius: var(--radius);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.ne-history-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
}

.ne-hint {
  font-size: var(--text-2xs);
  color: var(--foreground);
}

.ne-history-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  margin-top: var(--space-xs);
}

.ne-history-item {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  text-align: left;
  border: none;
  border-radius: calc(var(--radius) - 2px);
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  padding: 2px 6px;
  cursor: pointer;
}

.ne-history-play {
  flex: none;
  color: var(--control-fill);
}

.ne-history-item:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.ne-history-item:hover .ne-history-play {
  color: inherit;
}

/* 幅が狭いときは反転の文字を省き、周波数などのノブに幅を譲る (title と aria-label は残る) */
@media (max-width: 1100px) {
  .ne-osc-rev-text {
    display: none;
  }
}

/* 低い画面では各モジュールを詰めて、波形に回せる高さを増やす */
@media (max-height: 800px) and (min-width: 701px) {
  .ne-layers {
    gap: var(--space-xs);
  }

  .ne-module {
    gap: var(--space-xs);
    padding: var(--space-sm);
  }

  .ne-osc-head {
    height: 20px;
  }

  .ne-module :deep(.knob-dial) {
    width: 30px;
    height: 30px;
  }

  .ne-module :deep(.knob-num),
  .ne-enve input,
  .ne-enve select {
    height: 16px;
  }

  .ne-enve-points {
    gap: var(--space-2xs) var(--space-md);
  }

  .ne-enve .noise-enve-graph {
    flex-basis: 32px;
    height: 32px;
    min-height: 32px;
  }
}

/* 横幅が足りないと波形が潰れるため、レイヤーを折り返して全体を縦スクロールにし、波形と History を積む */
@media (max-width: 900px) {
  .ne-layer {
    flex-wrap: wrap;
  }

  .ne-osc {
    flex-basis: 220px;
  }

  .ne-enve {
    flex-basis: 400px;
  }
}

@media (max-width: 700px) {
  .ne-layers {
    flex: none;
  }

  .ne-preview {
    flex: none;
    flex-direction: column;
  }

  .ne-wave-wrap {
    flex: none;
    height: 288px;
  }

  .ne-history {
    width: auto;
    height: 200px;
  }
}
</style>
