<script setup lang="ts">
// Voice エディタの1面分 (A面/B面)。
// 波形の上に Coordinate/Oscillator 切替ボタンと Vol/Pan/補正値/Release のスライダー、
// 波形モニター (本家 ptuiWave 準拠の生成波形表示)、スライダー (本家 ptuiSines 準拠。
// Coordinate では n 番目の点の y 座標表示として常時表示)、下にエンベロープ。
// エンベロープは本家 ptuiEnvelope 準拠の「区間長 x + 累積描画」。
import { computed, ref, watch } from "vue";
import { Volume2, CircleGauge, SlidersVertical, MoveDownRight } from "@lucide/vue";
import { useCanvas } from "../../composables/useCanvas";
import { useEditRev } from "../../composables/useEditRev";
import { useUndoOnce } from "../../composables/useUndo";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
import { capturePointer, fieldOffset, releasePointerCapture } from "../../lib/field";
import {
  WAVE_PAD,
  SAMPLE_NUM,
  coordX,
  coordY,
  coordPxToX,
  cursorToWaveY,
  enveX,
  enveY,
  envePxToX,
  envePxToY,
  enveMaxX,
  nearestPoint,
  waveY,
} from "../../lib/voice-geometry";
import { Oscillator, VoiceType } from "pxtone-ts";
import {
  currentVoice,
  editVoice,
  clampWavePointX,
  insertWavePoint,
  enveDisplayPoints,
  enveInsertPoint,
  enveDeletePoint,
  enveSetHeadPointX,
  applyWavePreset,
  applyWaveTypeData,
  WAVE_PRESET_LABELS,
  WAVE_PRESET_TITLES,
} from "../../state/voice";
import type { WavePreset } from "../../state/voice";
import { t } from "../../i18n";

const props = defineProps<{ side: number }>();
const emit = defineEmits<{ (e: "edit"): void }>();

const voice = computed(() => currentVoice());
// rev は再描画トリガー、touch はプレビューキャッシュ破棄を親へ通知する
const { rev, touch } = useEditRev(() => voice.value, () => emit("edit"));

const waveType = ref<"coord" | "overtone">("coord");

function currentVoiceUnit() {
  const v = voice.value;
  if (!v) return null;
  const s = Math.min(props.side, v.woice.voiceNum - 1);
  return v.woice.getVoice(s);
}

watch(
  () => voice.value,
  (v) => {
    if (!v) return;
    const c = v.woice.getVoice(Math.min(props.side, v.woice.voiceNum - 1));
    waveType.value = c?.type === VoiceType.Overtone ? "overtone" : "coord";
  },
);


// ドラッグ/フォーカス中は最初の編集時のみ undo を積む (1 ジェスチャ = 1 エントリ)
const dragUndo = useUndoOnce(() => editVoice(() => {}));

// ---- 面ごとのパラメータ (Vol/Pan/補正値/Release) ----
// 本家 ptuiRackFull / ptuiReleaseTime 準拠:
//   Vol     = 0..64 (右クリックで 座標=64 / 倍音=32)
//   Pan     = 0..128 (右クリックで 64)
//   補正値  = (tuning-1)*10000 ∈ ±128 (右クリックで 0 = 1.0)
//   Release = リリース区間長 1..1000 (右クリックで 1)
// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
function setVoiceUnit(fn: (c: NonNullable<ReturnType<typeof currentVoiceUnit>>) => void): void {
  editVoice(() => {
    const c = currentVoiceUnit();
    if (c) fn(c);
  });
  touch();
}

// スライダーモデル (Vol/Pan/補正値/Release) の共通ファクトリ。
// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
function makeSliderModel(get: () => number, set: (v: number) => void) {
  return computed({
    get: () => {
      void rev.value;
      return get();
    },
    set,
  });
}

