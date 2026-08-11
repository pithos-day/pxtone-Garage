// ピン留めユニットのイベントレーン (画面上部固定表示)
// ピン留めしたユニットの行のみを表示し、クリック/ドラッグで編集できる
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText, noteFill, noteShadow,
  drawPlayhead,
  drawScopeBand,
} from "../../lib/draw";
import { fieldOffset, clockAtX, zoomByWheel } from "../../lib/field";
import { clockToX, xToClock } from "../../lib/clock";
import { RULER_H, NAME_W, KEY_HEIGHT } from "../../lib/layout";
import { EventKind } from "pxtone-ts";
import {
  doc,
  units,
  getService,
  clockContext,
  beginEdit,
  commitEdit,
  addEvent,
  deleteEvents,
  setScope,
  pinnedUnits,
  EVENTDEFAULT_VOLUME,
  EVENTDEFAULT_VELOCITY,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { previewUnitHold, stopPreview } from "../../engine/preview";

// 左のユニット名領域 = 左パネル (300px) + 鍵盤ストリップ (64px)。
// レーンの開始位置をピアノロールフィールドと揃える (lib/layout.ts の NAME_W)

const canvasRef = ref<HTMLCanvasElement | null>(null);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [
    () => doc.rev,
    () => doc.scrollX,
    () => doc.zoom,
    () => doc.divi,
    () => doc.focusUnit,
    () => doc.scope1,
    () => doc.scope2,
    () => currentClock.value,
    () => units.value.length,
    () => doc.unitPinned.join(","),
  ],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = clockContext();
  const scrollX = doc.scrollX;
  const pinned = pinnedUnits();
  const fieldTop = RULER_H;
  const fieldH = h - fieldTop;
  const fieldW = w - NAME_W;

  // ルーラー帯 + グリッド + イベント (ユニット名領域の右側)
  ctx.save();
  ctx.translate(NAME_W, 0);

  drawGrid(ctx, { w: fieldW, h, scrollX, view, top: 0, bottom: RULER_H, showNumber: true, numberTop: 0 });
  drawGrid(ctx, { w: fieldW, h, scrollX, view, top: fieldTop, bottom: h });

  // イベント描画
  const records = s.evels.records;
  const endClock = xToClock(view, scrollX + fieldW);
  const startClock = Math.max(0, xToClock(view, scrollX) - 10);

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

  for (const e of records) {
    if (e.kind === EventKind.NULL || e.unitNo < 0) continue;
    if (e.clock > endClock) break;
    if (e.clock + (e.kind === EventKind.ON ? e.value : 0) < startClock) continue;
    if (!doc.unitPinned[e.unitNo]) continue;
    switch (e.kind) {
      case EventKind.ON:
        notes.push({ unit: e.unitNo, clock: e.clock, length: e.value, vel: currentVel, vol: EVENTDEFAULT_VOLUME });
        break;
      case EventKind.VELOCITY:
        currentVel = e.value;
        break;
      case EventKind.KEY:
      case EventKind.PAN_VOLUME:
      case EventKind.PORTAMENT:
      case EventKind.VOICENO:
      case EventKind.GROUPNO:
      case EventKind.TUNING:
      case EventKind.PAN_TIME:
        marks.push({ unit: e.unitNo, clock: e.clock, kind: e.kind });
        break;
      default:
        break;
    }
  }

  // ノートバー (行 index = ピン留めリスト内の位置)
  for (const n of notes) {
    const rowIdx = pinned.indexOf(n.unit);
    if (rowIdx < 0) continue;
    const y = fieldTop + rowIdx * KEY_HEIGHT;
    const x = clockToX(view, n.clock) - scrollX;
    const xw = Math.max(2, clockToX(view, n.length));
    const play = currentClock.value >= n.clock && currentClock.value < n.clock + n.length;
    const fill = noteFill(n.unit, play, n.vel, n.vol);
    const shadow = noteShadow(n.unit, play, n.vel, n.vol);
    fillRect(ctx, x, y + 3, 2, KEY_HEIGHT - 6, shadow);
    fillRect(ctx, x + 1, y + 3, Math.max(1, xw - 2), KEY_HEIGHT - 6, fill);
    if (play) fillRect(ctx, x + 1, y + 2, 2, KEY_HEIGHT - 4, COLORS.playhead);
  }

  // その他イベントマーク
  for (const m of marks) {
    const rowIdx = pinned.indexOf(m.unit);
    if (rowIdx < 0) continue;
    const y = fieldTop + rowIdx * KEY_HEIGHT;
    const x = clockToX(view, m.clock) - scrollX;
    if (x < 0 || x > fieldW) continue;
    fillRect(ctx, x, y + 4, 1, KEY_HEIGHT - 8, COLORS.accentDark);
  }

  // スコープ帯
  if (doc.scope2 > doc.scope1) {
    const x1 = clockToX(view, doc.scope1) - scrollX;
    const x2 = clockToX(view, doc.scope2) - scrollX;
    drawScopeBand(ctx, x1, x2, fieldTop, fieldH, COLORS.scopeFaint);
  }

  // プレイヘッド
  if (isPlayingNow.value) {
    drawPlayhead(ctx, clockToX(view, currentClock.value) - scrollX, fieldW, h);
  }

  ctx.restore();

  // 左のユニット名 (translate 外)
  for (let i = 0; i < pinned.length; i++) {
    const y = fieldTop + i * KEY_HEIGHT;
    const u = pinned[i]!;
    const isFocus = u === doc.focusUnit;
    const bg = isFocus ? COLORS.focusRow : i % 2 === 0 ? "transparent" : COLORS.zebra;
    fillRect(ctx, 0, y, NAME_W, KEY_HEIGHT, bg);
    fillText(ctx, `${u}: ${units.value[u]?.name ?? ""}`, 2, y + 11, isFocus ? COLORS.focusText : COLORS.text, 10);
  }
}

