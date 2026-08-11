<script setup lang="ts">
// ptNoise (PTN ノイズエディタ)。
// レイヤー1..4 を全て縦に表示 (1画面に収まるようコンパクト化)。
// ビルドボタンは廃止し、編集が 250ms デバウンスでリアルタイムに波形へ反映される。
// 波形クリック / Space で単発再生 (ループしない。本家 PcmTable_BuildAndPlay 準拠)。
// History リスト、WAV 書き出しを提供する。
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { useUndoRedoRedraw } from "../../composables/useUndoRedoRedraw";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
import { MemoryIo, WaveType } from "pxtone-ts";
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

// 全レイヤーを縦に並べる (read 直後は有効ユニット数ぶん)
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

// レイヤー行モデル。テンプレートでの unitAt(u)! を script 側の非 null 保証に
// 追い出し、v-for の対象を unitList (index のみ) から行オブジェクトに変える
const unitRows = computed(() =>
  unitList.value.map((u) => ({ index: u, unit: noise.value!.noise.getUnit(u)! })),
);

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
  scheduleRebuild();
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

// エンベロープ点数 (0..3) の変更 (undo 1エントリ + 配列長を合わせる)
function onEnveNumChange(u: number, v: number): void {
  const unit = unitAt(u);
  if (!unit) return;
  editNoise(() => {
    const target = Math.max(0, Math.min(3, Math.round(v)));
    unit.enveNum = target;
    while (unit.enves.length < target) unit.enves.push({ x: 0, y: 0 });
    unit.enves.length = target;
  });
  touch();
  scheduleRebuild();
}

// エンベロープ: 秒 (x/1000) と % (y)。本家 dlg_Noise_Design の
// IDC_ENVELOPE_SEC_* / IDC_ENVELOPE_VOL_* と同じ表示単位
function setEnveSec(u: number, i: number, raw: string): void {
  const unit = unitAt(u);
  if (!unit || !unit.enves[i]) return;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return;
  unit.enves[i]!.x = Math.max(0, Math.min(10000, Math.round(v * 1000)));
  onFieldChange();
}
function setEnvePct(u: number, i: number, raw: string): void {
  const unit = unitAt(u);
  if (!unit || !unit.enves[i]) return;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return;
  unit.enves[i]!.y = Math.max(0, Math.min(100, Math.round(v)));
  onFieldChange();
}

// undo/redo (メニュー) 後もリアルタイム反映する
useUndoRedoRedraw(() => noise.value, () => {
  touch();
  scheduleRebuild();
});

// ---- リアルタイムビルド (250ms デバウンス) ----
const BUILT_SPS = 44100;
const builtPcm = ref<Float32Array | null>(null);
const buildError = ref("");
let rebuildTimer: number | null = null;

interface HistoryEntry {
  label: string;
  bytes: Uint8Array;
  pcm: Float32Array;
}
const history = ref<HistoryEntry[]>([]);
let lastHistoryAt = 0;

// 編集をデバウンスして波形へ反映する
function scheduleRebuild(): void {
  if (rebuildTimer !== null) clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = null;
    rebuild();
  }, 250);
}

function rebuild(): void {
  const d = noise.value;
  if (!d) return;
  const pcm = renderNoise(d.noise, BUILT_SPS);
  if (!pcm) {
    buildError.value = t("error.noiseBuild");
    return;
  }
  buildError.value = "";
  builtPcm.value = pcm;
  pushHistory();
  touch();
}

// History 記録。連続編集 (2秒以内の再ビルド) は直前のエントリを置き換える
function pushHistory(): void {
  const d = noise.value;
  if (!d || !builtPcm.value) return;
  const io = new MemoryIo();
  d.noise.write(io);
  const label = new Date().toLocaleTimeString("ja-JP", { hour12: false });
  const entry: HistoryEntry = { label, bytes: io.toUint8Array(), pcm: builtPcm.value };
  const now = Date.now();
  if (history.value.length > 0 && now - lastHistoryAt < 2000) {
    history.value[0] = entry;
  } else {
    history.value.unshift(entry);
    if (history.value.length > 30) history.value.length = 30;
  }
  lastHistoryAt = now;
}

// 波形クリック = 単発再生 (ループしない。本家準拠)
function onPcmClick(): void {
  if (builtPcm.value) playPcmOnce(builtPcm.value);
}

function playHistory(i: number): void {
  const e = history.value[i];
  if (e) playPcmOnce(e.pcm);
}

// ダブルクリックでエディタに反映 (undo 1エントリ + 再ビルド)
function applyHistory(i: number): void {
  const d = noise.value;
  const e = history.value[i];
  if (!d || !e) return;
  editNoise(() => {
    d.noise.read(new MemoryIo(e.bytes));
  });
  touch();
  scheduleRebuild();
}

function onSaveWav(): void {
  const d = noise.value;
  if (!d) return;
  const err = exportNoiseWav(d.noise, d.fileName || "untitled");
  if (err) buildError.value = err;
}

