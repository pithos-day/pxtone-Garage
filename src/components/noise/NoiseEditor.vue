<script setup lang="ts">
// ptNoise (PTN ノイズエディタ)。
// 4レイヤー×3オシレータ (main/freq/volu) のテーブル編集、ビルド→波形プレビュー、
// History リスト、WAV 書き出しを提供する。編集は state/noise.ts の editNoise で行う。
import { computed, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
import { MemoryIo } from "pxtone-ts";
import { currentNoise, newNoise, editNoise, NOISE_UNIT_NUM } from "../../state/noise";
import { renderNoise, playPcmLoop, stopPreview } from "../../engine/preview";
import { exportNoiseWav } from "../../engine/io";
import { t } from "../../i18n";

const noise = computed(() => currentNoise());
const rev = ref(0);
function touch(): void {
  rev.value++;
}

// 波形タイプの表示名 (enum 順)
const WAVE_TYPE_NAMES = [
  "None", "Sine", "Saw", "Rect", "Random", "Saw2", "Rect2", "Tri",
  "Random2", "Rect3", "Rect4", "Rect8", "Rect16", "Saw3", "Saw4", "Saw6", "Saw8",
] as const;

// 表示対象のユニット (read 直後は有効ユニット数ぶん)
const unitList = computed(() => {
  const n = noise.value?.noise;
  if (!n) return [] as number[];
  const out: number[] = [];
  for (let u = 0; u < n.unitNum && u < NOISE_UNIT_NUM; u++) out.push(u);
  return out;
});

// テンプレート用の非 null アクセサ (v-else 内でのみ呼ばれる)
function unitAt(u: number) {
  return noise.value?.noise.getUnit(u) ?? null;
}

// テーブル編集は v-model で直接 Noise を書き、undo はフォーカス時に1エントリ積む。
// (markRaw なので reactive にならない。rev はテンプレートの :data-rev で再描画を駆動)
let undoPushed = false;
function onFieldFocus(): void {
  if (undoPushed) return;
  undoPushed = true;
  editNoise(() => {});
}
function onFieldBlur(): void {
  undoPushed = false;
}
function onFieldChange(): void {
  const d = noise.value;
  if (d) {
    // 公式の範囲クランプを適用 (freq 0..44100, volume 0..200, offset 0..100, pan ±100, enve x/y)
    d.noise.fix();
  }
  touch();
}

// エンベロープ点数の変更 (undo 1エントリ + 配列長を合わせる)
function onEnveNumChange(u: number, v: number): void {
  const d = noise.value;
  if (!d) return;
  const unit = d.noise.getUnit(u);
  if (!unit) return;
  editNoise(() => {
    const target = Math.max(0, Math.min(3, Math.round(v)));
    unit.enveNum = target;
    while (unit.enves.length < target) unit.enves.push({ x: 0, y: 0 });
    unit.enves.length = target;
  });
  touch();
}

// undo/redo 後にテーブルとキャンバスを再描画する
watch(
  () => [noise.value?.undoStack.length, noise.value?.redoStack.length],
  () => touch(),
);

// ---- ビルド / プレビュー ----
const BUILT_SPS = 44100;
const builtPcm = ref<Float32Array | null>(null);
const playingNow = ref(false);
const buildError = ref("");

interface HistoryEntry {
  label: string;
  bytes: Uint8Array;
  pcm: Float32Array;
}
const history = ref<HistoryEntry[]>([]);

function onBuild(): void {
  const d = noise.value;
  if (!d) return;
  const pcm = renderNoise(d.noise, BUILT_SPS);
  if (!pcm) {
    buildError.value = t("error.noiseBuild");
    return;
  }
  buildError.value = "";
  builtPcm.value = pcm;
  const io = new MemoryIo();
  d.noise.write(io);
  const label = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  history.value.unshift({ label, bytes: io.toUint8Array(), pcm });
  if (history.value.length > 30) history.value.length = 30;
  touch();
}

function onPcmClick(): void {
  if (!builtPcm.value) return;
  if (playingNow.value) {
    stopPreview();
    playingNow.value = false;
  } else {
    playPcmLoop(builtPcm.value);
    playingNow.value = true;
  }
}

function playHistory(i: number): void {
  const e = history.value[i];
  if (!e) return;
  playPcmLoop(e.pcm);
  playingNow.value = true;
}

// ダブルクリックでエディタに反映 (undo 1エントリ)
function applyHistory(i: number): void {
  const d = noise.value;
  const e = history.value[i];
  if (!d || !e) return;
  editNoise(() => {
    d.noise.read(new MemoryIo(e.bytes));
  });
  touch();
}

function onSaveWav(): void {
  const d = noise.value;
  if (!d) return;
  const err = exportNoiseWav(d.noise, d.fileName || "untitled");
  if (err) buildError.value = err;
}

// ---- 波形プレビュー描画 ----
const waveRef = ref<HTMLCanvasElement | null>(null);

function drawPcm(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  const pcm = builtPcm.value;
  if (!pcm || pcm.length === 0) {
    fillText(ctx, t("noise.wavePreview"), 8, h / 2, COLORS.textDim, 10);
    return;
  }
  const n = pcm.length / 2;
  const mid = h / 2;
  const amp = h / 2 - 2;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let px = 0; px < w; px++) {
    const i0 = Math.trunc((px / w) * n);
    const i1 = Math.max(i0 + 1, Math.trunc(((px + 1) / w) * n));
    let min = 1;
    let max = -1;
    for (let i = i0; i < i1; i++) {
      const v = (pcm[i * 2]! + pcm[i * 2 + 1]!) / 2;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(px, mid - min * amp);
    ctx.lineTo(px, mid - max * amp);
  }
  ctx.stroke();
}

useCanvas(waveRef, drawPcm, [() => rev.value, () => noise.value]);
</script>

<template>
  <div class="noise-editor">
    <div v-if="!noise" class="editor-empty">
      <h2>{{ t("noise.title") }}</h2>
      <p>{{ t("noise.empty") }}</p>
      <button class="btn btn-accent" @click="newNoise()">{{ t("menu.file.new") }}</button>
    </div>
    <div v-else class="ne-main" :data-rev="rev">
      <div class="ne-table" @focusin="onFieldFocus" @focusout="onFieldBlur">
        <div v-for="u in unitList" :key="u" class="ne-unit">
          <div class="ne-unit-head">
            <span class="ne-unit-name">Unit {{ u + 1 }}</span>
            <label class="chk">{{ t("noise.enable") }}
              <input
                v-model="unitAt(u)!.bEnable"
                type="checkbox"
                @change="onFieldChange"
              />
            </label>
            <label>{{ t("noise.pan") }}
              <input
                v-model.number="unitAt(u)!.pan"
                type="number"
                min="-100"
                max="100"
                class="num"
                @change="onFieldChange"
              />
            </label>
          </div>
          <div v-for="osc in ['main', 'freq', 'volu'] as const" :key="osc" class="ne-osc">
            <span class="ne-osc-name">{{ t(`noise.${osc}`) }}</span>
            <select
              :value="unitAt(u)![osc].type"
              @change="(e) => { unitAt(u)![osc].type = Number((e.target as HTMLSelectElement).value); onFieldChange(); }"
            >
              <option v-for="(name, wi) in WAVE_TYPE_NAMES" :key="wi" :value="wi">{{ name }}</option>
            </select>
            <label>{{ t("noise.freqValue") }}
              <input
                v-model.number="unitAt(u)![osc].freq"
                type="number"
                min="0"
                max="44100"
                class="num"
                @change="onFieldChange"
              />
            </label>
            <label>{{ t("noise.oscVolume") }}
              <input
                v-model.number="unitAt(u)![osc].volume"
                type="number"
                min="0"
                max="200"
                class="num"
                @change="onFieldChange"
              />
            </label>
            <label>{{ t("noise.offset") }}
              <input
                v-model.number="unitAt(u)![osc].offset"
                type="number"
                min="0"
                max="100"
                class="num"
                @change="onFieldChange"
              />
            </label>
            <label class="chk">{{ t("noise.reverse") }}
              <input
                v-model="unitAt(u)![osc].bRev"
                type="checkbox"
                @change="onFieldChange"
              />
            </label>
          </div>
          <div class="ne-enve">
            <span class="ne-osc-name">{{ t("noise.envelope") }}</span>
            <select
              :value="unitAt(u)!.enveNum"
              @change="(e) => onEnveNumChange(u, Number((e.target as HTMLSelectElement).value))"
            >
              <option :value="0">0</option>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select>
            <template v-for="(p, pi) in unitAt(u)!.enves" :key="pi">
              <label>{{ t("noise.envePoint") }}{{ pi + 1 }} x
                <input
                  v-model.number="p.x"
                  type="number"
                  min="0"
                  max="10000"
                  class="num"
                  @change="onFieldChange"
                />
              </label>
              <label>y
                <input
                  v-model.number="p.y"
                  type="number"
                  min="0"
                  max="100"
                  class="num"
                  @change="onFieldChange"
                />
              </label>
            </template>
          </div>
        </div>
      </div>
      <div class="ne-preview">
        <div class="ne-build-row">
          <button class="btn btn-accent" @click="onBuild">{{ t("noise.build") }}</button>
          <button class="btn" @click="onSaveWav">{{ t("noise.saveWav") }}</button>
          <span v-if="buildError" class="ne-error">{{ buildError }}</span>
        </div>
        <canvas
          ref="waveRef"
          class="field-canvas ne-wave"
          @click="onPcmClick"
          @contextmenu.prevent
        />
        <div class="ne-history">
          <div class="ne-history-title">
            {{ t("noise.history") }}
            <span class="ne-hint">{{ t("noise.historyHint") }}</span>
          </div>
          <div v-if="history.length === 0" class="ne-hint">{{ t("noise.buildHint") }}</div>
          <button
            v-for="(h, i) in history"
            :key="i"
            class="ne-history-item"
            :title="t('noise.historyHint')"
            @click="playHistory(i)"
            @dblclick="applyHistory(i)"
          >
            {{ h.label }}
          </button>
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
  gap: 8px;
  color: var(--muted-foreground);
  text-align: center;
  white-space: pre-line;
}