const volumeModel = makeSliderModel(
  () => currentVoiceUnit()?.volume ?? 64,
  (v) => setVoiceUnit((c) => (c.volume = Math.max(0, Math.min(64, Math.round(v))))),
);
const panModel = makeSliderModel(
  () => currentVoiceUnit()?.pan ?? 64,
  (v) => setVoiceUnit((c) => (c.pan = Math.max(0, Math.min(128, Math.round(v))))),
);
const correctModel = makeSliderModel(
  () => Math.round(((currentVoiceUnit()?.tuning ?? 1) - 1) * 10000),
  (v) => setVoiceUnit((c) => (c.tuning = 1 + Math.max(-128, Math.min(128, Math.round(v))) / 10000)),
);

// リリース区間長 (本家 ptuiReleaseTime 準拠)。
// スライダー表示 0..100 ↔ データ 1..1000 (×10)。スライダー 0 はデータ 1 にクランプ (tail は維持)
function enveHeadCount(c: NonNullable<ReturnType<typeof currentVoiceUnit>>): number {
  return c.envelope.headNum + c.envelope.bodyNum;
}
const releaseModel = makeSliderModel(
  () => {
    const c = currentVoiceUnit();
    if (!c) return 0;
    const hc = enveHeadCount(c);
    return c.envelope.tailNum > 0 ? Math.round((c.envelope.points[hc]?.x ?? 0) / 10) : 0;
  },
  (v) =>
    setVoiceUnit((c) => {
      const hc = c.envelope.headNum + c.envelope.bodyNum;
      // 本家 ptuiReleaseTime 準拠: スライダー 0..100 ↔ データ 1..1000 (0 は 1 にクランプ、tail は維持)
      c.envelope.tailNum = Math.max(1, c.envelope.tailNum);
      const p = c.envelope.points[hc] ?? (c.envelope.points[hc] = { x: 0, y: 0 });
      p.x = Math.max(1, Math.min(1000, Math.round(v) * 10));
    }),
);

// 右クリックで本家のデフォルト値に戻す (本家 _volume_default)
function resetVolume(): void {
  setVoiceUnit((c) => (c.volume = c.type === VoiceType.Coodinate ? 64 : 32));
}
function resetPan(): void {
  setVoiceUnit((c) => (c.pan = 64));
}
function resetCorrect(): void {
  setVoiceUnit((c) => (c.tuning = 1));
}
function resetRelease(): void {
  setVoiceUnit((c) => {
    const hc = c.envelope.headNum + c.envelope.bodyNum;
    if (c.envelope.tailNum > 0 && c.envelope.points[hc]) c.envelope.points[hc]!.x = 1;
  });
}

// ---- 波形タイプ切替 (本家 ptuiWaveHead::_set_wave_tool 準拠。切替時に波形とボリュームをリセット) ----
function setWaveType(type: "coord" | "overtone"): void {
  if (waveType.value === type) return;
  // 本家同様、切替前に確認する (波形とボリュームが初期値に戻るため)
  if (!window.confirm(t("confirm.waveType"))) return;
  editVoice(() => {
    const c = currentVoiceUnit();
    if (!c) return;
    applyWaveTypeData(c, type);
  });
  waveType.value = type;
  // スライダー (points 配列) を新しい波形に更新する
  touch();
}

// ---- 波形プリセット (本家 ptuiWavePreset 相当。現在の波形タイプに応じて適用) ----
function applyPreset(preset: WavePreset): void {
  setVoiceUnit((c) => applyWavePreset(c, preset));
}

// ---- 波形モニター ----
const waveRef = ref<HTMLCanvasElement | null>(null);