// ---- ポインタ操作 ----
const drag = ref<{ button: number; x1: number; x2: number; unit: number; undoPushed: boolean } | null>(null);

// フィールド内の x → clock (ユニット名領域を除く)
function clockAt(x: number): number {
  return clockAtX(clockContext(), doc.divi, doc.scrollX, x, NAME_W);
}

function unitAt(y: number): number {
  const i = Math.floor((y - RULER_H) / KEY_HEIGHT);
  const pinned = pinnedUnits();
  if (i < 0 || i >= pinned.length) return -1;
  return pinned[i]!;
}

// 押下中サステインで試聴開始
function previewAt(x: number, y: number): void {
  const s = getService();
  if (!s) return;
  const u = unitAt(y);
  if (u < 0) return;
  const clock = clockAt(x);
  const key = s.evels.getValue(clock, u, EventKind.KEY) || EVENTDEFAULT_KEY;
  const vel = s.evels.getValue(clock, u, EventKind.VELOCITY) || EVENTDEFAULT_VELOCITY;
  previewUnitHold(u, key, vel);
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  const { x, y } = fieldOffset(c, e);
  if (y < RULER_H) {
    // ルーラー帯クリック = シーク (ユニット名領域は対象外)
    if (e.button === 0 && x >= NAME_W) seekToClock(clockAt(x));
    return;
  }
  const u = unitAt(y);
  const s = getService();
  if (!s) return;
  if (u < 0) return;
  if (e.button === 0) {
    c.setPointerCapture(e.pointerId);
    drag.value = { button: 0, x1: clockAt(x), x2: clockAt(x), unit: u, undoPushed: false };
    setScope(clockAt(x), clockAt(x) + Math.max(1, doc.divi));
    previewAt(x, y);
  } else if (e.button === 2) {
    c.setPointerCapture(e.pointerId);
    drag.value = { button: 2, x1: clockAt(x), x2: clockAt(x), unit: u, undoPushed: false };
  }
}

function onPointerMove(e: PointerEvent): void {
  const d = drag.value;
  if (!d) return;
  const { x } = fieldOffset(canvasRef.value!, e);
  const clock = clockAt(x);
  if (clock !== d.x2) {
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
    if (d.button === 0) setScope(c1, c1 + Math.max(1, doc.divi));
    return;
  }
  setScope(c1, c2);
  const u = d.unit;
  if (d.button === 0) {
    deleteEvents(c1, c2, u, EventKind.ON);
    deleteEvents(c1, c2, u, EventKind.VELOCITY);
    addEvent(c1, u, EventKind.ON, c2 - c1);
    addEvent(c1, u, EventKind.VELOCITY, EVENTDEFAULT_VELOCITY);
  } else {
    deleteEvents(c1, c2, u, EventKind.ON);
    deleteEvents(c1, c2, u, EventKind.KEY);
    deleteEvents(c1, c2, u, EventKind.VELOCITY);
  }
  doc.rev++;
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  if (c && c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
  stopPreview();
  const d = drag.value;
  drag.value = null;
  if (!d) return;
  if (d.undoPushed) {
    commitEdit();
  } else if (d.button === 0) {
    seekToClock(d.x1);
  }
}

// ホイール: Ctrl=ズーム / Shift=横スクロール
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
