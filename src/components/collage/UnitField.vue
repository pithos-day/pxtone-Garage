// ユニット別イベントレーン (U モード)
// 左ドラッグ: 音符 (ON+VELOCITY) 生成、右ドラッグ: 削除、クリック: 試聴
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText, noteFill, noteShadow } from "../../lib/draw";
import { clockToX, xToClock, snapClock } from "../../lib/clock";
import {
  doc,
  units,
  getService,
  clockView as projectClockView,
  beginEdit,
  commitEdit,
  addEvent,
  deleteEvents,
  setScope,
  focusedOrOperated,
  EVENTDEFAULT_VELOCITY,
  EVENTDEFAULT_VOLUME,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { previewUnit } from "../../engine/preview";

const ROW_H = 16;
const BAND = 12; // 上部ルーラー帯

const canvasRef = ref<HTMLCanvasElement | null>(null);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [
    () => doc.rev,
    () => doc.scrollX,
    () => doc.scrollYUnit,
    () => doc.zoom,
    () => doc.divi,
    () => doc.focusUnit,
    () => doc.operated.join(","),
    () => doc.muted.join(","),
    () => currentClock.value,
    () => units.value.length,
  ],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = projectClockView();
  const scrollX = doc.scrollX;
  const unitCount = units.value.length;

  // ルーラー帯 (小節番号 + プレイヘッド)
  drawGrid(ctx, { w, h, scrollX, view, top: 0, bottom: BAND, showNumber: true, numberTop: 0 });

  // 行領域
  const fieldTop = BAND;
  const fieldH = h - fieldTop;
  drawGrid(ctx, { w, h, scrollX, view, top: fieldTop, bottom: h });

  // ユニット行
  const startRow = Math.floor(doc.scrollYUnit);
  const endRow = Math.min(unitCount - 1, startRow + Math.ceil(fieldH / ROW_H));
  const focused = new Set(focusedOrOperated());

  // 行背景 + 行名
  for (let u = startRow; u <= endRow; u++) {
    const y = fieldTop + (u - doc.scrollYUnit) * ROW_H;
    const isFocus = u === doc.focusUnit;
    if (isFocus) fillRect(ctx, 0, y, w, ROW_H, "rgba(240,128,0,0.18)");
    else if (focused.has(u)) fillRect(ctx, 0, y, w, ROW_H, "rgba(240,128,0,0.08)");
    else if (doc.muted.includes(u)) fillRect(ctx, 0, y, w, ROW_H, "rgba(0,0,0,0.25)");
    fillText(ctx, `${u}: ${units.value[u]?.name ?? ""}`, 2, y + 11, doc.muted.includes(u) ? COLORS.textDim : COLORS.text, 10);
  }

  // イベント描画 (ON = ノートバー, その他 = マーク)
  const records = s.evels.records;
  const endClock = scrollX + Math.ceil((w / view.zoom) * view.beatClock);
  const startClock = Math.max(0, scrollX - 10);

  interface RowNote {
    unit: number;
    clock: number;
    length: number;
    vel: number;
    vol: number;
  }
  const notes: RowNote[] = [];
  const marks: { unit: number; clock: number; kind: number }[] = [];
  let currentVel = EVENTDEFAULT_VELOCITY;
  let currentVol = EVENTDEFAULT_VOLUME;

  for (const e of records) {
    if (e.kind === 0 || e.unitNo < 0) continue; // NULL
    if (e.clock > endClock) break;
    if (e.clock + (e.kind === 1 ? e.value : 0) < startClock) continue;
    if (e.unitNo < startRow || e.unitNo > endRow + 1) continue;
    switch (e.kind) {
      case 1: // ON
        notes.push({ unit: e.unitNo, clock: e.clock, length: e.value, vel: currentVel, vol: currentVol });
        break;
      case 4: // VELOCITY
        currentVel = e.value;
        break;
      case 5: // VOLUME
        currentVol = e.value;
        break;
      case 2: // KEY
      case 3: // PAN_VOLUME
      case 6: // PORTAMENT
      case 12: // VOICENO
      case 13: // GROUPNO
      case 14: // TUNING
      case 15: // PAN_TIME
        marks.push({ unit: e.unitNo, clock: e.clock, kind: e.kind });
        break;
      default:
        break;
    }
  }

  // ノートバー
  for (const n of notes) {
    const y = fieldTop + (n.unit - doc.scrollYUnit) * ROW_H;
    const x = clockToX(view, n.clock) - scrollX;
    const xw = Math.max(2, clockToX(view, n.length));
    const play = currentClock.value >= n.clock && currentClock.value < n.clock + n.length;
    const fill = noteFill(n.unit, play, n.vel, n.vol);
    const shadow = noteShadow(n.unit, play, n.vel, n.vol);
    fillRect(ctx, x, y + 3, 2, ROW_H - 6, shadow);
    fillRect(ctx, x + 1, y + 3, Math.max(1, xw - 2), ROW_H - 6, fill);
    // 発音中はヘッドを明るく
    if (play) fillRect(ctx, x + 1, y + 2, 2, ROW_H - 4, "#fff");
  }

  // その他イベントマーク (小縦線)
  for (const m of marks) {
    const y = fieldTop + (m.unit - doc.scrollYUnit) * ROW_H;
    const x = clockToX(view, m.clock) - scrollX;
    if (x < 0 || x > w) continue;
    fillRect(ctx, x, y + 4, 1, ROW_H - 8, COLORS.accentDark);
  }

  // スコープ帯
  if (doc.scope2 > doc.scope1) {
    const x1 = clockToX(view, doc.scope1) - scrollX;
    const x2 = clockToX(view, doc.scope2) - scrollX;
    fillRect(ctx, x1, fieldTop, Math.max(0, x2 - x1), fieldH, "rgba(0,240,128,0.10)");
  }

  // プレイヘッド
  if (isPlayingNow.value) {
    const px = clockToX(view, currentClock.value) - scrollX;
    if (px >= 0 && px <= w) {
      fillRect(ctx, px - 1, 0, 2, h, COLORS.playhead);
    }
  }
}

