<script setup lang="ts">
// ptVoice (PTV 音源エディタ)。
// 座標/倍音の波形編集・A/B面・音量/パン/チューニング/基本キー・エンベロープ・
// 88鍵プレビューを提供する。編集は state/voice.ts の editVoice (undo 付き) で行う。
import { computed, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
import { isWhiteKey, codeToRow, rowToKeyValue, KEY_CODE_TOP, KEY_CODE_BOTTOM } from "../../lib/clock";
import { VoiceType, EVENTDEFAULT_VELOCITY } from "pxtone-ts";
import type { PulsePoint } from "pxtone-ts";
import { currentVoice, newVoice, editVoice } from "../../state/voice";
import { previewWoiceObjectHold, stopPreview } from "../../engine/preview";
import { t } from "../../i18n";

const voice = computed(() => currentVoice());
const rev = ref(0);
function touch(): void {
  rev.value++;
}

// 編集中の面 (A=0 / B=1)。音声が1面のみなら A に固定
const side = ref(0);
const waveType = ref<"coord" | "overtone">("coord");

function vc() {
  const v = voice.value;
  if (!v) return null;
  const s = Math.min(side.value, v.woice.voiceNum - 1);
  return v.woice.getVoice(s);
}

watch(
  () => voice.value,
  (v) => {
    if (!v) return;
    side.value = 0;
    const c = v.woice.getVoice(0);
    waveType.value = c?.type === VoiceType.Overtone ? "overtone" : "coord";
  },
);
watch(side, () => {
  const c = vc();
  waveType.value = c?.type === VoiceType.Overtone ? "overtone" : "coord";
});

// ---- ドラッグ操作の undo は1ジェスチャに1エントリ ----
let dragUndoPushed = false;
function beginDragUndo(): void {
  if (dragUndoPushed) return;
  dragUndoPushed = true;
  editVoice(() => {});
}

// ---- ツールバー (getter/setter で直接編集 + undo) ----
function setVoiceUnit(fn: (c: NonNullable<ReturnType<typeof vc>>) => void): void {
  editVoice(() => {
    const c = vc();
    if (c) fn(c);
  });
  touch();
}

// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
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

// undo/redo 後にキャンバスと入力欄を再描画する
watch(
  () => [voice.value?.undoStack.length, voice.value?.redoStack.length],
  () => touch(),
);

// 波形タイプ切替 (本家同様、切替時に波形をリセットする)
function onWaveTypeChange(): void {
  setVoiceUnit((c) => {
    if (waveType.value === "overtone") {
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

// 座標: x ∈ [0, reso] / y ∈ [-128, 127] → px
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

function drawWave(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const c = vc();
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  if (!c) return;
  ctx.strokeStyle = COLORS.beatLine;
  ctx.beginPath();
  ctx.moveTo(0, h / 2 + 0.5);
  ctx.lineTo(w, h / 2 + 0.5);
  ctx.stroke();
  ctx.strokeStyle = COLORS.accent;
  if (waveType.value === "overtone") {
    // 倍音スライダー (1..31 倍音をバーで表示)
    const n = c.wave.num || 1;
    const barW = Math.max(2, (w - WAVE_PAD * 2) / n - 2);
    for (let i = 0; i < n; i++) {
      const p = c.wave.points[i];
      if (!p) continue;
      const x = WAVE_PAD + (i * (w - WAVE_PAD * 2)) / n;
      const y0 = coordY(h, 0);
      const y1 = coordY(h, p.y);
      const top = Math.min(y0, y1);
      fillRect(ctx, x, top, barW, Math.max(1, Math.abs(y1 - y0)), p.y >= 0 ? COLORS.accent : COLORS.danger);
    }
  } else {
    // 座標波形 (ポリライン)
    const pts = c.wave.points
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p.x - b.p.x);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const { p } = pts[i]!;
      const x = coordX(c, w, p.x);
      const y = coordY(h, p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      ctx.arc(x, y, 3, 0, Math.PI * 2);
    }
    ctx.stroke();
    // 端点 (ループ点) の描画
    ctx.strokeStyle = COLORS.textDim;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(WAVE_PAD, coordY(h, c.wave.points[0]?.y ?? 0));
    ctx.lineTo(WAVE_PAD, coordY(h, 0));
    ctx.moveTo(w - WAVE_PAD, coordY(h, c.wave.points[0]?.y ?? 0));
    ctx.lineTo(w - WAVE_PAD, coordY(h, 0));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

useCanvas(waveRef, drawWave, [() => rev.value, () => voice.value, () => side.value, () => waveType.value]);

const waveDrag = ref<{ idx: number; mode: "move" } | null>(null);

function waveIndexAt(px: number, py: number, w: number, h: number): number {
  const c = vc();
  if (!c) return -1;
  let best = -1;
  let bestD = 10;
  const n = c.wave.num;
  for (let i = 0; i < n; i++) {
    const p = c.wave.points[i];
    if (!p) continue;
    const x = waveType.value === "overtone" ? WAVE_PAD + (i * (w - WAVE_PAD * 2)) / n + 2 : coordX(c, w, p.x);
    const y = waveType.value === "overtone" ? coordY(h, p.y) : coordY(h, p.y);
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
  if (!c || !c2) return;
  const { x, y } = relPos(e, c);
  if (e.button === 2) {
    // 右クリック: 倍音 = 0、座標 = 点を削除
    if (waveType.value === "overtone") {
      const idx = waveIndexAt(x, y, c.w, c.h);
      if (idx >= 0) setVoiceUnit((cc) => (cc.wave.points[idx]!.y = 0));
    } else {
      const idx = waveIndexAt(x, y, c.w, c.h);
      if (idx >= 0 && c2.wave.num > 1) setVoiceUnit((cc) => cc.wave.points.splice(idx, 1));
    }
    return;
  }
  if (e.button !== 0) return;
  const idx = waveIndexAt(x, y, c.w, c.h);
  if (waveType.value === "coord" && idx < 0) {
    // 座標: 空き領域クリック = 点を追加 (最大31点 = 本家 ptvFIXNUM_WAVE_POINT)
    if (c2.wave.points.length >= 31) return;
    const px = coordPxToX(c2, c.w, x);
    const py = coordPxToY(c.h, y);
    setVoiceUnit((cc) => {
      cc.wave.points.push({ x: px, y: py });
      cc.wave.num = cc.wave.points.length;
    });
    return;
  }
  if (idx >= 0) {
    waveDrag.value = { idx, mode: "move" };
    dragUndoPushed = false;
    canvasRefSetCapture(waveRef, e);
  }
}

function onWavePointerMove(e: PointerEvent): void {
  const d = waveDrag.value;
  if (!d) return;
  const c = canvasRect(waveRef);
  const c2 = vc();
  if (!c || !c2) return;
  const { x, y } = relPos(e, c);
  beginDragUndo();
  setWavePoint(c2, d.idx, x, y, c.w, c.h);
  touch();
}

function onWavePointerUp(e: PointerEvent): void {
  if (canvasHasCapture(waveRef, e)) releaseCapture(waveRef, e);
  waveDrag.value = null;
  dragUndoPushed = false;
}

function setWavePoint(c: NonNullable<ReturnType<typeof vc>>, idx: number, x: number, y: number, w: number, h: number): void {
  const p = c.wave.points[idx];
  if (!p) return;
  if (waveType.value === "overtone") {
    p.y = coordPxToY(h, y);
  } else {
    p.x = coordPxToX(c, w, x);
    p.y = coordPxToY(h, y);
  }
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
  // ヘッド (アタック) + サステイン + リリース
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

useCanvas(enveRef, drawEnve, [() => rev.value, () => voice.value, () => side.value]);

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

// ---- 88鍵プレビュー ----
const keyRef = ref<HTMLCanvasElement | null>(null);

interface KeyLayout {
  code: number;
  x: number;
  w: number;
  black: boolean;
}

// 88鍵 (コード 21..108) の横並びレイアウトを計算
function keyLayout(w: number): KeyLayout[] {
  const whiteW = w / 52;
  const blackW = whiteW * 0.6;
  const out: KeyLayout[] = [];
  let whiteCount = 0;
  for (let code = KEY_CODE_BOTTOM; code <= KEY_CODE_TOP; code++) {
    if (isWhiteKey(code)) {
      out.push({ code, x: whiteCount * whiteW, w: whiteW, black: false });
      whiteCount++;
    } else {
      // 黒鍵は直前の白鍵の右端に重ねる
      let prevX = 0;
      let prevW = whiteW;
      for (const k of out) {
        if (!k.black) {
          prevX = k.x;
          prevW = k.w;
        }
      }
      out.push({ code, x: prevX + prevW - blackW / 2, w: blackW, black: true });
    }
  }
  return out;
}

function keyAt(x: number, w: number): KeyLayout | null {
  const layout = keyLayout(w);
  // 黒鍵 (前面) を優先判定
  for (const k of layout) {
    if (k.black && x >= k.x && x < k.x + k.w) return k;
  }
  for (const k of layout) {
    if (!k.black && x >= k.x && x < k.x + k.w) return k;
  }
  return null;
}

function drawKeys(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  fillRect(ctx, 0, 0, w, h, COLORS.panelDark);
  const layout = keyLayout(w);
  for (const k of layout) {
    if (k.black) continue;
    fillRect(ctx, k.x, 0, k.w, h, COLORS.whiteKey);
    ctx.strokeStyle = COLORS.keyEdge;
    ctx.strokeRect(k.x + 0.5, 0.5, k.w - 1, h - 1);
  }
  for (const k of layout) {
    if (!k.black) continue;
    fillRect(ctx, k.x, 0, k.w, h * 0.6, COLORS.blackKey);
    ctx.strokeStyle = COLORS.keyEdge;
    ctx.strokeRect(k.x + 0.5, 0.5, k.w - 1, h * 0.6 - 1);
  }
  fillText(ctx, t("voice.preview"), 8, h - 6, COLORS.textDim, 9);
}

useCanvas(keyRef, drawKeys, [() => voice.value, () => rev.value]);

function onKeyPointerDown(e: PointerEvent): void {
  const c = canvasRect(keyRef);
  const v = voice.value;
  if (!c || !v) return;
  const { x } = relPos(e, c);
  const k = keyAt(x, c.w);
  if (!k) return;
  previewWoiceObjectHold(v.woice, rowToKeyValue(codeToRow(k.code)), EVENTDEFAULT_VELOCITY);
}

function onKeyPointerUp(): void {
  stopPreview();
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
  <div class="voice-editor">
    <div v-if="!voice" class="editor-empty">
      <h2>{{ t("voice.title") }}</h2>
      <p>{{ t("voice.empty") }}</p>
      <button class="btn btn-accent" @click="newVoice()">{{ t("menu.file.new") }}</button>
    </div>
    <template v-else>
      <div class="ve-toolbar">
        <label>
          {{ t("voice.waveType") }}
          <select v-model="waveType" @change="onWaveTypeChange">
            <option value="coord">{{ t("voice.coordinate") }}</option>
            <option value="overtone">{{ t("voice.overtone") }}</option>
          </select>
        </label>
        <label>
          {{ t("voice.side") }}
          <select v-model="side">
            <option :value="0">{{ t("voice.sideA") }}</option>
            <option :value="1">{{ t("voice.sideB") }}</option>
          </select>
        </label>
        <label>{{ t("voice.volume") }} <input v-model.number="volumeModel" type="number" min="0" max="128" class="num" /></label>
        <label>{{ t("voice.pan") }} <input v-model.number="panModel" type="number" min="0" max="128" class="num" /></label>
        <label>{{ t("voice.tuning") }} <input v-model.number="tuningModel" type="number" min="0.1" max="4" step="0.01" class="num" /></label>
        <label>{{ t("voice.basicKey") }} <input v-model.number="basicKeyModel" type="number" min="0" max="127" class="num" /></label>
      </div>
      <div class="ve-canvases">
        <div class="ve-block">
          <canvas
            ref="waveRef"
            class="field-canvas"
            @pointerdown="onWavePointerDown"
            @pointermove="onWavePointerMove"
            @pointerup="onWavePointerUp"
            @pointercancel="onWavePointerUp"
            @contextmenu.prevent
          />
          <div class="ve-hint">{{ waveType === "coord" ? t("voice.waveMonitor") : t("voice.overtoneHint") }}</div>
        </div>
        <div class="ve-block">
          <canvas
            ref="enveRef"
            class="field-canvas"
            @pointerdown="onEnvePointerDown"
            @pointermove="onEnvePointerMove"
            @pointerup="onEnvePointerUp"
            @pointercancel="onEnvePointerUp"
            @contextmenu.prevent
          />
          <div class="ve-hint">{{ t("voice.envelopeHint") }}</div>
        </div>
      </div>
      <div class="ve-keyboard">
        <canvas
          ref="keyRef"
          class="field-canvas"
          @pointerdown="onKeyPointerDown"
          @pointerup="onKeyPointerUp"
          @pointercancel="onKeyPointerUp"
          @contextmenu.prevent
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.voice-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.ve-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted-foreground);
  user-select: none;
}

.ve-toolbar select,
.ve-toolbar input {
  font-size: 12px;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
}

.ve-toolbar .num {
  width: 64px;
  padding: 1px 4px;
}

.ve-canvases {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ve-block {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ve-block canvas {
  flex: 1;
}

.ve-hint {
  font-size: 10px;
  color: var(--muted-foreground);
  padding: 0 4px;
}

.ve-keyboard {
  flex: none;
  height: 88px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ve-keyboard canvas {
  flex: 1;
}
</style>