// 波形モニター: 本家 ptuiWave::_try_update と同様、生成波形 (GetOneSample) を描画する。
// 波形も点も volume 込みで描画し、両者が一致するようにする
function drawWave(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const c = currentVoiceUnit();
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  if (!c) return;
  // 中央線 (y=0)
  ctx.strokeStyle = COLORS.beatLine;
  ctx.beginPath();
  ctx.moveTo(0, h / 2 + 0.5);
  ctx.lineTo(w, h / 2 + 0.5);
  ctx.stroke();

  const osci = new Oscillator();
  osci.readyGetSample(c.wave.points, c.wave.num, c.volume, SAMPLE_NUM, c.wave.reso);
  const bOvertone = c.type === VoiceType.Overtone;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let s = 0; s < SAMPLE_NUM; s++) {
    const x = WAVE_PAD + (s / (SAMPLE_NUM - 1)) * (w - WAVE_PAD * 2);
    const v = bOvertone ? osci.getOneSampleOvertone(s) : osci.getOneSampleCoodinate(s);
    const y = waveY(h, v, bOvertone);
    if (s === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (c.type === VoiceType.Coodinate) {
    // 点 (ドラッグ編集対象。点0 は x=0 固定)。波形と同じ volume スケールで描画する
    ctx.fillStyle = COLORS.textBright;
    for (let i = 0; i < c.wave.num; i++) {
      const p = c.wave.points[i];
      if (!p) continue;
      const x = coordX(c, w, p.x);
      const y = coordY(h, (p.y * c.volume) / 128);
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 2.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

useCanvas(waveRef, drawWave, [() => rev.value, () => voice.value, () => waveType.value]);

// ---- Coordinate の点編集 ----
const waveDrag = ref<{ idx: number } | null>(null);

function waveIndexAt(px: number, py: number, w: number, h: number): number {
  const c = currentVoiceUnit();
  if (!c) return -1;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < c.wave.num; i++) {
    const p = c.wave.points[i];
    if (!p) continue;
    pts.push({ x: coordX(c, w, p.x), y: coordY(h, (p.y * c.volume) / 128) });
  }
  return nearestPoint(pts, px, py);
}

function onWavePointerDown(e: PointerEvent): void {
  const c = canvasRect(waveRef);
  const unit = currentVoiceUnit();
  if (!c || !unit || unit.type !== VoiceType.Coodinate) return;
  const { x, y } = fieldOffset(c.el, e);
  const idx = waveIndexAt(x, y, c.w, c.h);
  if (e.button === 2) {
    // 右クリック: 点を削除 (点0 は固定なので削除不可)
    if (idx > 0) {
      setVoiceUnit((cc) => {
        cc.wave.points.splice(idx, 1);
        cc.wave.num = cc.wave.points.length;
      });
    }
    return;
  }
  if (e.button !== 0) return;
  if (idx < 0) {
    // 空き領域クリック = 点を追加 (x でソートされた位置に挿入。最大31点 = 本家 ptvFIXNUM_WAVE_POINT)
    const px = coordPxToX(unit, c.w, x);
    const py = cursorToWaveY(c.h, y, unit.volume);
    if (px <= 0) return; // x=0 は点0 が占有 (本家 _point_add 準拠)
    setVoiceUnit((cc) => {
      if (!insertWavePoint(cc.wave.points, px, py, 31)) return;
      cc.wave.num = cc.wave.points.length;
    });
    return;
  }
  if (idx === 0) return; // 点0 は動かせない (本家 _point_set 準拠)
  waveDrag.value = { idx };
  dragUndo.reset();
  capturePointer(c.el, e);
}

function onWavePointerMove(e: PointerEvent): void {
  const d = waveDrag.value;
  if (!d) return;
  const c = canvasRect(waveRef);
  const unit = currentVoiceUnit();
  if (!c || !unit) return;
  const { x, y } = fieldOffset(c.el, e);
  dragUndo.onBegin();
  // 前後の点を越えられないよう x をクランプ (本家 _point_set 準拠)
  const p = unit.wave.points[d.idx];
  if (!p) return;
  p.y = cursorToWaveY(c.h, y, unit.volume);
  const nx = coordPxToX(unit, c.w, x);
  p.x = clampWavePointX(unit.wave.points, d.idx, nx, unit.wave.reso);
  touch();
}

function onWavePointerUp(e: PointerEvent): void {
  releasePointerCapture(waveRef.value, e);
  waveDrag.value = null;
  dragUndo.reset();
}

// ---- スライダー (本家 ptuiSines 準拠、y のみ編集) ----
// Coordinate では n 番目の点の y 座標、Oscillator では n 倍音の音量を表す。
// 常時表示し、point[i].y を直接編集する。座標モードの点0 (i=0) は本家 _point_set 同様固定。
// rev に依存させ、波形タイプ切替や undo/redo で points 配列が置き換わっても
// 常に最新の配列を返す (markRaw のため参照の置き換えは reactive 追跡されない)
const sinePoints = computed(() => {
  void rev.value;
  return currentVoiceUnit()?.wave.points ?? [];
});
const sineUndo = useUndoOnce(() => editVoice(() => {}));
function setSine(i: number, v: number): void {
  if (waveType.value === "coord" && i === 0) return; // 座標モードの点0 は固定
  const c = currentVoiceUnit();
  if (!c || !c.wave.points[i]) return;
  c.wave.points[i]!.y = Math.max(-128, Math.min(128, Math.round(v)));
  touch();
}

// ---- エンベロープ (本家 ptuiEnvelope 準拠: x は区間長、表示は累積座標) ----
// 本家と同様、グラフにはヘッド点のみを表示する (リリースは Release スライダーで
// 独立に操作し、エンベロープとは影響し合わない)
const enveRef = ref<HTMLCanvasElement | null>(null);

// ヘッド表示点 (累積座標) を返す
function enveDisplay(c: NonNullable<ReturnType<typeof currentVoiceUnit>>): {
  head: ReturnType<typeof enveDisplayPoints>;
  headCount: number;
} {
  const headCount = enveHeadCount(c);
  const head = enveDisplayPoints(c.envelope.points, headCount);
  return { head, headCount };
}

// グラフ右端の累積 x (描画・ドラッグで共通)
function enveMaxHeadX(c: NonNullable<ReturnType<typeof currentVoiceUnit>>): number {
  const { head } = enveDisplay(c);
  return enveMaxX(head.length ? head[head.length - 1]!.x : 0);
}

function drawEnve(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const c = currentVoiceUnit();
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  if (!c) return;
  const { head } = enveDisplay(c);
  const maxX = enveMaxHeadX(c);
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < head.length; i++) {
    const p = head[i]!;
    const x = enveX(w, p.x, maxX);
    const y = enveY(h, p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.arc(x, y, 3, 0, Math.PI * 2);
  }
  // サステイン (本家 _try_update と同様、最後のヘッド点の y をグラフ右端まで水平に引く)
  if (head.length) {
    const last = head[head.length - 1]!;
    ctx.lineTo(w - WAVE_PAD, enveY(h, last.y));
  }
  ctx.stroke();
  fillText(ctx, t("voice.envelope"), WAVE_PAD + 2, WAVE_PAD + 8, COLORS.textDim, 10);
}

useCanvas(enveRef, drawEnve, [() => rev.value, () => voice.value]);

const enveDrag = ref<{ index: number } | null>(null);

function envePointAt(
  c: NonNullable<ReturnType<typeof currentVoiceUnit>>,
  w: number,
  h: number,
  px: number,
  py: number,
): { index: number } | null {
  const { head } = enveDisplay(c);
  const maxX = enveMaxHeadX(c);
  const i = nearestPoint(
    head.map((p) => ({ x: enveX(w, p.x, maxX), y: enveY(h, p.y) })),
    px,
    py,
  );
  return i >= 0 ? { index: head[i]!.index } : null;
}

function onEnvePointerDown(e: PointerEvent): void {
  const c = canvasRect(enveRef);
  const unit = currentVoiceUnit();
  if (!c || !unit) return;
  const { x, y } = fieldOffset(c.el, e);
  const hit = envePointAt(unit, c.w, c.h, x, y);
  if (e.button === 2) {
    // 右クリック: ヘッド点を削除 (本家 _point_delete。有効点が1つのみなら不可)
    if (hit) {
      setVoiceUnit((cc) => enveDeletePoint(cc.envelope.points, enveHeadCount(cc), hit.index));
    }
    return;
  }
  if (e.button !== 0) return;
  if (hit) {
    enveDrag.value = hit;
    dragUndo.reset();
    capturePointer(c.el, e);
    return;
  }
  // 空き領域クリック = 点を追加 (累積座標を区間長に変換して挿入)
  const cx = envePxToX(c.w, x, enveMaxHeadX(unit));
  const cy = envePxToY(c.h, y);
  setVoiceUnit((cc) => enveInsertPoint(cc.envelope.points, enveHeadCount(cc), cx, cy));
}

function onEnvePointerMove(e: PointerEvent): void {
  const d = enveDrag.value;
  if (!d) return;
  const c = canvasRect(enveRef);
  const unit = currentVoiceUnit();
  if (!c || !unit) return;
  const { x, y } = fieldOffset(c.el, e);
  dragUndo.onBegin();
  const cx = envePxToX(c.w, x, enveMaxHeadX(unit));
  const cy = envePxToY(c.h, y);
  // ドラッグ中の移動は undo を積まず直接書き換える (undo はジェスチャ先頭の1回)。
  // 前後の点を乗り越えられないよう累積座標でクランプして区間長へ変換
  enveSetHeadPointX(unit.envelope.points, enveHeadCount(unit), d.index, cx);
  unit.envelope.points[d.index]!.y = cy;
  touch();
}

function onEnvePointerUp(e: PointerEvent): void {
  releasePointerCapture(enveRef.value, e);
  enveDrag.value = null;
  dragUndo.reset();
}

// ---- canvas 共通ヘルパ ----
// canvas と CSS サイズを取得する (ポインタ座標は lib/field の fieldOffset で算出)
function canvasRect(ref: { value: HTMLCanvasElement | null }): { el: HTMLCanvasElement; w: number; h: number } | null {
  const el = ref.value;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { el, w: r.width, h: r.height };
}
</script>

<template>
  <!-- data-rev: markRaw の実体を直接書き換えるため rev 変化で再レンダリングを駆動する -->
  <div class="vsp" :data-rev="rev">
    <div class="vsp-header">
      <span class="vsp-side">{{ side === 0 ? t("voice.sideA") : t("voice.sideB") }}</span>
      <div class="vsp-wavetype">
        <button class="btn btn-sm mode" :class="{ on: waveType === 'coord' }" @click="setWaveType('coord')">Coordinate</button>
        <button class="btn btn-sm mode" :class="{ on: waveType === 'overtone' }" @click="setWaveType('overtone')">Oscillator</button>
      </div>
      <div class="vsp-presets">
        <button
          v-for="(label, i) in WAVE_PRESET_LABELS"
          :key="i"
          class="btn btn-sm vsp-preset"
          :title="WAVE_PRESET_TITLES[i]"
          @click="applyPreset(i as WavePreset)"
        >
          {{ label }}
        </button>
      </div>
    </div>
    <div class="vsp-params">
      <div class="vsp-param">
        <span class="vsp-plabel" :title="t('voice.volume')"><Volume2 :size="12" /></span>
        <input type="range" class="vsp-prange" min="0" max="64" step="1" v-model.number="volumeModel" @contextmenu.prevent="resetVolume" />
        <span class="vsp-pval">{{ volumeModel }}</span>
      </div>
      <div class="vsp-param">
        <span class="vsp-plabel" :title="t('voice.pan')"><CircleGauge :size="12" /></span>
        <input type="range" class="vsp-prange" min="0" max="128" step="1" v-model.number="panModel" @contextmenu.prevent="resetPan" />
        <span class="vsp-pval">{{ panModel }}</span>
      </div>
      <div class="vsp-param">
        <span class="vsp-plabel" :title="t('voice.correct')"><SlidersVertical :size="12" /></span>
        <input type="range" class="vsp-prange" min="-128" max="128" step="1" v-model.number="correctModel" @contextmenu.prevent="resetCorrect" />
        <span class="vsp-pval">{{ correctModel }}</span>
      </div>
      <div class="vsp-param">
        <span class="vsp-plabel" :title="t('voice.release')"><MoveDownRight :size="12" /></span>
        <input type="range" class="vsp-prange" min="0" max="100" step="1" v-model.number="releaseModel" @contextmenu.prevent="resetRelease" />
        <span class="vsp-pval">{{ releaseModel }}</span>
      </div>
    </div>
    <canvas
      ref="waveRef"
      class="field-canvas vsp-wave"
      @pointerdown="onWavePointerDown"
      @pointermove="onWavePointerMove"
      @pointerup="onWavePointerUp"
      @pointercancel="onWavePointerUp"
      @contextmenu.prevent
    />
    <div class="vsp-sines" @focusin="sineUndo.onBegin" @focusout="sineUndo.reset">
      <div v-for="(p, i) in sinePoints" :key="i" class="vsp-sine-row">
        <span class="vsp-sine-no">{{ i + 1 }}</span>
        <input
          type="range"
          class="vsp-sine-range"
          min="-128"
          max="128"
          step="1"
          :value="p.y"
          :disabled="waveType === 'coord' && i === 0"
          @input="setSine(i, Number(($event.target as HTMLInputElement).value))"
        />
        <span class="vsp-sine-val">{{ p.y }}</span>
      </div>
    </div>
    <canvas
      ref="enveRef"
      class="field-canvas vsp-enve"
      @pointerdown="onEnvePointerDown"
      @pointermove="onEnvePointerMove"
      @pointerup="onEnvePointerUp"
      @pointercancel="onEnvePointerUp"
      @contextmenu.prevent
    />
  </div>
</template>

<style scoped>
.vsp {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  border: 1px solid var(--border);
  background: var(--background);
  padding: 4px;
}

.vsp-header {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-wrap: wrap;
  user-select: none;
  flex: none;
}

.vsp-side {
  font-size: var(--text-lg);
  font-weight: bold;
  color: var(--foreground);
}

.vsp-wavetype {
  display: flex;
  gap: var(--space-2xs);
}

.vsp-presets {
  display: flex;
  gap: var(--space-2xs);
}

.vsp-preset {
  font-size: var(--text-xs);
  padding: 0 5px;
}

/* 面ごとのパラメータ (Vol/Pan/補正値/Release のスライダー) */
.vsp-params {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  flex: none;
  font-size: var(--text-xs);
  color: var(--muted-foreground);
}

.vsp-param {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.vsp-plabel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  flex: none;
  color: var(--foreground);
}

.vsp-prange,
.vsp-sine-range {
  flex: 1;
  min-width: 0;
  accent-color: var(--primary);
}

.vsp-pval {
  width: 34px;
  flex: none;
  text-align: right;
  font-size: var(--text-xs);
}

.vsp-wave,
.vsp-enve {
  flex: 1;
  min-height: 50px;
}

/* スライダーは常時表示。高さが足りなければ内部スクロール */
.vsp-sines {
  flex: none;
  max-height: 150px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  border-top: 1px dashed var(--border);
  border-bottom: 1px dashed var(--border);
}

.vsp-sine-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  height: 18px;
  flex: none;
}

.vsp-sine-no {
  width: 20px;
  text-align: right;
  font-size: var(--text-xs);
  color: var(--muted-foreground);
  flex: none;
}

.vsp-sine-range {
  flex: 1;
  min-width: 0;
  accent-color: var(--primary);
}

.vsp-sine-range:disabled {
  opacity: 0.4;
}

.vsp-sine-val {
  width: 30px;
  text-align: right;
  font-size: var(--text-xs);
  color: var(--muted-foreground);
  flex: none;
}
</style>
