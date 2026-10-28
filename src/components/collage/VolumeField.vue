// ボリュームオートメーションフィールド (8モード)
// 左ドラッグ: 値書き込み、右ドラッグ: 削除 (本家 if_Cursor_VolumeField 準拠)
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { useCanvasDrag, type CanvasDragState } from "../../composables/useCanvasDrag";
import { useDragUndo } from "../../composables/useUndo";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText, drawPlayhead, fillPlayIcon, drawDragRange } from "../../lib/draw";
import { clockAtX, zoomAnchorScrollX, zoomOrPan } from "../../lib/field";
import { clockToX, xToClock } from "../../lib/clock";
import { RULER_H } from "../../lib/layout";
import { VOLUME_EDIT_KIND } from "../../lib/volume";
import { writeVolumeEvent } from "../../lib/editing";
import { EventKind, int32ToFloat } from "pxtone-ts";
import {
  doc,
  getService,
  clockContext,
  projectWriteOps,
  VOLUME_MODES,
  woices,
} from "../../state/project";
import { currentClock, isPlaying as isPlayingNow } from "../../state/player";

const H = 128; // 値の最大 (0..128)。canvas の高さは親 (collage-vol) に stretch される
const canvasRef = ref<HTMLCanvasElement | null>(null);
const tuningInput = ref<{ x: number; y: number; clock: number; value: string } | null>(null);

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
    fillText(ctx, String(v), 2, y - 2, COLORS.textDim, 9);
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
          // Velocity: Play アイコン (本家の rcNote 相当)
          for (const p of points) {
            const x = clockToX(view, p.clock) - doc.scrollX;
            if (x < 0 || x > w) continue;
            fillPlayIcon(ctx, x, valueY(p.value), COLORS.accent);
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
          fillText(ctx, label, x + 3, fTop + 14, COLORS.textBright, 10);
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
          fillText(ctx, fv.toFixed(4), x + 3, fTop + 14, COLORS.textBright, 10);
        }
      }
      break;
  }

  // プレイヘッド
  if (isPlayingNow.value) {
    drawPlayhead(ctx, clockToX(view, currentClock.value) - doc.scrollX, w, h);
  }

  // ドラッグ中の範囲 (本家同様、範囲の両端に縦線を表示)
  const d = drag.value;
  if (d && d.clock2 > d.clock1) {
    drawDragRange(
      ctx,
      clockToX(view, Math.min(d.clock1, d.clock2)) - doc.scrollX,
      clockToX(view, Math.max(d.clock1, d.clock2)) - doc.scrollX,
      fTop,
      h,
      COLORS.accent,
    );
  }
}

// ---- ポインタ ----
// ドラッグの骨格 (pointerdown/move/up + キャプチャ + undo) は useCanvasDrag が担当し、
// インライン入力・モード別書き込みのみを注入する。
// 押下時に即書き込むため undo は pointerdown 時に積む (undoOnDown)

function clockAt(x: number): number {
  return clockAtX(clockContext(), doc.divi, doc.scrollX, x);
}

function valueAt(y: number, grid = 2): number {
  const fTop = RULER_H;
  // draw と同じく canvas の実高さで 0..128 をスケールする (固定 H だと追従しない)
  const canvasH = canvasRef.value?.clientHeight ?? H;
  const fH = canvasH - RULER_H;
  const v = Math.round((fTop + fH - y) / grid) * grid;
  return Math.max(0, Math.min(128, v));
}

function applyDragAt(d: CanvasDragState, y: number, e: PointerEvent): void {
  const s = getService();
  if (!s) return;
  const u = doc.focusUnit;
  if (u < 0) return;
  const c1 = Math.min(d.clock1, d.clock2);
  const c2 = Math.max(d.clock1, d.clock2);
  // クリックのみ (範囲なし) は書き込まない
  if (c2 <= c1) return;
  const mode = doc.volumeMode;
  const grid = e.ctrlKey ? 8 : 2;
  const value = valueAt(y, grid);
  if (d.button === 0) {
    writeVolumeEvent(
      projectWriteOps,
      c1,
      c2,
      u,
      VOLUME_MODES[mode]!.kind,
      VOLUME_EDIT_KIND[mode]!,
      value,
      s.woiceNum,
    );
  } else {
    projectWriteOps.deleteEvents(c1, c2, u, VOLUME_MODES[mode]!.kind);
  }
  doc.rev++;
}

const { onPointerDown, onPointerMove, onPointerUp, drag } = useCanvasDrag<CanvasDragState>({
  canvasRef,
  clockAt,
  undoOnDown: true,
  beginDrag(e, pt) {
    // 読み取り専用タブでは操作不可 (ルーラー帯も含めて何もしない)
    if (doc.readOnly) return null;
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
      const d: CanvasDragState = { button: 0, clock1: clock, clock2: clock };
      applyDragAt(d, pt.y, e); // 押下時に即書き込む
      return d;
    }
    if (e.button === 2) return { button: 2, clock1: clock, clock2: clock };
    return null;
  },
  applyDrag(d, pt, e) {
    applyDragAt(d, pt.y, e);
  },
});

// useCanvas は drag が初期化されてから登録する (依存配列で drag を参照するため)
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
    () => drag.value,
  ],
);

const tuningUndo = useDragUndo();
function commitTuning(): void {
  const t = tuningInput.value;
  tuningInput.value = null;
  if (!t) return;
  if (doc.readOnly) return;
  const v = parseFloat(t.value);
  if (!Number.isFinite(v) || v <= 0) return;
  const s = getService();
  if (!s || doc.focusUnit < 0) return;
  tuningUndo.onFirstMove();
  s.evels.recordAddF(t.clock, doc.focusUnit, EventKind.TUNING, v);
  doc.rev++;
  tuningUndo.finish();
}

// ホイール: Ctrl=ズーム (カーソル位置基準) / Shift=横スクロール
function onWheel(e: WheelEvent): void {
  const { zoom, pan } = zoomOrPan(e, doc.zoom);
  if (zoom !== null) {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (rect) doc.scrollX = zoomAnchorScrollX(doc.zoom, zoom, doc.scrollX, e.clientX - rect.left);
    doc.zoom = zoom;
  } else if (pan !== null) doc.scrollX = Math.max(0, doc.scrollX + pan);
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
  position: relative;
}

/* canvas を absolute にして、コンテンツ高が親 (collage-vol) の高さ決定に影響しないようにする。
   これで volfield は左の volpanel と同じ高さまで下方向に伸びる。
   幅・高さは global の .field-canvas (100%) と inset:0 で決まる */
.volfield .field-canvas {
  position: absolute;
  inset: 0;
}

.tuning-input {
  position: absolute;
  z-index: 5;
}

.tuning-field {
  width: 70px;
}
</style>
