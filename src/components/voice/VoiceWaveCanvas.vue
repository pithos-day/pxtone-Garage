<script setup lang="ts">
// 波形モニターと Coordinate の点編集。本家 ptuiWave::_try_update と同様、生成波形 (GetOneSample) を描画する
import { ref } from "vue";
import { Oscillator, VoiceType, type VoiceUnit } from "pxtone-ts";
import { useCanvas } from "../../composables/useCanvas";
import { useUndoOnce } from "../../composables/useUndo";
import { COLORS } from "../../lib/theme";
import { fillRect } from "../../lib/draw";
import { canvasBox, capturePointer, fieldOffset, releasePointerCapture } from "../../lib/field";
import { WAVE_PAD, SAMPLE_NUM, coordX, coordY, coordPxToX, cursorToWaveY, nearestPoint, waveY } from "../../lib/voice-geometry";
import { editVoice, clampWavePointX, insertWavePoint } from "../../state/voice";

const props = defineProps<{ unit: VoiceUnit | null; rev: number }>();
const emit = defineEmits<{
  (e: "update", fn: (c: VoiceUnit) => void): void; // undo 付きの 1 回の編集
  (e: "touch"): void; // ドラッグ中の直接編集の通知
}>();

// ドラッグは最初の編集時のみ undo を積む (1 ジェスチャ = 1 エントリ)
const dragUndo = useUndoOnce(() => editVoice(() => {}));

const waveRef = ref<HTMLCanvasElement | null>(null);

// 波形モニター: 本家 ptuiWave::_try_update と同様、生成波形 (GetOneSample) を描画する。
// 波形も点も volume 込みで描画し、両者が一致するようにする
function drawWave(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const c = props.unit;
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

useCanvas(waveRef, drawWave, [() => props.rev, () => props.unit]);

// ---- Coordinate の点編集 ----
const waveDrag = ref<{ idx: number } | null>(null);

function waveIndexAt(px: number, py: number, w: number, h: number): number {
  const c = props.unit;
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
  const canvas = canvasBox(waveRef.value);
  const unit = props.unit;
  if (!canvas || !unit || unit.type !== VoiceType.Coodinate) return;
  const { x, y } = fieldOffset(canvas.el, e);
  const idx = waveIndexAt(x, y, canvas.w, canvas.h);
  if (e.button === 2) {
    // 右クリック: 点を削除 (点0 は固定なので削除不可)
    if (idx > 0) {
      emit("update", (vc) => {
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
    emit("update", (vc) => {
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
  const canvas = canvasBox(waveRef.value);
  const unit = props.unit;
  if (!canvas || !unit) return;
  const { x, y } = fieldOffset(canvas.el, e);
  dragUndo.onBegin();
  // 前後の点を越えられないよう x をクランプ (本家 _point_set 準拠)
  const p = unit.wave.points[d.idx];
  if (!p) return;
  p.y = cursorToWaveY(canvas.h, y, unit.volume);
  const nx = coordPxToX(unit, canvas.w, x);
  p.x = clampWavePointX(unit.wave.points, d.idx, nx, unit.wave.reso);
  emit("touch");
}

function onWavePointerUp(e: PointerEvent): void {
  releasePointerCapture(waveRef.value, e);
  waveDrag.value = null;
  dragUndo.reset();
}
</script>

<template>
  <canvas
    ref="waveRef"
    class="field-canvas vsp-wave"
    @pointerdown="onWavePointerDown"
    @pointermove="onWavePointerMove"
    @pointerup="onWavePointerUp"
    @pointercancel="onWavePointerUp"
    @contextmenu.prevent
  />
</template>