// ---- Space: ビルド済み波形の再生 (未反映なら即ビルドして再生) ----
function onKeydown(e: KeyboardEvent): void {
  if (!props.active) return;
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.code !== "Space") return;
  e.preventDefault();
  if (e.repeat) return;
  if (!builtPcm.value) rebuild();
  if (builtPcm.value) playPcmOnce(builtPcm.value);
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  // 開いた直後にも波形を表示する
  scheduleRebuild();
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  if (rebuildTimer !== null) clearTimeout(rebuildTimer);
});

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
      <div class="ne-layers" @focusin="onFieldFocus" @focusout="onFieldBlur">
        <div v-for="row in unitRows" :key="row.index" class="ne-layer">
          <div class="ne-layer-head">
            <span class="ne-layer-name">{{ t("noise.layer") }} {{ row.index + 1 }}</span>
            <label class="chk">{{ t("noise.enable") }}
              <input v-model="row.unit.bEnable" type="checkbox" @change="onFieldChange" />
            </label>
            <label>{{ t("noise.pan") }}
              <input v-model.number="row.unit.pan" type="number" min="-100" max="100" class="num" @change="onFieldChange" />
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
              <select :value="row.unit[osc].type" @change="setOsc(row.index, osc, 'type', Number(($event.target as HTMLSelectElement).value))">
                <option v-for="(name, wi) in WAVE_TYPE_NAMES" :key="wi" :value="wi">{{ name }}</option>
              </select>
              <input
                type="checkbox"
                :checked="row.unit[osc].bRev"
                @change="setOsc(row.index, osc, 'bRev', ($event.target as HTMLInputElement).checked)"
              />
              <input
                type="number"
                :value="row.unit[osc].freq"
                min="0"
                max="44100"
                class="num"
                @change="setOsc(row.index, osc, 'freq', Number(($event.target as HTMLInputElement).value))"
              />
              <input
                type="number"
                :value="row.unit[osc].volume"
                min="0"
                max="200"
                class="num"
                @change="setOsc(row.index, osc, 'volume', Number(($event.target as HTMLInputElement).value))"
              />
              <input
                type="number"
                :value="row.unit[osc].offset"
                min="0"
                max="100"
                class="num"
                @change="setOsc(row.index, osc, 'offset', Number(($event.target as HTMLInputElement).value))"
              />
            </div>
          </div>
          <div class="ne-enve">
            <span class="ne-enve-title">{{ t("noise.envelope") }}</span>
            <select :value="row.unit.enveNum" @change="onEnveNumChange(row.index, Number(($event.target as HTMLSelectElement).value))">
              <option :value="0">0</option>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
            </select>
            <template v-for="(p, i) in row.unit.enves" :key="i">
              <span class="ne-enve-no">{{ t("noise.envePoint") }}{{ i + 1 }}</span>
              <input
                type="number"
                class="num ne-enve-pct"
                :value="p.y"
                min="0"
                max="100"
                title="%"
                @change="setEnvePct(row.index, i, ($event.target as HTMLInputElement).value)"
              />
              <input
                type="number"
                class="num ne-enve-sec"
                :value="p.x / 1000"
                min="0"
                max="10"
                step="0.001"
                title="秒"
                @change="setEnveSec(row.index, i, ($event.target as HTMLInputElement).value)"
              />
            </template>
          </div>
        </div>
      </div>
      <div class="ne-preview">
        <div class="ne-build-row">
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

/* 全レイヤーを縦に並べる。収まらない場合はこの列だけスクロール */
.ne-layers {
  width: 520px;
  flex: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.ne-layer {
  border: 1px solid var(--border);
  background: var(--card);
  padding: 3px 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: none;
}

.ne-layer-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ne-layer-name {
  font-weight: bold;
  color: var(--foreground);
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
  gap: 1px;
}

.ne-row {
  display: grid;
  grid-template-columns: 46px 72px 22px 60px 60px 60px;
  align-items: center;
  gap: 4px;
}

.ne-head {
  font-size: 9px;
  color: var(--muted-foreground);
  border-bottom: 1px dashed var(--border);
  padding-bottom: 1px;
}

.ne-osc-name {
  width: 46px;
  flex: none;
  font-weight: bold;
  color: var(--foreground);
  font-size: 10px;
}

.ne-layer select,
.ne-layer input {
  font-size: 11px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  padding: 0 2px;
  width: 100%;
  height: 17px;
}

.ne-row input[type="checkbox"] {
  width: 13px;
  height: 13px;
  justify-self: center;
}

.ne-enve {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  border-top: 1px dashed var(--border);
  padding-top: 2px;
}

.ne-enve-title {
  font-weight: bold;
  color: var(--foreground);
  font-size: 10px;
}

.ne-enve select {
  width: 30px;
}

.ne-enve-no {
  color: var(--muted-foreground);
  font-size: 10px;
}

.ne-enve .ne-enve-pct {
  width: 34px;
}

.ne-enve .ne-enve-sec {
  width: 44px;
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

/* 1画面に収めるため波形は小さめに固定 */
.ne-wave {
  flex: none;
  height: 140px;
  cursor: pointer;
}

.ne-history {
  flex: 1;
  min-height: 0;
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
