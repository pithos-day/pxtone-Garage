<script setup lang="ts">
// Voice エディタの1面分 (A面/B面)。
// 上から Coordinate/Oscillator 切替とプリセット、波形モニター (本家 ptuiWave 準拠の生成波形表示)、
// Vol/Pan/補正値/Release のスライダー、点スライダー (本家 ptuiSines 準拠。
// Coordinate では n 番目の点の y 座標表示として常時表示)、エンベロープ。
// エンベロープは本家 ptuiEnvelope 準拠の「区間長 x + 累積描画」。
import { computed, ref } from "vue";
import FillSlider from "../common/FillSlider.vue";
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
import { Oscillator, VoiceType, type VoiceUnit } from "pxtone-ts";
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
  WAVE_PRESET_TITLE_KEYS,
} from "../../state/voice";
import type { WavePreset } from "../../state/voice";
import { appConfirm } from "../../state/dialog";
import { t } from "../../i18n";

const props = defineProps<{ side: number }>();
const emit = defineEmits<{ (e: "edit"): void }>();

const voice = computed(() => currentVoice());
// rev は再描画トリガー、touch はプレビューキャッシュ破棄を親へ通知する
const { rev, touch } = useEditRev(() => voice.value, () => emit("edit"));

function currentVoiceUnit(): VoiceUnit | null {
  const v = voice.value;
  if (!v) return null;
  const s = Math.min(props.side, v.woice.voiceNum - 1);
  return v.woice.getVoice(s);
}

// 波形タイプは音色の実データから導く。別に状態を持つと、起動時の復元や undo / A・B コピーで
// データとずれる。実体は markRaw のため rev で追従させる
const waveType = computed<"coord" | "overtone">(() => {
  void rev.value;
  return currentVoiceUnit()?.type === VoiceType.Overtone ? "overtone" : "coord";
});


// ドラッグ/フォーカス中は最初の編集時のみ undo を積む (1 ジェスチャ = 1 エントリ)
const dragUndo = useUndoOnce(() => editVoice(() => {}));

// ---- 面ごとのパラメータ (Vol/Pan/補正値/Release) ----
// 本家 ptuiRackFull / ptuiReleaseTime 準拠:
//   Vol     = 0..64 (右クリックで 座標=64 / 倍音=32)
//   Pan     = 0..128 (右クリックで 64)
//   補正値  = (tuning-1)*10000 ∈ ±128 (右クリックで 0 = 1.0)
//   Release = リリース区間長 1..1000 (右クリックで 1)
// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
function setVoiceUnit(fn: (c: VoiceUnit) => void): void {
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
function enveHeadCount(c: VoiceUnit): number {
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
      const hc = enveHeadCount(c);
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
    const hc = enveHeadCount(c);
    if (c.envelope.tailNum > 0 && c.envelope.points[hc]) c.envelope.points[hc]!.x = 1;
  });
}

// ---- 波形タイプ切替 (本家 ptuiWaveHead::_set_wave_tool 準拠。切替時に波形とボリュームをリセット) ----
async function setWaveType(type: "coord" | "overtone"): Promise<void> {
  if (waveType.value === type) return;
  // 本家同様、切替前に確認する (波形とボリュームが初期値に戻るため)
  if (!(await appConfirm(t("confirm.waveType")))) return;
  editVoice(() => {
    const c = currentVoiceUnit();
    if (!c) return;
    applyWaveTypeData(c, type);
  });
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
  const canvas = canvasRect(waveRef);
  const unit = currentVoiceUnit();
  if (!canvas || !unit || unit.type !== VoiceType.Coodinate) return;
  const { x, y } = fieldOffset(canvas.el, e);
  const idx = waveIndexAt(x, y, canvas.w, canvas.h);
  if (e.button === 2) {
    // 右クリック: 点を削除 (点0 は固定なので削除不可)
    if (idx > 0) {
      setVoiceUnit((vc) => {
        vc.wave.points.splice(idx, 1);
        vc.wave.num = vc.wave.points.length;
      });
    }
    return;
  }
  if (e.button !== 0) return;
  if (idx < 0) {
    // 空き領域クリック = 点を追加 (x でソートされた位置に挿入。最大31点 = 本家 ptvFIXNUM_WAVE_POINT)
    const px = coordPxToX(unit, canvas.w, x);
    const py = cursorToWaveY(canvas.h, y, unit.volume);
    if (px <= 0) return; // x=0 は点0 が占有 (本家 _point_add 準拠)
    setVoiceUnit((vc) => {
      if (!insertWavePoint(vc.wave.points, px, py, 31)) return;
      vc.wave.num = vc.wave.points.length;
    });
    return;
  }
  if (idx === 0) return; // 点0 は動かせない (本家 _point_set 準拠)
  waveDrag.value = { idx };
  dragUndo.reset();
  capturePointer(canvas.el, e);
}

