// ボリュームオートメーションフィールド (8モード)
// 左ドラッグ: 値書き込み、右ドラッグ: 削除 (本家 if_Cursor_VolumeField 準拠)
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText } from "../../lib/draw";
import { clockToX, xToClock, snapClock } from "../../lib/clock";
import { EventKind, int32ToFloat } from "pxtone-ts";
import {
  doc,
  getService,
  clockView as projectClockView,
  beginEdit,
  commitEdit,
  addEvent,
  deleteEvents,
  setEventValue,
  setScope,
  EVENTDEFAULT_VELOCITY,
  EVENTDEFAULT_PAN_VOLUME,
  EVENTDEFAULT_PAN_TIME,
  EVENTDEFAULT_VOLUME,
  EVENTDEFAULT_PORTAMENT,
  EVENTDEFAULT_VOICENO,
  EVENTDEFAULT_GROUPNO,
  EVENTDEFAULT_TUNING,
  woices,
} from "../../state/project";
import { currentClock, isPlaying as isPlayingNow } from "../../state/player";

const H = 128;
const BAND = 12;
const canvasRef = ref<HTMLCanvasElement | null>(null);
const tuningInput = ref<{ x: number; y: number; clock: number; value: string } | null>(null);

const MODE_DEFAULTS: Record<number, number> = {
  0: EVENTDEFAULT_VELOCITY, // Velocity
  1: EVENTDEFAULT_PAN_VOLUME, // Pan_Volume
  2: EVENTDEFAULT_PAN_TIME, // Pan_Time
  3: EVENTDEFAULT_VOLUME, // Volume
  4: EVENTDEFAULT_PORTAMENT, // Portament
  5: EVENTDEFAULT_VOICENO, // VoiceNo
  6: EVENTDEFAULT_GROUPNO, // GroupNo
  7: EVENTDEFAULT_TUNING, // Tuning
};

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
  const view = projectClockView();
  const mode = doc.volumeMode;
  const focus = doc.focusUnit;
  const fTop = BAND;
  const fH = h - BAND;

  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: BAND, showNumber: true, numberTop: 0 });
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: fTop, bottom: h });

  // 目盛り (128)
  for (let v = 0; v <= 128; v += 16) {
    const y = fTop + fH - (v / 128) * fH;
    fillRect(ctx, 0, y, w, 1, "rgba(128,128,128,0.15)");
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
    case 3: // Volume: 階段
      {
        const points: { clock: number; value: number }[] = [];
        const kind = mode === 0 ? 4 : mode === 1 ? 3 : 5;
        for (const e of records) {
          if (e.kind === 0 || e.unitNo !== focus || e.clock > endClock) continue;
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
          let prevY = valueY(MODE_DEFAULTS[mode]!);
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
          if (e.kind === 0 || e.unitNo !== focus) continue;
          if (e.kind === 6 && e.clock <= endClock) {
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
        const kind = mode === 5 ? 12 : 13;
        for (const e of records) {
          if (e.kind === 0 || e.unitNo !== focus || e.kind !== kind) continue;
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
          if (e.kind === 0 || e.unitNo !== focus || e.kind !== 14) continue;
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
    const px = clockToX(view, currentClock.value) - doc.scrollX;
    if (px >= 0 && px <= w) fillRect(ctx, px - 1, 0, 2, h, COLORS.playhead);
  }
}

// ---- ポインタ ----
const drag = ref<{ button: number; x1: number; x2: number } | null>(null);

function fieldOffset(e: PointerEvent): { x: number; y: number } {
  const c = canvasRef.value!;
  const r = c.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function clockAt(x: number): number {
  const view = projectClockView();
  return snapClock(view, doc.divi, xToClock(view, x + doc.scrollX));
}

function valueAt(y: number, grid = 2): number {
  const fTop = BAND;
  const fH = H - BAND;
  const v = Math.round((fTop + fH - y) / grid) * grid;
  return Math.max(0, Math.min(128, v));
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  const { x, y } = fieldOffset(e);
  if (y < BAND) return; // ルーラー帯は操作なし
  const s = getService();
  if (!s) return;
  if (doc.focusUnit < 0 || !s.unitGet(doc.focusUnit)) return;
  if (e.button === 0) {
    if (doc.volumeMode === 7) {
      // Tuning: インライン入力
      const clock = clockAt(x);
      const cur = s.evels.getValue(clock, doc.focusUnit, 14);
      tuningInput.value = {
        x,
        y,
        clock,
        value: cur ? int32ToFloat(cur).toFixed(4) : "1.0",
      };
      return;
    }
    c.setPointerCapture(e.pointerId);
    beginEdit();
    drag.value = { button: 0, x1: clockAt(x), x2: clockAt(x) };
    setScope(clockAt(x), clockAt(x) + Math.max(1, doc.divi));
    applyDragAt(e, y);
  } else if (e.button === 2) {
    c.setPointerCapture(e.pointerId);
    beginEdit();
    drag.value = { button: 2, x1: clockAt(x), x2: clockAt(x) };
  }
}

function onPointerMove(e: PointerEvent): void {
  const d = drag.value;
  if (!d) return;
  const { x, y } = fieldOffset(e);
  const clock = clockAt(x);
  if (clock !== d.x2) {
    d.x2 = clock;
    applyDragAt(e, y);
  }
}

function applyDragAt(e: PointerEvent, y: number): void {
  const s = getService();
  if (!s) return;
  const d = drag.value!;
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
    switch (mode) {
      case 0: // Velocity
        setEventValue(c1, c2, u, 4, value);
        break;
      case 1: // Pan_Volume
        deleteEvents(c1, c2, u, 3);
        addEvent(c1, u, 3, value);
        setEventValue(c1, c2, u, 3, value);
        break;
      case 2: // Pan_Time
        deleteEvents(c1, c2, u, 15);
        addEvent(c1, u, 15, value);
        setEventValue(c1, c2, u, 15, value);
        break;
      case 3: // Volume
        deleteEvents(c1, c2, u, 5);
        addEvent(c1, u, 5, value);
        setEventValue(c1, c2, u, 5, value);
        break;
      case 4: // Portament
        deleteEvents(c1, c2, u, 6);
        addEvent(c1, u, 6, c2 - c1);
        break;
      case 5: // VoiceNo
        deleteEvents(c1, c2, u, 12);
        addEvent(c1, u, 12, Math.round((value / 128) * Math.max(0, s.woiceNum - 1)));
        break;
      case 6: // GroupNo
        deleteEvents(c1, c2, u, 13);
        addEvent(c1, u, 13, Math.min(7, Math.round((value / 128) * 7)));
        break;
    }
  } else {
    const kinds: Record<number, number> = { 0: 4, 1: 3, 2: 15, 3: 5, 4: 6, 5: 12, 6: 13, 7: 14 };
    deleteEvents(c1, c2, u, kinds[mode]!);
  }
  doc.rev++;
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  if (c && c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
  if (drag.value) {
    drag.value = null;
    commitEdit();
  }
}

function commitTuning(): void {
  const t = tuningInput.value;
  tuningInput.value = null;
  if (!t) return;
  const v = parseFloat(t.value);
  if (!Number.isFinite(v) || v <= 0) return;
  const s = getService();
  if (!s || doc.focusUnit < 0) return;
  beginEdit();
  s.evels.recordAddF(t.clock, doc.focusUnit, EventKind.TUNING, v);
  doc.rev++;
  commitEdit();
}

function onWheel(e: WheelEvent): void {
  if (e.ctrlKey) {
    e.preventDefault();
    const idx = [24, 48, 96, 192].indexOf(doc.zoom);
    const next = e.deltaY < 0 ? Math.min(3, idx + 1) : Math.max(0, idx - 1);
    doc.zoom = [24, 48, 96, 192][next]!;
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
