<script setup lang="ts">
// Voice エディタの1面分 (A面/B面)。
// 波形の上に Coordinate/Oscillator 切替ボタンと Vol/Pan/補正値/Release のスライダー、
// 波形モニター (本家 ptuiWave 準拠の生成波形表示)、スライダー (本家 ptuiSines 準拠。
// Coordinate では n 番目の点の y 座標表示として常時表示)、下にエンベロープ。
// エンベロープは本家 ptuiEnvelope 準拠の「区間長 x + 累積描画」。
import { computed, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
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
} from "../../state/voice";
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

// ---- 面ごとのパラメータ (Vol/Pan/補正値/Release) ----
// 本家 ptuiRackFull / ptuiReleaseTime 準拠:
//   Vol     = 0..64 (右クリックで 座標=64 / 倍音=32)
//   Pan     = 0..128 (右クリックで 64)
//   補正値  = (tuning-1)*10000 ∈ ±128 (右クリックで 0 = 1.0)
//   Release = リリース区間長 1..1000 (右クリックで 1)
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
  set: (v: number) => setVoiceUnit((c) => (c.volume = Math.max(0, Math.min(64, Math.round(v))))),
});
const panModel = computed({
  get: () => {
    void rev.value;
    return vc()?.pan ?? 64;
  },
  set: (v: number) => setVoiceUnit((c) => (c.pan = Math.max(0, Math.min(128, Math.round(v))))),
});
const correctModel = computed({
  get: () => {
    void rev.value;
    return Math.round(((vc()?.tuning ?? 1) - 1) * 10000);
  },
  set: (v: number) => setVoiceUnit((c) => (c.tuning = 1 + Math.max(-128, Math.min(128, Math.round(v))) / 10000)),
});