function onWavePointerMove(e: PointerEvent): void {
  const d = waveDrag.value;
  if (!d) return;
  const canvas = canvasRect(waveRef);
  const unit = currentVoiceUnit();
  if (!canvas || !unit) return;
  const { x, y } = fieldOffset(canvas.el, e);
  dragUndo.onBegin();
  // 前後の点を越えられないよう x をクランプ (本家 _point_set 準拠)
  const p = unit.wave.points[d.idx];
  if (!p) return;
  p.y = cursorToWaveY(canvas.h, y, unit.volume);
  const nx = coordPxToX(unit, canvas.w, x);
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
function enveDisplay(c: VoiceUnit): {
  head: ReturnType<typeof enveDisplayPoints>;
  headCount: number;
} {
  const headCount = enveHeadCount(c);
  const head = enveDisplayPoints(c.envelope.points, headCount);
  return { head, headCount };
}

// グラフ右端の累積 x (描画・ドラッグで共通)
function enveMaxHeadX(c: VoiceUnit): number {
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
  c: VoiceUnit,
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
  const canvas = canvasRect(enveRef);
  const unit = currentVoiceUnit();
  if (!canvas || !unit) return;
  const { x, y } = fieldOffset(canvas.el, e);
  const hit = envePointAt(unit, canvas.w, canvas.h, x, y);
  if (e.button === 2) {
    // 右クリック: ヘッド点を削除 (本家 _point_delete。有効点が1つのみなら不可)
    if (hit) {
      setVoiceUnit((vc) => enveDeletePoint(vc.envelope.points, enveHeadCount(vc), hit.index));
    }
    return;
  }
  if (e.button !== 0) return;
  if (hit) {
    enveDrag.value = hit;
    dragUndo.reset();
    capturePointer(canvas.el, e);
    return;
  }
  // 空き領域クリック = 点を追加 (累積座標を区間長に変換して挿入)
  const cx = envePxToX(canvas.w, x, enveMaxHeadX(unit));
  const cy = envePxToY(canvas.h, y);
  setVoiceUnit((vc) => enveInsertPoint(vc.envelope.points, enveHeadCount(vc), cx, cy));
}

function onEnvePointerMove(e: PointerEvent): void {
  const d = enveDrag.value;
  if (!d) return;
  const canvas = canvasRect(enveRef);
  const unit = currentVoiceUnit();
  if (!canvas || !unit) return;
  const { x, y } = fieldOffset(canvas.el, e);
  dragUndo.onBegin();
  const cx = envePxToX(canvas.w, x, enveMaxHeadX(unit));
  const cy = envePxToY(canvas.h, y);
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
function canvasRect(canvasRef: { value: HTMLCanvasElement | null }): { el: HTMLCanvasElement; w: number; h: number } | null {
  const el = canvasRef.value;
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
      <div class="seg" role="group" :aria-label="t('voice.waveType')">
        <button type="button" :class="{ on: waveType === 'coord' }" :aria-pressed="waveType === 'coord'" @click="setWaveType('coord')">Coordinate</button>
        <button type="button" :class="{ on: waveType === 'overtone' }" :aria-pressed="waveType === 'overtone'" @click="setWaveType('overtone')">Oscillator</button>
      </div>
      <div class="vsp-presets">
        <button
          v-for="(label, i) in WAVE_PRESET_LABELS"
          :key="i"
          type="button"
          class="chip"
          :title="t(WAVE_PRESET_TITLE_KEYS[i])"
          @click="applyPreset(i as WavePreset)"
        >
          {{ label }}
        </button>
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
    <div class="vsp-params">
      <label class="vsp-param">
        <span class="vsp-plabel">{{ t("voice.volume") }}</span>
        <FillSlider v-model="volumeModel" :min="0" :max="64" @contextmenu.prevent="resetVolume" />
        <span class="vsp-pval">{{ volumeModel }}</span>
      </label>
      <label class="vsp-param">
        <span class="vsp-plabel">{{ t("voice.pan") }}</span>
        <FillSlider v-model="panModel" :min="0" :max="128" :center="64" @contextmenu.prevent="resetPan" />
        <span class="vsp-pval">{{ panModel }}</span>
      </label>
      <label class="vsp-param">
        <span class="vsp-plabel">{{ t("voice.correct") }}</span>
        <FillSlider v-model="correctModel" :min="-128" :max="128" :center="0" @contextmenu.prevent="resetCorrect" />
        <span class="vsp-pval">{{ correctModel }}</span>
      </label>
      <label class="vsp-param">
        <span class="vsp-plabel">{{ t("voice.release") }}</span>
        <FillSlider v-model="releaseModel" :min="0" :max="100" @contextmenu.prevent="resetRelease" />
        <span class="vsp-pval">{{ releaseModel }}</span>
      </label>
    </div>
    <div class="vsp-sines-wrap">
      <div class="vsp-sines-title">{{ waveType === "coord" ? t("voice.pointY") : t("voice.overtone") }}</div>
      <div class="vsp-sines" @focusin="sineUndo.onBegin" @focusout="sineUndo.reset">
        <label v-for="(p, i) in sinePoints" :key="i" class="vsp-sine-row">
          <span class="vsp-sine-no">{{ i + 1 }}</span>
          <FillSlider
            :model-value="p.y"
            :min="-128"
            :max="128"
            :center="0"
            :disabled="waveType === 'coord' && i === 0"
            @update:model-value="setSine(i, $event)"
          />
          <span class="vsp-sine-val">{{ p.y }}</span>
        </label>
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
  gap: var(--space-lg);
  background: var(--muted);
  border-radius: var(--radius);
  padding: var(--space-lg);
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

.vsp-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-left: auto;
}

/* 面ごとのパラメータ (Vol/Pan/補正値/Release のスライダー) */
.vsp-params {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-xs) var(--space-xl);
  flex: none;
  font-size: var(--text-xs);
  color: var(--foreground);
}

.vsp-param {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-width: 0;
}

.vsp-plabel {
  width: 84px;
  flex: none;
  white-space: nowrap;
}

.vsp-pval {
  width: 34px;
  flex: none;
  text-align: right;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.vsp-wave,
.vsp-enve {
  flex: 1;
  min-height: 50px;
  border-radius: calc(var(--radius) - 2px);
}

/* スライダーは常時表示。高さが足りなければ内部スクロール */
.vsp-sines-wrap {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.vsp-sines-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
}

/* 点数が違っても A面 / B面 の波形とエンベロープの位置が揃うよう高さを固定する */
.vsp-sines {
  height: 90px;
  overflow-y: auto;
  padding-right: var(--space-xs);
  display: flex;
  flex-direction: column;
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
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  flex: none;
}

.vsp-sine-val {
  width: 30px;
  text-align: right;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  flex: none;
}
</style>
