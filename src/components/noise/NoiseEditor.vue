<script setup lang="ts">
// ptNoise (PTN ノイズエディタ)。
// レイヤー1..4 をタブで切替 (本家 dlg_Noise_Design 準拠)。各レイヤーに
// オシレータ (main/freq/volu 縦3行 + 列ヘッダ)・エンベロープ (秒/%)・Enable/パン。
// ビルド→波形プレビュー (クリックで単発再生 = ループしない。本家 PcmTable_BuildAndPlay 準拠)。
// History リスト、WAV 書き出しを提供する。
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
import { MemoryIo } from "pxtone-ts";
import { currentNoise, newNoise, editNoise, NOISE_UNIT_NUM } from "../../state/noise";
import { renderNoise, playPcmOnce } from "../../engine/preview";
import { exportNoiseWav } from "../../engine/io";
import { t } from "../../i18n";

// v-show で常時マウントされるため、Space は noise モードのときだけ有効にする
const props = defineProps<{ active: boolean }>();

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
const OSC_IDS = ["main", "freq", "volu"] as const;

// レイヤータブ (read 直後は有効ユニット数ぶん)
const layerCount = computed(() => Math.min(NOISE_UNIT_NUM, noise.value?.noise.unitNum ?? 0));
const activeLayer = ref(0);
watch(layerCount, (n) => {
  if (activeLayer.value >= n) activeLayer.value = Math.max(0, n - 1);
});

// テンプレート用の非 null アクセサ (v-else 内でのみ呼ばれる)
function unitAt(u: number) {
  return noise.value?.noise.getUnit(u) ?? null;
}
function unit() {
  return unitAt(activeLayer.value);
}

// テーブル編集は直接 Noise を書き、undo はフォーカス時に1エントリ積む。
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

// オシレータの値を直接書き換え (undo はフォーカス時に1エントリ)
function setOsc(osc: (typeof OSC_IDS)[number], field: "type" | "bRev" | "freq" | "volume" | "offset", v: number | boolean): void {
  const o = oscAt(osc);
  if (!o) return;
  (o as unknown as Record<string, unknown>)[field] = v;
  onFieldChange();
}
function oscAt(osc: (typeof OSC_IDS)[number]) {
  return unit()?.[osc] ?? null;
}

// エンベロープ点数 (0..3) の変更 (undo 1エントリ + 配列長を合わせる)
function onEnveNumChange(v: number): void {
  const u = unit();
  if (!u) return;
  editNoise(() => {
    const target = Math.max(0, Math.min(3, Math.round(v)));
    u.enveNum = target;
    while (u.enves.length < target) u.enves.push({ x: 0, y: 0 });
    u.enves.length = target;
  });
  touch();
}

// エンベロープ: 秒 (x/1000) と % (y)。本家 dlg_Noise_Design の
// IDC_ENVELOPE_SEC_* / IDC_ENVELOPE_VOL_* と同じ表示単位
function setEnveSec(i: number, raw: string): void {
  const u = unit();
  if (!u || !u.enves[i]) return;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return;
  u.enves[i]!.x = Math.max(0, Math.min(10000, Math.round(v * 1000)));
  onFieldChange();
}
function setEnvePct(i: number, raw: string): void {
  const u = unit();
  if (!u || !u.enves[i]) return;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return;
  u.enves[i]!.y = Math.max(0, Math.min(100, Math.round(v)));
  onFieldChange();
}

// undo/redo (メニュー) 後の再描画
watch(
  () => [noise.value?.undoStack.length, noise.value?.redoStack.length],
  () => touch(),
);

// ---- ビルド / プレビュー ----
const BUILT_SPS = 44100;
const builtPcm = ref<Float32Array | null>(null);
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

// 波形クリック = 単発再生 (ループしない。本家準拠)
function onPcmClick(): void {
  if (builtPcm.value) playPcmOnce(builtPcm.value);
}

