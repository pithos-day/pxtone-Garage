<script setup lang="ts">
// ptNoise (PTN ノイズエディタ)。
// 上段にレイヤー1..4 を縦に並べ、下段に波形と History を置く。
// 画面が低いときは波形側を縮め、レイヤーはスクロールなしで全て見せる。
// ビルドボタンは廃止し、編集が 250ms デバウンスでリアルタイムに波形へ反映される。
// 波形クリック / Space で単発再生 (ループしない。本家 PcmTable_BuildAndPlay 準拠)。
// History リスト、WAV 書き出しを提供する。
import { computed, onMounted, ref, watch } from "vue";
import { useEditRev } from "../../composables/useEditRev";
import { useGlobalKeys } from "../../composables/useGlobalKeys";
import { useDebounced } from "../../composables/useDebounced";
import { useUndoOnce } from "../../composables/useUndo";
import { NOISE_BUILT_SPS, secToEnveX, pctToEnveY, type NoiseEnvePoint } from "../../lib/noise";
import { WaveType } from "pxtone-ts";
import { ChevronLeft, ChevronRight, Play } from "@lucide/vue";
import KnobControl from "../common/KnobControl.vue";
import NoiseEnvelopeGraph from "./NoiseEnvelopeGraph.vue";
import NoisePcmView from "./NoisePcmView.vue";
import NoiseWaveTypeSelect from "./NoiseWaveTypeSelect.vue";
import { currentNoise, newNoise, editNoise, restoreNoiseHistory, pushNoiseHistory, NOISE_UNIT_NUM, NOISE_ENVE_NUM, resizeNoiseEnves } from "../../state/noise";
import { isModalOpen } from "../../state/ui";
import { renderNoise, playPcmOnce } from "../../engine/preview";
import { t } from "../../i18n";

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

// テーブル編集は直接 Noise を書き、undo はフォーカスの間の最初の変更で1エントリ積む。
// (フォーカスしただけでは積まない。未編集のタブが未保存扱いになるため)
// (markRaw なので reactive にならない。rev はテンプレートの :data-rev で再描画を駆動)
const fieldUndo = useUndoOnce(() => editNoise(() => {}));
// 入力欄とチェックボックスは v-model / @change が実体を書き換える前に積む (input の捕捉は
// それより先に届く)。SELECT は onEnveNumChange が自分で undo を積む
function onFieldInputCapture(e: Event): void {
  if ((e.target as HTMLElement).tagName !== "SELECT") fieldUndo.onBegin();
}
function onFieldChange(): void {
  const d = noise.value;
  if (d) {
    // 公式の範囲クランプを適用 (freq 0..44100, volume 0..200, offset 0..100, pan ±100, enve x/y)
    d.noise.fix();
  }
  touch();
  scheduleEditBuild();
}

// オシレータの値を直接書き換え (undo はフォーカスの間に1エントリ)。
// field は "type" | "bRev" が非数値、それ以外 (freq/volume/offset) は数値
function setOsc(u: number, osc: (typeof OSC_IDS)[number], field: "type" | "bRev" | "freq" | "volume" | "offset", v: number | boolean): void {
  const o = unitAt(u)?.[osc];
  if (!o) return;
  fieldUndo.onBegin();
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
  fieldUndo.onBegin();
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
</script>

<template>
  <div class="noise-editor">
    <div v-if="!noise" class="editor-empty">
      <h2>{{ t("noise.title") }}</h2>
      <p>{{ t("noise.empty") }}</p>
      <button class="btn btn-accent" @click="newNoise()">{{ t("menu.file.new") }}</button>
    </div>
    <div v-else class="ne-main" :data-rev="rev">
      <div class="ne-layers" @input.capture="onFieldInputCapture" @focusout="fieldUndo.reset">
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
        <NoisePcmView :pcm="builtPcm" @play="onPcmClick" />
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

  .ne-history {
    width: auto;
    height: 200px;
  }
}
</style>
