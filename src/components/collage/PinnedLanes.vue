// ピン留めユニットのイベントレーン (画面上部固定表示)
// ピン留めしたユニットの行のみを表示し、クリック/ドラッグで編集できる
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { useCanvasDrag } from "../../composables/useCanvasDrag";
import { useHoldPreview } from "../../composables/useHoldPreview";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText, noteFill, noteShadow,
  drawPlayhead,
  drawScopeBand,
} from "../../lib/draw";
import { clockAtX, zoomAnchorScrollX, zoomOrPan } from "../../lib/field";
import { clockToX } from "../../lib/clock";
import { iterVisibleRecords, visibleClockWindow } from "../../lib/records";
import { KEY_HEIGHT } from "../../lib/clock";
import { RULER_H, NAME_W } from "../../lib/layout";
import { EventKind } from "pxtone-ts";
import { writeNoteLength, eraseNote } from "../../lib/editing";
import {
  doc,
  units,
  getService,
  clockContext,
  projectWriteOps,
  pinnedUnits,
  EVENTDEFAULT_VOLUME,
  EVENTDEFAULT_VELOCITY,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { previewUnitHold } from "../../engine/preview";

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
  const { startClock, endClock } = visibleClockWindow(view, scrollX, fieldW);

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

  for (const e of iterVisibleRecords(records, { startClock, endClock }, (e) => e.unitNo >= 0 && doc.unitPinned[e.unitNo])) {
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
// ドラッグの骨格 (pointerdown/move/up + キャプチャ + undo) は useCanvasDrag が担当し、
// ルーラーシーク・試聴・イベント書き換えのみを注入する
type LanesDrag = { button: number; clock1: number; clock2: number; unit: number };

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

const hold = useHoldPreview();
// 押下中サステインで試聴開始
function previewAt(x: number, y: number): void {
  const s = getService();
  if (!s) return;
  const u = unitAt(y);
  if (u < 0) return;
  const clock = clockAt(x);
  const key = s.evels.getValue(clock, u, EventKind.KEY) || EVENTDEFAULT_KEY;
  const vel = s.evels.getValue(clock, u, EventKind.VELOCITY) || EVENTDEFAULT_VELOCITY;
  hold.onPress();
  previewUnitHold(u, key, vel);
}

function applyDrag(d: LanesDrag): void {
  // 読み取り専用タブでは書き込まない (シーク用の onClick のみ有効)
  if (doc.readOnly) return;
  const s = getService();
  if (!s) return;
  const c1 = Math.min(d.clock1, d.clock2);
  const c2 = Math.max(d.clock1, d.clock2);
  if (c2 <= c1) return;
  // レーンのドラッグでスコープを書き換えない (範囲選択は ScopeField 側)
  const u = d.unit;
  if (d.button === 0) {
    writeNoteLength(projectWriteOps, c1, c2, u, EVENTDEFAULT_VELOCITY);
  } else {
    eraseNote(projectWriteOps, c1, c2, u, { key: true, onVel: true });
  }
  doc.rev++;
}

const { onPointerDown, onPointerMove, onPointerUp } = useCanvasDrag<LanesDrag>({
  canvasRef,
  clockAt,
  beginDrag(e, pt) {
    if (pt.y < RULER_H) {
      // ルーラー帯クリック = シーク (ユニット名領域は対象外)
      if (e.button === 0 && pt.x >= NAME_W) seekToClock(clockAt(pt.x));
      return null;
    }
    const u = unitAt(pt.y);
    const s = getService();
    if (!s || u < 0) return null;
    const clock = clockAt(pt.x);
    if (e.button === 0) {
      if (doc.readOnly) {
        // 読み取り専用: 試聴のみ行い、クリック時はシークする (書き換えなし)
        previewAt(pt.x, pt.y);
        return { button: 0, clock1: clock, clock2: clock, unit: u };
      }
      previewAt(pt.x, pt.y);
      return { button: 0, clock1: clock, clock2: clock, unit: u };
    }
    if (e.button === 2) {
      if (doc.readOnly) return null;
      return { button: 2, clock1: clock, clock2: clock, unit: u };
    }
    return null;
  },
  applyDrag,
  onClick(d) {
    if (d.button === 0) {
      // ドラッグなしのクリック = シーク
      seekToClock(d.clock1);
    }
  },
  onEnd() {
    hold.onRelease();
  },
});

// ホイール: Ctrl=ズーム (カーソル位置基準) / Shift=横スクロール
function onWheel(e: WheelEvent): void {
  const { zoom, pan } = zoomOrPan(e, doc.zoom);
  if (zoom !== null) {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (rect) doc.scrollX = zoomAnchorScrollX(doc.zoom, zoom, doc.scrollX, e.clientX - rect.left, NAME_W);
    doc.zoom = zoom;
  } else if (pan !== null) doc.scrollX = Math.max(0, doc.scrollX + pan);
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