// ---- ポインタ操作 ----
const drag = ref<{ button: number; x1: number; x2: number; unit: number; undoPushed: boolean } | null>(null);

function fieldOffset(e: PointerEvent): { x: number; y: number } {
  const c = canvasRef.value!;
  const r = c.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function clockAt(x: number): number {
  const view = projectClockView();
  return snapClock(view, doc.divi, xToClock(view, x + doc.scrollX));
}

function unitAt(y: number): number {
  const u = Math.floor((y - BAND) / ROW_H) + Math.floor(doc.scrollYUnit);
  return u;
}

function previewAt(x: number, y: number): void {
  const s = getService();
  if (!s) return;
  const u = unitAt(y);
  if (u < 0 || u >= s.unitNum) return;
  const clock = clockAt(x);
  const key = s.evels.getValue(clock, u, 2) || EVENTDEFAULT_KEY; // KEY
  const vel = s.evels.getValue(clock, u, 4) || EVENTDEFAULT_VELOCITY;
  previewUnit(u, key, vel, 0.8);
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  const { x, y } = fieldOffset(e);
  if (y < BAND) {
    // ルーラー帯クリック = シーク
    if (e.button === 0) {
      const clock = clockAt(x);
      seekToClock(clock);
    }
    return;
  }
  const u = unitAt(y);
  const s = getService();
  if (!s) return;
  if (u < 0 || u >= s.unitNum) return;
  if (e.button === 0) {
    c.setPointerCapture(e.pointerId);
    drag.value = { button: 0, x1: clockAt(x), x2: clockAt(x), unit: u, undoPushed: false };
    setScope(clockAt(x), clockAt(x) + viewUnit());
    previewAt(x, y);
  } else if (e.button === 2) {
    c.setPointerCapture(e.pointerId);
    drag.value = { button: 2, x1: clockAt(x), x2: clockAt(x), unit: u, undoPushed: false };
  }
}

function viewUnit(): number {
  return Math.max(1, doc.divi);
}

function onPointerMove(e: PointerEvent): void {
  const d = drag.value;
  if (!d) return;
  const { x } = fieldOffset(e);
  const clock = clockAt(x);
  if (clock !== d.x2) {
    // 最初の移動時に undo を積む (クリックのみなら積まない)
    if (!d.undoPushed) {
      beginEdit();
      d.undoPushed = true;
    }
    d.x2 = clock;
    applyDrag();
  }
}

function applyDrag(): void {
  const s = getService();
  if (!s) return;
  const d = drag.value!;
  const c1 = Math.min(d.x1, d.x2);
  const c2 = Math.max(d.x1, d.x2);
  if (c2 <= c1) {
    if (d.button === 0) setScope(c1, c1 + viewUnit());
    return;
  }
  setScope(c1, c2);
  const u = d.unit;
  if (d.button === 0) {
    // 既存削除 → 生成 (本家と同じ手順)
    deleteEvents(c1, c2, u, 1); // ON
    deleteEvents(c1, c2, u, 4); // VELOCITY
    addEvent(c1, u, 1, c2 - c1); // ON
    addEvent(c1, u, 4, EVENTDEFAULT_VELOCITY); // VELOCITY
  } else {
    deleteEvents(c1, c2, u, 1);
    deleteEvents(c1, c2, u, 2);
    deleteEvents(c1, c2, u, 4);
  }
  doc.rev++;
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  if (c && c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  if (d.undoPushed) {
    commitEdit();
  } else if (d.button === 0) {
    // ドラッグなしのクリック = シーク
    seekToClock(d.x1);
  }
}

// ホイール: 縦スクロール / Shift: 横 / Ctrl: ズーム
function onWheel(e: WheelEvent): void {
  const maxUnit = Math.max(0, units.value.length - 1);
  if (e.ctrlKey) {
    e.preventDefault();
    const idx = [24, 48, 96, 192].indexOf(doc.zoom);
    const next = e.deltaY < 0 ? Math.min(3, idx + 1) : Math.max(0, idx - 1);
    doc.zoom = [24, 48, 96, 192][next]!;
    return;
  }
  if (e.shiftKey) {
    doc.scrollX = Math.max(0, doc.scrollX + (e.deltaY > 0 ? 48 : -48));
    return;
  }
  doc.scrollYUnit = Math.max(0, Math.min(maxUnit, doc.scrollYUnit + Math.sign(e.deltaY)));
}
</script>

<template>
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
</template>