.ne-main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 8px;
}

.ne-table {
  width: 560px;
  flex: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.ne-unit {
  border: 1px solid var(--border);
  background: var(--card);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.ne-unit-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: bold;
}

.ne-unit-name {
  color: var(--foreground);
}

.ne-osc {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ne-osc-name {
  width: 52px;
  flex: none;
  font-weight: bold;
}

.ne-enve {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px dashed var(--border);
  padding-top: 4px;
}

.chk {
  display: flex;
  align-items: center;
  gap: 3px;
}

.ne-table label {
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.ne-table select,
.ne-table input {
  font-size: 12px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  padding: 1px 3px;
}

.ne-table .num {
  width: 72px;
}

.ne-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ne-build-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ne-error {
  color: var(--destructive);
  font-size: 11px;
}

.ne-wave {
  flex: 1;
  min-height: 0;
  cursor: pointer;
}

.ne-history {
  height: 120px;
  overflow-y: auto;
  border: 1px solid var(--border);
  background: var(--card);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ne-history-title {
  font-size: 11px;
  font-weight: bold;
  color: var(--foreground);
  display: flex;
  gap: 8px;
}

.ne-hint {
  font-size: 10px;
  color: var(--muted-foreground);
}

.ne-history-item {
  text-align: left;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 11px;
  padding: 1px 4px;
  cursor: pointer;
}

.ne-history-item:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}
</style>
