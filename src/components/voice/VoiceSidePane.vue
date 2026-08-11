<script setup lang="ts">
// Voice エディタの1面分 (A面/B面)。
// 波形の上に Coordinate/Oscillator 切替ボタンと音量/パン/チューニング/基本キー、
// 波形モニター (本家 ptuiWave 準拠の生成波形表示)、倍音スライダー (本家 ptuiSines
// 準拠。Coordinate では n 番目の点の y 座標表示として常時表示)、下にエンベロープ。
import { computed, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
import { Oscillator, VoiceType } from "pxtone-ts";
import type { PulsePoint } from "pxtone-ts";
import { currentVoice, editVoice, clampWavePointX, insertWavePoint } from "../../state/voice";
import { t } from "../../i18n";

const props = defineProps<{ side: number }>();
const emit = defineEmits<{ (e: "edit"): void }>();

const voice = computed(() => currentVoice());
const rev = ref(0);
function touch(): void {
  rev.value++;
  emit("edit"); // プレビューキャッシュ破棄用に親へ通知
}

const waveType = ref<"coord" | "overtone">("coord");

function vc() {
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

// undo/redo (メニュー) 後の再描画
watch(
  () => [voice.value?.undoStack.length, voice.value?.redoStack.length],
  () => touch(),
);

let dragUndoPushed = false;
function beginDragUndo(): void {
  if (dragUndoPushed) return;
  dragUndoPushed = true;
  editVoice(() => {});
}

// ---- 面ごとのパラメータ (ボリューム/パン/チューニング/基本キー) ----
// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
function setVoiceUnit(fn: (c: NonNullable<ReturnType<typeof vc>>) => void): void {
  editVoice(() => {
    const c = vc();
    if (c) fn(c);
  });
  touch();
}

const volumeModel = computed({
  get: () => {
    void rev.value;
    return vc()?.volume ?? 64;
  },
  set: (v: number) => setVoiceUnit((c) => (c.volume = Math.max(0, Math.min(128, Math.round(v))))),
});
const panModel = computed({
  get: () => {
    void rev.value;
    return vc()?.pan ?? 64;
  },
  set: (v: number) => setVoiceUnit((c) => (c.pan = Math.max(0, Math.min(128, Math.round(v))))),
});
const tuningModel = computed({
  get: () => {
    void rev.value;
    return vc()?.tuning ?? 1;
  },
  set: (v: number) => setVoiceUnit((c) => (c.tuning = Math.max(0.1, Math.min(4, v)))),
});
const basicKeyModel = computed({
  get: () => {
    void rev.value;
    return (vc()?.basicKey ?? 0x4500) / 256;
  },
  set: (v: number) => setVoiceUnit((c) => (c.basicKey = Math.max(0, Math.min(127, Math.round(v))) * 256)),
});

// ---- 波形タイプ切替 (本家同様、切替時に波形をリセットする) ----
function setWaveType(type: "coord" | "overtone"): void {
  if (waveType.value === type) return;
  waveType.value = type;
  editVoice(() => {
    const c = vc();
    if (!c) return;
    if (type === "overtone") {
      c.type = VoiceType.Overtone;
      c.wave.reso = 0;
      c.wave.num = 31;
      c.wave.points = [];
      for (let i = 0; i < 31; i++) c.wave.points.push({ x: i + 1, y: 0 });
      c.wave.points[0]!.y = 128;
    } else {
      c.type = VoiceType.Coodinate;
      c.wave.reso = 256;
      c.wave.num = 3;
      c.wave.points = [
        { x: 0, y: 0 },
        { x: 64, y: 64 },
        { x: 192, y: -64 },
      ];
    }
  });
}

// ---- 波形モニター ----
const waveRef = ref<HTMLCanvasElement | null>(null);
const WAVE_PAD = 12;
const SAMPLE_NUM = 256; // 本家 SCREEN_WAVE_MAIN 相当のサンプル数

function coordX(c: NonNullable<ReturnType<typeof vc>>, w: number, x: number): number {
  return WAVE_PAD + (x / c.wave.reso) * (w - WAVE_PAD * 2);
}
function coordY(h: number, y: number): number {
  return h / 2 - (y / 128) * (h / 2 - WAVE_PAD);
}
function coordPxToX(c: NonNullable<ReturnType<typeof vc>>, w: number, px: number): number {
  return Math.max(0, Math.min(c.wave.reso, Math.round(((px - WAVE_PAD) / (w - WAVE_PAD * 2)) * c.wave.reso)));
}
function coordPxToY(h: number, py: number): number {
  return Math.max(-128, Math.min(127, Math.round(((h / 2 - py) / (h / 2 - WAVE_PAD)) * 128)));
}

// 波形モニター: 本家 ptuiWave::_try_update と同様、生成波形 (GetOneSample) を描画する。
// サンプル位置は点の座標系 (WAVE_PAD..w-WAVE_PAD) と一致させる
function drawWave(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const c = vc();
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
    const y = h / 2 - v * (h / 2 - WAVE_PAD);
    if (s === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  if (c.type === VoiceType.Coodinate) {
    // 点 (ドラッグ編集対象。点0 は x=0 固定)
    ctx.fillStyle = COLORS.textBright;
    for (let i = 0; i < c.wave.num; i++) {
      const p = c.wave.points[i];
      if (!p) continue;
      const x = coordX(c, w, p.x);
      const y = coordY(h, p.y);
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
  const c = vc();
  if (!c) return -1;
  let best = -1;
  let bestD = 10;
  for (let i = 0; i < c.wave.num; i++) {
    const p = c.wave.points[i];
    if (!p) continue;
    const x = coordX(c, w, p.x);
    const y = coordY(h, p.y);
    const d = Math.hypot(px - x, py - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function onWavePointerDown(e: PointerEvent): void {
  const c = canvasRect(waveRef);
  const c2 = vc();
  if (!c || !c2 || c2.type !== VoiceType.Coodinate) return;
  const { x, y } = relPos(e, c);
  const idx = waveIndexAt(x, y, c.w, c.h);
  if (e.button === 2) {
    // 右クリック: 点を削除 (点0 は固定なので削除不可)
    if (idx > 0) setVoiceUnit((cc) => (cc.wave.points.splice(idx, 1), (cc.wave.num = cc.wave.points.length)));
    return;
  }
  if (e.button !== 0) return;
  if (idx < 0) {
    // 空き領域クリック = 点を追加 (x でソートされた位置に挿入。最大31点 = 本家 ptvFIXNUM_WAVE_POINT)
    const px = coordPxToX(c2, c.w, x);
    const py = coordPxToY(c.h, y);
    if (px <= 0) return; // x=0 は点0 が占有 (本家 _point_add 準拠)
    setVoiceUnit((cc) => {
      if (!insertWavePoint(cc.wave.points, px, py, 31)) return;
      cc.wave.num = cc.wave.points.length;
    });
    return;
  }
  if (idx === 0) return; // 点0 は動かせない (本家 _point_set 準拠)
  waveDrag.value = { idx };
  dragUndoPushed = false;
  canvasRefSetCapture(waveRef, e);
}

function onWavePointerMove(e: PointerEvent): void {
  const d = waveDrag.value;
  if (!d) return;
  const c = canvasRect(waveRef);
  const c2 = vc();
  if (!c || !c2) return;
  const { x, y } = relPos(e, c);
  beginDragUndo();
  // 前後の点を越えられないよう x をクランプ (本家 _point_set 準拠)
  const p = c2.wave.points[d.idx];
  if (!p) return;
  p.y = coordPxToY(c.h, y);
  const nx = coordPxToX(c2, c.w, x);
  p.x = clampWavePointX(c2.wave.points, d.idx, nx, c2.wave.reso);
  touch();
}

function onWavePointerUp(e: PointerEvent): void {
  if (canvasHasCapture(waveRef, e)) releaseCapture(waveRef, e);
  waveDrag.value = null;
  dragUndoPushed = false;
}

// ---- スライダー (本家 ptuiSines 準拠、y のみ編集) ----
// Coordinate では n 番目の点の y 座標、Oscillator では n 倍音の音量を表す。
// 常時表示し、point[i].y を直接編集する。編集後は :data-rev でテンプレートを
// 再描画してスライダー位置・数値を更新する
const sinePoints = computed(() => vc()?.wave.points ?? []);
let sineUndoPushed = false;

function onSineFocus(): void {
  if (sineUndoPushed) return;
  sineUndoPushed = true;
  editVoice(() => {});
}
function onSineBlur(): void {
  sineUndoPushed = false;
}
function setSine(i: number, v: number): void {
  const c = vc();
  if (!c || !c.wave.points[i]) return;
  c.wave.points[i]!.y = Math.max(-128, Math.min(128, Math.round(v)));
  touch();
}

// ---- エンベロープ ----
const enveRef = ref<HTMLCanvasElement | null>(null);

// 有効なヘッド点 (x/y が非ゼロ、または最初の点) とリリース点を返す
function enveParts(c: NonNullable<ReturnType<typeof vc>>): { head: PulsePoint[]; release: PulsePoint | null } {
  const e = c.envelope;
  const headCount = e.headNum + e.bodyNum;
  const head: PulsePoint[] = [];
  for (let i = 0; i < headCount; i++) {
    const p = e.points[i];
    if (!p) continue;
    if (i === 0 || p.x || p.y) head.push(p);
  }
  const rel = e.tailNum > 0 ? e.points[headCount] ?? null : null;
  return { head, release: rel };
}

function enveMaxX(c: NonNullable<ReturnType<typeof vc>>): number {
  const { head, release } = enveParts(c);
  let m = release?.x ?? 0;
  for (const p of head) m = Math.max(m, p.x);
  return Math.max(100, m * 1.2);
}

function enveX(c: NonNullable<ReturnType<typeof vc>>, w: number, x: number): number {
  return WAVE_PAD + (x / enveMaxX(c)) * (w - WAVE_PAD * 2);
}
function enveY(h: number, y: number): number {
  return h - WAVE_PAD - (y / 100) * (h - WAVE_PAD * 2);
}
function envePxToX(c: NonNullable<ReturnType<typeof vc>>, w: number, px: number): number {
  return Math.max(0, Math.min(2000, Math.round(((px - WAVE_PAD) / (w - WAVE_PAD * 2)) * enveMaxX(c))));
}
function envePxToY(h: number, py: number): number {
  return Math.max(0, Math.min(100, Math.round(((h - WAVE_PAD - py) / (h - WAVE_PAD * 2)) * 100)));
}

function drawEnve(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const c = vc();
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  if (!c) return;
  const { head, release } = enveParts(c);
  const lastY = head.length ? head[head.length - 1]!.y : 0;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const headSorted = [...head].sort((a, b) => a.x - b.x);
  for (let i = 0; i < headSorted.length; i++) {
    const p = headSorted[i]!;
    const x = enveX(c, w, p.x);
    const y = enveY(h, p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.arc(x, y, 3, 0, Math.PI * 2);
  }
  if (release) {
    const rx = enveX(c, w, release.x);
    const ly = enveY(h, lastY);
    const ry = enveY(h, release.y);
    ctx.lineTo(rx, ly);
    ctx.lineTo(rx, ry);
    ctx.arc(rx, ry, 3, 0, Math.PI * 2);
  }
  ctx.stroke();
  fillText(ctx, t("voice.envelope"), WAVE_PAD + 2, WAVE_PAD + 8, COLORS.textDim, 9);
}

useCanvas(enveRef, drawEnve, [() => rev.value, () => voice.value]);

const enveDrag = ref<{ kind: "head" | "release"; idx: number } | null>(null);

function envePointAt(c: NonNullable<ReturnType<typeof vc>>, w: number, h: number, px: number, py: number): { kind: "head" | "release"; idx: number } | null {
  const { head, release } = enveParts(c);
  let bestD = 10;
  let best: { kind: "head" | "release"; idx: number } | null = null;
  head.forEach((p, i) => {
    const d = Math.hypot(px - enveX(c, w, p.x), py - enveY(h, p.y));
    if (d < bestD) {
      bestD = d;
      best = { kind: "head", idx: i };
    }
  });
  if (release) {
    const d = Math.hypot(px - enveX(c, w, release.x), py - enveY(h, release.y));
    if (d < bestD) best = { kind: "release", idx: 0 };
  }
  return best;
}

function onEnvePointerDown(e: PointerEvent): void {
  const c = canvasRect(enveRef);
  const c2 = vc();
  if (!c || !c2) return;
  const { x, y } = relPos(e, c);
  const { head } = enveParts(c2);
  const hit = envePointAt(c2, c.w, c.h, x, y);
  if (e.button === 2) {
    // 右クリック: ヘッド点をゼロに戻す (有効点が1つのみなら何もしない)
    if (hit?.kind === "head" && head.length > 1) {
      const e2 = c2.envelope;
      const src = head[hit.idx]!;
      const slot = e2.points.findIndex((p) => p.x === src.x && p.y === src.y);
      if (slot >= 0) setVoiceUnit((cc) => ((cc.envelope.points[slot]!.x = 0), (cc.envelope.points[slot]!.y = 0)));
    }
    return;
  }
  if (e.button !== 0) return;
  if (hit) {
    enveDrag.value = hit;
    dragUndoPushed = false;
    canvasRefSetCapture(enveRef, e);
    return;
  }
  // 空き領域クリック: 未使用のヘッドスロットを有効化して点を置く
  const e2 = c2.envelope;
  const headCount = e2.headNum + e2.bodyNum;
  const slot = e2.points.findIndex((p, i) => i < headCount && !p.x && !p.y);
  if (slot >= 0) {
    const nx = envePxToX(c2, c.w, x);
    const ny = envePxToY(c.h, y);
    setVoiceUnit((cc) => {
      cc.envelope.points[slot]!.x = nx;
      cc.envelope.points[slot]!.y = ny;
    });
  }
}

function onEnvePointerMove(e: PointerEvent): void {
  const d = enveDrag.value;
  if (!d) return;
  const c = canvasRect(enveRef);
  const c2 = vc();
  if (!c || !c2) return;
  const { x, y } = relPos(e, c);
  beginDragUndo();
  const nx = envePxToX(c2, c.w, x);
  const ny = envePxToY(c.h, y);
  // ドラッグ中の移動は undo を積まず直接書き換える (undo はジェスチャ先頭の1回)
  const e2 = c2.envelope;
  if (d.kind === "release") {
    const p = e2.points[e2.headNum + e2.bodyNum];
    if (p) {
      p.x = Math.max(1, nx);
      p.y = ny;
    }
  } else {
    const { head: cur } = enveParts(c2);
    const slot = e2.points.findIndex((p) => p.x === cur[d.idx]?.x && p.y === cur[d.idx]?.y);
    if (slot >= 0) {
      const before = cur[d.idx - 1]?.x ?? 0;
      const after = cur[d.idx + 1]?.x ?? enveMaxX(c2);
      const minX = d.idx > 0 ? Math.max(1, before + 1) : 0;
      e2.points[slot]!.x = Math.max(minX, Math.min(after - 1, nx));
      e2.points[slot]!.y = ny;
    }
  }
  touch();
}

function onEnvePointerUp(e: PointerEvent): void {
  if (canvasHasCapture(enveRef, e)) releaseCapture(enveRef, e);
  enveDrag.value = null;
  dragUndoPushed = false;
}

// ---- canvas 共通ヘルパ ----
function canvasRect(ref: { value: HTMLCanvasElement | null }): { el: HTMLCanvasElement; w: number; h: number; left: number; top: number } | null {
  const el = ref.value;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { el, w: r.width, h: r.height, left: r.left, top: r.top };
}
function relPos(e: PointerEvent, c: { left: number; top: number }): { x: number; y: number } {
  return { x: e.clientX - c.left, y: e.clientY - c.top };
}
function canvasRefSetCapture(ref: { value: HTMLCanvasElement | null }, e: PointerEvent): void {
  ref.value?.setPointerCapture(e.pointerId);
}
function canvasHasCapture(ref: { value: HTMLCanvasElement | null }, e: PointerEvent): boolean {
  return !!ref.value?.hasPointerCapture(e.pointerId);
}
function releaseCapture(ref: { value: HTMLCanvasElement | null }, e: PointerEvent): void {
  if (ref.value?.hasPointerCapture(e.pointerId)) ref.value.releasePointerCapture(e.pointerId);
}
</script>

<template>
  <div class="vsp" :data-rev="rev">
    <div class="vsp-header">
      <span class="vsp-side">{{ side === 0 ? t("voice.sideA") : t("voice.sideB") }}</span>
      <div class="vsp-wavetype">
        <button class="btn btn-sm" :class="{ on: waveType === 'coord' }" @click="setWaveType('coord')">Coordinate</button>
        <button class="btn btn-sm" :class="{ on: waveType === 'overtone' }" @click="setWaveType('overtone')">Oscillator</button>
      </div>
    </div>
    <div class="vsp-params">
      <label class="vsp-param" :title="t('voice.volume')">V
        <input v-model.number="volumeModel" type="number" min="0" max="128" class="num" />
      </label>
      <label class="vsp-param" :title="t('voice.pan')">P
        <input v-model.number="panModel" type="number" min="0" max="128" class="num" />
      </label>
      <label class="vsp-param" :title="t('voice.tuning')">T
        <input v-model.number="tuningModel" type="number" min="0.1" max="4" step="0.01" class="num" />
      </label>
      <label class="vsp-param" :title="t('voice.basicKey')">K
        <input v-model.number="basicKeyModel" type="number" min="0" max="127" class="num" />
      </label>
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
    <div class="vsp-sines" @focusin="onSineFocus" @focusout="onSineBlur">
      <div v-for="(p, i) in sinePoints" :key="i" class="vsp-sine-row">
        <span class="vsp-sine-no">{{ i + 1 }}</span>
        <input
          type="range"
          class="vsp-sine-range"
          min="-128"
          max="128"
          step="1"
          :value="p.y"
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
  gap: 4px;
  border: 1px solid var(--border);
  background: var(--card);
  padding: 4px;
}

.vsp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  flex: none;
}

.vsp-side {
  font-size: 14px;
  font-weight: bold;
  color: var(--foreground);
}

.vsp-wavetype {
  display: flex;
  gap: 2px;
}

/* 面ごとのパラメータ (コンパクトな1行) */
.vsp-params {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  flex: none;
  font-size: 10px;
  color: var(--muted-foreground);
}

.vsp-param {
  display: flex;
  align-items: center;
  gap: 2px;
}

.vsp-param input {
  font-size: 11px;
  width: 46px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  padding: 0 2px;
}

.vsp-wave {
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
  gap: 6px;
  height: 18px;
  flex: none;
}

.vsp-sine-no {
  width: 20px;
  text-align: right;
  font-size: 10px;
  color: var(--muted-foreground);
  flex: none;
}

.vsp-sine-range {
  flex: 1;
  min-width: 0;
  accent-color: var(--primary);
}

.vsp-sine-val {
  width: 30px;
  text-align: right;
  font-size: 10px;
  color: var(--muted-foreground);
  flex: none;
}

.vsp-enve {
  flex: 1;
  min-height: 50px;
}
</style>
