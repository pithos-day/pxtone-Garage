<script setup lang="ts">
// エンベロープの編集 (本家 ptuiEnvelope 準拠: x は区間長、表示は累積座標)。
// 本家と同様、グラフにはヘッド点のみを表示する (リリースは Release スライダーで
// 独立に操作し、エンベロープとは影響し合わない)
import { ref } from "vue";
import type { VoiceUnit } from "pxtone-ts";
import { useCanvas } from "../../composables/useCanvas";
import { useUndoOnce } from "../../composables/useUndo";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
import { canvasBox, capturePointer, fieldOffset, releasePointerCapture } from "../../lib/field";
import { WAVE_PAD, enveHeadCount, enveX, enveY, envePxToX, envePxToY, enveMaxX, nearestPoint } from "../../lib/voice-geometry";
import { editVoice, enveDisplayPoints, enveInsertPoint, enveDeletePoint, enveSetHeadPointX } from "../../state/voice";
import { t } from "../../i18n";

const props = defineProps<{ unit: VoiceUnit | null; rev: number }>();
const emit = defineEmits<{
  (e: "update", fn: (c: VoiceUnit) => void): void; // undo 付きの 1 回の編集
  (e: "touch"): void; // ドラッグ中の直接編集の通知
}>();

// ドラッグは最初の編集時のみ undo を積む (1 ジェスチャ = 1 エントリ)
const dragUndo = useUndoOnce(() => editVoice(() => {}));

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
  const c = props.unit;
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

useCanvas(enveRef, drawEnve, [() => props.rev, () => props.unit]);

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
  const canvas = canvasBox(enveRef.value);
  const unit = props.unit;
  if (!canvas || !unit) return;
  const { x, y } = fieldOffset(canvas.el, e);
  const hit = envePointAt(unit, canvas.w, canvas.h, x, y);
  if (e.button === 2) {
    // 右クリック: ヘッド点を削除 (本家 _point_delete。有効点が1つのみなら不可)
    if (hit) {
      emit("update", (vc) => enveDeletePoint(vc.envelope.points, enveHeadCount(vc), hit.index));
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
  emit("update", (vc) => enveInsertPoint(vc.envelope.points, enveHeadCount(vc), cx, cy));
}

function onEnvePointerMove(e: PointerEvent): void {
  const d = enveDrag.value;
  if (!d) return;
  const canvas = canvasBox(enveRef.value);
  const unit = props.unit;
  if (!canvas || !unit) return;
  const { x, y } = fieldOffset(canvas.el, e);
  dragUndo.onBegin();
  const cx = envePxToX(canvas.w, x, enveMaxHeadX(unit));
  const cy = envePxToY(canvas.h, y);
  // ドラッグ中の移動は undo を積まず直接書き換える (undo はジェスチャ先頭の1回)。
  // 前後の点を乗り越えられないよう累積座標でクランプして区間長へ変換
  enveSetHeadPointX(unit.envelope.points, enveHeadCount(unit), d.index, cx);
  unit.envelope.points[d.index]!.y = cy;
  emit("touch");
}

function onEnvePointerUp(e: PointerEvent): void {
  releasePointerCapture(enveRef.value, e);
  enveDrag.value = null;
  dragUndo.reset();
}
</script>

<template>
  <canvas
    ref="enveRef"
    class="field-canvas vsp-enve"
    @pointerdown="onEnvePointerDown"
    @pointermove="onEnvePointerMove"
    @pointerup="onEnvePointerUp"
    @pointercancel="onEnvePointerUp"
    @contextmenu.prevent
  />
</template>