function playHistory(i: number): void {
  const e = history.value[i];
  if (e) playPcmOnce(e.pcm);
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

// ---- Space: ビルド済み波形の再生 (未ビルドならビルドして再生) ----
function onKeydown(e: KeyboardEvent): void {
  if (!props.active) return;
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.code !== "Space") return;
  e.preventDefault();
  if (e.repeat) return;
  if (!builtPcm.value) onBuild();
  if (builtPcm.value) playPcmOnce(builtPcm.value);
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

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
      <div class="ne-left">
        <div class="ne-tabs">
          <button
            v-for="l in layerCount"
            :key="l"
            class="ne-tab"
            :class="{ on: activeLayer === l - 1 }"
            @click="activeLayer = l - 1"
          >
            {{ t("noise.layer") }} {{ l }}
          </button>
        </div>
        <div class="ne-layer" @focusin="onFieldFocus" @focusout="onFieldBlur">
          <div class="ne-layer-head">
            <label class="chk">{{ t("noise.enable") }}
              <input
                v-model="unitAt(activeLayer)!.bEnable"
                type="checkbox"
                @change="onFieldChange"
              />
            </label>
            <label>{{ t("noise.pan") }}
              <input
                v-model.number="unitAt(activeLayer)!.pan"
                type="number"
                min="-100"
                max="100"
                class="num"
                @change="onFieldChange"
              />
            </label>
          </div>
          <div class="ne-grid">
            <div class="ne-row ne-head">
              <span class="ne-osc-name" />
              <span>{{ t("noise.type") }}</span>
              <span>{{ t("noise.reverse") }}</span>
              <span>{{ t("noise.freqValue") }}</span>
              <span>{{ t("noise.oscVolume") }}</span>
              <span>{{ t("noise.offset") }}</span>
            </div>
            <div v-for="osc in OSC_IDS" :key="osc" class="ne-row">
              <span class="ne-osc-name">{{ t(`noise.${osc}`) }}</span>
              <select :value="oscAt(osc)!.type" @change="setOsc(osc, 'type', Number(($event.target as HTMLSelectElement).value))">
                <option v-for="(name, wi) in WAVE_TYPE_NAMES" :key="wi" :value="wi">{{ name }}</option>
              </select>
              <input
                type="checkbox"
                :checked="oscAt(osc)!.bRev"
                @change="setOsc(osc, 'bRev', ($event.target as HTMLInputElement).checked)"
              />
              <input
                type="number"
                :value="oscAt(osc)!.freq"
                min="0"
                max="44100"
                class="num"
                @change="setOsc(osc, 'freq', Number(($event.target as HTMLInputElement).value))"
              />
              <input
                type="number"
                :value="oscAt(osc)!.volume"
                min="0"
                max="200"
                class="num"
                @change="setOsc(osc, 'volume', Number(($event.target as HTMLInputElement).value))"
              />
              <input
                type="number"
                :value="oscAt(osc)!.offset"
                min="0"
                max="100"
                class="num"
                @change="setOsc(osc, 'offset', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
          </div>
          <div class="ne-enve">
            <div class="ne-enve-title">
              <span>{{ t("noise.envelope") }}</span>
              <select :value="unitAt(activeLayer)!.enveNum" @change="onEnveNumChange(Number(($event.target as HTMLSelectElement).value))">
                <option :value="0">0</option>
                <option :value="1">1</option>
                <option :value="2">2</option>
                <option :value="3">3</option>
              </select>
            </div>
            <div class="ne-enve-grid">
              <div class="ne-row ne-head">
                <span class="ne-enve-no" />
                <span>%</span>
                <span>{{ t("noise.secUnit") }}</span>
              </div>
              <div v-for="(p, i) in unitAt(activeLayer)!.enves" :key="i" class="ne-row">
                <span class="ne-enve-no">{{ t("noise.envePoint") }}{{ i + 1 }}</span>
                <input
                  type="number"
                  :value="p.y"
                  min="0"
                  max="100"
                  class="num"
                  @change="setEnvePct(i, ($event.target as HTMLInputElement).value)"
                />
                <input
                  type="number"
                  :value="p.x / 1000"
                  min="0"
                  max="10"
                  step="0.001"
                  class="num"
                  @change="setEnveSec(i, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
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

.ne-left {
  width: 460px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ne-tabs {
  display: flex;
  gap: 2px;
}

.ne-tab {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--muted-foreground);
  font-size: 12px;
  padding: 2px 0;
  cursor: pointer;
}

.ne-tab.on {
  background: var(--accent);
  color: var(--accent-foreground);
}

.ne-layer {
  border: 1px solid var(--border);
  background: var(--card);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  font-size: 12px;
  color: var(--muted-foreground);
}

.ne-layer-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chk {
  display: flex;
  align-items: center;
  gap: 3px;
}

.ne-layer label {
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.ne-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ne-row {
  display: grid;
  grid-template-columns: 46px 72px 22px 64px 64px 64px;
  align-items: center;
  gap: 4px;
}

.ne-head {
  font-size: 10px;
  color: var(--muted-foreground);
  border-bottom: 1px dashed var(--border);
  padding-bottom: 2px;
}

.ne-osc-name {
  width: 46px;
  flex: none;
  font-weight: bold;
  color: var(--foreground);
}

.ne-layer select,
.ne-layer input {
  font-size: 12px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  padding: 1px 3px;
  width: 100%;
}

.ne-row input[type="checkbox"] {
  width: 14px;
  height: 14px;
  justify-self: center;
}

.ne-layer .num {
  width: 100%;
}

.ne-enve {
  border-top: 1px dashed var(--border);
  padding-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ne-enve-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ne-enve-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ne-enve-grid .ne-row {
  grid-template-columns: 70px 64px 64px;
}

.ne-enve-no {
  width: 70px;
  flex: none;
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
