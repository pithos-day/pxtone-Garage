// ボリュームオートメーションフィールド (8モード)
// 左ドラッグ: 値書き込み、右ドラッグ: 削除 (本家 if_Cursor_VolumeField 準拠)
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { useCanvasDrag } from "../../composables/useCanvasDrag";
import { useDragUndo } from "../../composables/useUndo";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText, drawPlayhead } from "../../lib/draw";
import { clockAtX, zoomByWheel } from "../../lib/field";
import { clockToX, xToClock } from "../../lib/clock";
import { RULER_H } from "../../lib/layout";
import { VOLUME_EDIT_KIND } from "../../lib/volume";
import { writeVolumeEvent, type EventWriteOps } from "../../lib/editing";
import { EventKind, int32ToFloat } from "pxtone-ts";
import {
  doc,
  getService,
  clockContext,
  addEvent,
  deleteEvents,
  setEventValue,
  setScope,
  VOLUME_MODES,
  woices,
} from "../../state/project";
import { currentClock, isPlaying as isPlayingNow } from "../../state/player";

// イベント書き換え API のアダプタ (lib/editing へ渡す)
const writeOps: EventWriteOps = { deleteEvents, addEvent, setEventValue };

const H = 128;
const canvasRef = ref<HTMLCanvasElement | null>(null);
const tuningInput = ref<{ x: number; y: number; clock: number; value: string } | null>(null);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [
    () => doc.rev,
    () => doc.scrollX,
    () => doc.zoom,
    () => doc.volumeMode,
    () => doc.focusUnit,
    () => currentClock.value,
    () => woices.value.length,
  ],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = clockContext();
  const mode = doc.volumeMode;
  const focus = doc.focusUnit;
  const fTop = RULER_H;
  const fH = h - RULER_H;

  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: RULER_H, showNumber: true, numberTop: 0 });
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: fTop, bottom: h });

  // 目盛り (128)
  for (let v = 0; v <= 128; v += 16) {
    const y = fTop + fH - (v / 128) * fH;
    fillRect(ctx, 0, y, w, 1, COLORS.scaleLine);
    fillText(ctx, String(v), 2, y - 2, COLORS.textDim, 8);
  }

  if (focus < 0 || !s.unitGet(focus)) return;
  const records = s.evels.records;
  // 表示範囲 (clock)。scrollX は px なので xToClock で変換する
  const endClock = xToClock(view, doc.scrollX + w);
  const startClock = Math.max(0, xToClock(view, doc.scrollX) - 10);

  const valueY = (v: number): number => fTop + fH - (v / 128) * fH;

  switch (mode) {
    case 0: // Velocity: 点
    case 1: // Pan_Volume: 階段
    case 2: // Pan_Time: 階段 (本家 if_VolumeField は Volume と同じ描画)
    case 3: // Volume: 階段
      {
        const points: { clock: number; value: number }[] = [];
        const kind = VOLUME_MODES[mode]!.kind;
        for (const e of records) {
          if (e.kind === EventKind.NULL || e.unitNo !== focus || e.clock > endClock) continue;
          if (e.kind === kind) {
            points.push({ clock: e.clock, value: e.value });
          }
        }
        if (mode === 0) {
          for (const p of points) {
            const x = clockToX(view, p.clock) - doc.scrollX;
            if (x < 0 || x > w) continue;
            fillRect(ctx, x - 1, valueY(p.value) - 1, 3, 3, COLORS.accent);
          }
        } else {
          // 階段状ライン
          let prevY = valueY(VOLUME_MODES[mode]!.def);
          ctx.strokeStyle = COLORS.accent;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, prevY);
          for (const p of points) {
            if (p.clock < startClock) {
              prevY = valueY(p.value);
              continue;
            }
            const x = clockToX(view, p.clock) - doc.scrollX;
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, valueY(p.value));
            prevY = valueY(p.value);
          }
          ctx.lineTo(w, prevY);
          ctx.stroke();
        }
      }
      break;
    case 4: // Portament: 横棒
      {
        for (const e of records) {
          if (e.kind === EventKind.NULL || e.unitNo !== focus) continue;
          if (e.kind === EventKind.PORTAMENT && e.clock <= endClock) {
            const x = clockToX(view, e.clock) - doc.scrollX;
            const xw = Math.max(2, clockToX(view, e.value));
            if (x + xw < 0 || x > w) continue;
            fillRect(ctx, x, valueY(64) - 2, xw, 4, COLORS.accentDark);
          }
        }
      }
      break;
    case 5: // VoiceNo
    case 6: // GroupNo
      {
        const kind = VOLUME_MODES[mode]!.kind;
        for (const e of records) {
          if (e.kind === EventKind.NULL || e.unitNo !== focus || e.kind !== kind) continue;
          if (e.clock > endClock || e.clock + 10 < startClock) continue;
          const x = clockToX(view, e.clock) - doc.scrollX;
          if (x > w || x < -40) continue;
          fillRect(ctx, x, fTop + 4, 26, fH - 8, COLORS.panelLight);
          fillRect(ctx, x, fTop + 4, 26, 1, COLORS.borderLight);
          const label = mode === 5 ? woices.value[e.value]?.name ?? `#${e.value}` : `G${e.value}`;
          fillText(ctx, label, x + 3, fTop + 14, COLORS.textBright, 9);
        }
      }
      break;
    case 7: // Tuning: 数値ボックス
      {
        for (const e of records) {
          if (e.kind === EventKind.NULL || e.unitNo !== focus || e.kind !== EventKind.TUNING) continue;
          if (e.clock > endClock || e.clock + 10 < startClock) continue;
          const x = clockToX(view, e.clock) - doc.scrollX;
          if (x > w || x < -50) continue;
          const fv = int32ToFloat(e.value);
          fillRect(ctx, x, fTop + 4, 44, fH - 8, COLORS.panelLight);
          fillRect(ctx, x, fTop + 4, 44, 1, COLORS.borderLight);
          fillText(ctx, fv.toFixed(4), x + 3, fTop + 14, COLORS.textBright, 9);
        }
      }
      break;
  }

  // プレイヘッド
  if (isPlayingNow.value) {
    drawPlayhead(ctx, clockToX(view, currentClock.value) - doc.scrollX, w, h);
  }
}