// リリース区間長 (本家 ptuiReleaseTime: points[headNum+bodyNum].x を 1..1000)
function enveHeadCount(c: NonNullable<ReturnType<typeof vc>>): number {
  return c.envelope.headNum + c.envelope.bodyNum;
}
const releaseModel = computed({
  get: () => {
    void rev.value;
    const c = vc();
    if (!c) return 1;
    const hc = enveHeadCount(c);
    return c.envelope.tailNum > 0 ? (c.envelope.points[hc]?.x ?? 1) : 1;
  },
  set: (v: number) =>
    setVoiceUnit((c) => {
      const hc = c.envelope.headNum + c.envelope.bodyNum;
      if (c.envelope.tailNum > 0 && c.envelope.points[hc]) {
        c.envelope.points[hc]!.x = Math.max(1, Math.min(1000, Math.round(v)));
      }
    }),
});

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
  // スライダー (points 配列) を新しい波形に更新する
  touch();
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
// 波形も点も volume 込みで描画し、両者が一致するようにする
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
  const c = vc();
  if (!c) return -1;
  let best = -1;
  let bestD = 10;
  for (let i = 0; i < c.wave.num; i++) {
    const p = c.wave.points[i];
    if (!p) continue;
    const x = coordX(c, w, p.x);
    const y = coordY(h, (p.y * c.volume) / 128);
    const d = Math.hypot(px - x, py - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// カーソル y → データ y。表示は volume スケールなので逆スケールする (volume=0 は不可)
function cursorToWaveY(h: number, py: number, volume: number): number {
  if (volume <= 0) return 0;
  return Math.max(-128, Math.min(127, Math.round((coordPxToY(h, py) * 128) / volume)));
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
    const py = cursorToWaveY(c.h, y, c2.volume);
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
  p.y = cursorToWaveY(c.h, y, c2.volume);
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
// 常時表示し、point[i].y を直接編集する。座標モードの点0 (i=0) は本家 _point_set 同様固定。
// rev に依存させ、波形タイプ切替や undo/redo で points 配列が置き換わっても
// 常に最新の配列を返す (markRaw のため参照の置き換えは reactive 追跡されない)
const sinePoints = computed(() => {
  void rev.value;
  return vc()?.wave.points ?? [];
});
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
  if (waveType.value === "coord" && i === 0) return; // 座標モードの点0 は固定
  const c = vc();
  if (!c || !c.wave.points[i]) return;
  c.wave.points[i]!.y = Math.max(-128, Math.min(128, Math.round(v)));
  touch();
}

// ---- エンベロープ (本家 ptuiEnvelope 準拠: x は区間長、表示は累積座標) ----
const enveRef = ref<HTMLCanvasElement | null>(null);

// ヘッド表示点 (累積) とリリース点 (累積位置 = ヘッド合計 + 区間長) を返す
function enveDisplay(c: NonNullable<ReturnType<typeof vc>>): {
  head: ReturnType<typeof enveDisplayPoints>;
  release: { x: number; y: number } | null;
  headCount: number;
  headTotal: number;
} {
  const headCount = enveHeadCount(c);
  const head = enveDisplayPoints(c.envelope.points, headCount);
  const headTotal = head.length ? head[head.length - 1]!.x : 0;
  const rel = c.envelope.tailNum > 0 ? c.envelope.points[headCount] : null;
  return {
    head,
    release: rel ? { x: headTotal + rel.x, y: rel.y } : null,
    headCount,
    headTotal,
  };
}

function enveMaxX(c: NonNullable<ReturnType<typeof vc>>): number {
  const { head, release } = enveDisplay(c);
  let m = release?.x ?? 0;
  if (head.length) m = Math.max(m, head[head.length - 1]!.x);
  return Math.max(100, m * 1.2);
}

function enveX(c: NonNullable<ReturnType<typeof vc>>, w: number, x: number): number {
  return WAVE_PAD + (x / enveMaxX(c)) * (w - WAVE_PAD * 2);
}
// 本家 _pos_fix 準拠: y は 0..128
function enveY(h: number, y: number): number {
  return h - WAVE_PAD - (y / 128) * (h - WAVE_PAD * 2);
}
function envePxToX(c: NonNullable<ReturnType<typeof vc>>, w: number, px: number): number {
  return Math.max(0, Math.min(2000, Math.round(((px - WAVE_PAD) / (w - WAVE_PAD * 2)) * enveMaxX(c))));
}
function envePxToY(h: number, py: number): number {
  return Math.max(0, Math.min(128, Math.round(((h - WAVE_PAD - py) / (h - WAVE_PAD * 2)) * 128)));
}

function drawEnve(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const c = vc();
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  if (!c) return;
  const { head, release } = enveDisplay(c);
  const lastY = head.length ? head[head.length - 1]!.y : 0;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < head.length; i++) {
    const p = head[i]!;
    const x = enveX(c, w, p.x);
    const y = enveY(h, p.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.arc(x, y, 3, 0, Math.PI * 2);
  }
  // サステイン → リリース (終着点はヘッド累積 + リリース区間長の位置)
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

const enveDrag = ref<{ kind: "head" | "release"; index: number } | null>(null);

function envePointAt(
  c: NonNullable<ReturnType<typeof vc>>,
  w: number,
  h: number,
  px: number,
  py: number,
): { kind: "head" | "release"; index: number } | null {
  const { head, release } = enveDisplay(c);
  let bestD = 10;
  let best: { kind: "head" | "release"; index: number } | null = null;
  for (const p of head) {
    const d = Math.hypot(px - enveX(c, w, p.x), py - enveY(h, p.y));
    if (d < bestD) {
      bestD = d;
      best = { kind: "head", index: p.index };
    }
  }
  if (release) {
    const d = Math.hypot(px - enveX(c, w, release.x), py - enveY(h, release.y));
    if (d < bestD) best = { kind: "release", index: -1 };
  }
  return best;
}

function onEnvePointerDown(e: PointerEvent): void {
  const c = canvasRect(enveRef);
  const c2 = vc();
  if (!c || !c2) return;
  const { x, y } = relPos(e, c);
  const hit = envePointAt(c2, c.w, c.h, x, y);
  if (e.button === 2) {
    // 右クリック: ヘッド点を削除 (本家 _point_delete。有効点が1つのみなら不可)
    if (hit?.kind === "head") {
      setVoiceUnit((cc) => enveDeletePoint(cc.envelope.points, enveHeadCount(cc), hit.index));
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
  // 空き領域クリック = 点を追加 (累積座標を区間長に変換して挿入)
  const cx = envePxToX(c2, c.w, x);
  const cy = envePxToY(c.h, y);
  setVoiceUnit((cc) => enveInsertPoint(cc.envelope.points, enveHeadCount(cc), cx, cy));
}

function onEnvePointerMove(e: PointerEvent): void {
  const d = enveDrag.value;
  if (!d) return;
  const c = canvasRect(enveRef);
  const c2 = vc();
  if (!c || !c2) return;
  const { x, y } = relPos(e, c);
  beginDragUndo();
  const cx = envePxToX(c2, c.w, x);
  const cy = envePxToY(c.h, y);
  // ドラッグ中の移動は undo を積まず直接書き換える (undo はジェスチャ先頭の1回)
  if (d.kind === "release") {
    const p = c2.envelope.points[enveHeadCount(c2)];
    if (p) {
      p.x = Math.max(1, Math.min(1000, cx - enveDisplay(c2).headTotal));
      p.y = cy;
    }
  } else {
    // 前後の点を乗り越えられないよう累積座標でクランプして区間長へ変換
    enveSetHeadPointX(c2.envelope.points, enveHeadCount(c2), d.index, cx);
    c2.envelope.points[d.index]!.y = cy;
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
      <div class="vsp-param">
        <span class="vsp-plabel" :title="t('voice.volume')">V</span>
        <input type="range" class="vsp-prange" min="0" max="64" step="1" v-model.number="volumeModel" @contextmenu.prevent="resetVolume" />
        <span class="vsp-pval">{{ volumeModel }}</span>
      </div>
      <div class="vsp-param">
        <span class="vsp-plabel" :title="t('voice.pan')">P</span>
        <input type="range" class="vsp-prange" min="0" max="128" step="1" v-model.number="panModel" @contextmenu.prevent="resetPan" />
        <span class="vsp-pval">{{ panModel }}</span>
      </div>
      <div class="vsp-param">
        <span class="vsp-plabel" :title="t('voice.correct')">C</span>
        <input type="range" class="vsp-prange" min="-128" max="128" step="1" v-model.number="correctModel" @contextmenu.prevent="resetCorrect" />
        <span class="vsp-pval">{{ correctModel }}</span>
      </div>
      <div class="vsp-param">
        <span class="vsp-plabel" :title="t('voice.release')">R</span>
        <input type="range" class="vsp-prange" min="1" max="1000" step="1" v-model.number="releaseModel" @contextmenu.prevent="resetRelease" />
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

/* 面ごとのパラメータ (Vol/Pan/補正値/Release のスライダー) */
.vsp-params {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: none;
  font-size: 10px;
  color: var(--muted-foreground);
}

.vsp-param {
  display: flex;
  align-items: center;
  gap: 4px;
}

.vsp-plabel {
  width: 12px;
  flex: none;
  font-weight: bold;
  color: var(--foreground);
}

.vsp-prange {
  flex: 1;
  min-width: 0;
  accent-color: var(--primary);
}

.vsp-pval {
  width: 34px;
  flex: none;
  text-align: right;
  font-size: 10px;
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

.vsp-sine-range:disabled {
  opacity: 0.4;
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