// ---- ポインタ ----
// ドラッグの骨格 (pointerdown/move/up + キャプチャ + undo) は useCanvasDrag が担当し、
// インライン入力・モード別書き込みのみを注入する。
// 押下時に即書き込むため undo は pointerdown 時に積む (undoOnDown)
type VolDrag = { button: number; x1: number; x2: number };

function clockAt(x: number): number {
  return clockAtX(clockContext(), doc.divi, doc.scrollX, x);
}

function valueAt(y: number, grid = 2): number {
  const fTop = RULER_H;
  const fH = H - RULER_H;
  const v = Math.round((fTop + fH - y) / grid) * grid;
  return Math.max(0, Math.min(128, v));
}

function applyDragAt(d: VolDrag, y: number, e: PointerEvent): void {
  const s = getService();
  if (!s) return;
  const u = doc.focusUnit;
  if (u < 0) return;
  const c1 = Math.min(d.x1, d.x2);
  const c2 = Math.max(d.x1, d.x2);
  if (c2 <= c1) {
    setScope(c1, c1 + Math.max(1, doc.divi));
    return;
  }
  setScope(c1, c2);
  const mode = doc.volumeMode;
  const grid = e.ctrlKey ? 8 : 2;
  const value = valueAt(y, grid);
  if (d.button === 0) {
    writeVolumeEvent(
      writeOps,
      c1,
      c2,
      u,
      VOLUME_MODES[mode]!.kind,
      VOLUME_EDIT_KIND[mode]!,
      value,
      s.woiceNum,
    );
  } else {
    writeOps.deleteEvents(c1, c2, u, VOLUME_MODES[mode]!.kind);
  }
  doc.rev++;
}

const { onPointerDown, onPointerMove, onPointerUp } = useCanvasDrag<VolDrag>({
  canvasRef,
  clockAt,
  undoOnDown: true,
  beginDrag(e, pt) {
    if (pt.y < RULER_H) return null; // ルーラー帯は操作なし
    const s = getService();
    if (!s || doc.focusUnit < 0 || !s.unitGet(doc.focusUnit)) return null;
    const clock = clockAt(pt.x);
    if (e.button === 0) {
      if (doc.volumeMode === 7) {
        // Tuning: インライン入力
        const cur = s.evels.getValue(clock, doc.focusUnit, EventKind.TUNING);
        tuningInput.value = {
          x: pt.x,
          y: pt.y,
          clock,
          value: cur ? int32ToFloat(cur).toFixed(4) : "1.0",
        };
        return null;
      }
      const d: VolDrag = { button: 0, x1: clock, x2: clock };
      setScope(clock, clock + Math.max(1, doc.divi));
      applyDragAt(d, pt.y, e); // 押下時に即書き込む
      return d;
    }
    if (e.button === 2) return { button: 2, x1: clock, x2: clock };
    return null;
  },
  applyDrag(d, pt, e) {
    applyDragAt(d, pt.y, e);
  },
});

const tuningUndo = useDragUndo();
function commitTuning(): void {
  const t = tuningInput.value;
  tuningInput.value = null;
  if (!t) return;
  const v = parseFloat(t.value);
  if (!Number.isFinite(v) || v <= 0) return;
  const s = getService();
  if (!s || doc.focusUnit < 0) return;
  tuningUndo.onFirstMove();
  s.evels.recordAddF(t.clock, doc.focusUnit, EventKind.TUNING, v);
  doc.rev++;
  tuningUndo.finish();
}

function onWheel(e: WheelEvent): void {
  const zoom = zoomByWheel(e, doc.zoom);
  if (zoom !== null) {
    doc.zoom = zoom;
    return;
  }
  if (e.shiftKey) {
    doc.scrollX = Math.max(0, doc.scrollX + (e.deltaY > 0 ? 48 : -48));
  }
}
</script>

<template>
  <div class="volfield">
    <canvas
      ref="canvasRef"
      class="field-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
      @contextmenu.prevent
    />
    <div
      v-if="tuningInput"
      class="tuning-input"
      :style="{ left: tuningInput.x + 'px', top: tuningInput.y + 'px' }"
    >
      <input
        v-model="tuningInput.value"
        class="tuning-field"
        @keydown.enter="commitTuning"
        @keydown.esc="tuningInput = null"
        @blur="commitTuning"
      />
    </div>
  </div>
</template>

<style scoped>
.volfield {
  flex: 1;
  min-width: 0;
  height: 128px;
  position: relative;
}

.tuning-input {
  position: absolute;
  z-index: 5;
}

.tuning-field {
  width: 70px;
}
</style>
