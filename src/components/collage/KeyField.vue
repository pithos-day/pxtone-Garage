// ピアノロール (K モード)
// 左ドラッグ: 音符 (KEY+ON+VELOCITY) 生成、右ドラッグ: 削除、鍵盤クリック: 試聴
// 行 → コード: row = 108 - code、イベント値: value = 0x8700 - row*0x100 (本家準拠)
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText } from "../../lib/draw";
import { fieldOffset, clockAtX, zoomByWheel } from "../../lib/field";
import {
  clockToX,
  xToClock,
  KEY_HEIGHT,
  KEYNUM,
  isWhiteRow,
  codeToRow,
  rowToKeyValue,
  keyValueToRow,
} from "../../lib/clock";
import { EventKind } from "pxtone-ts";
import { STRIP_W } from "../../lib/layout";
import {
  doc,
  getService,
  clockContext,
  beginEdit,
  commitEdit,
  addEvent,
  deleteEvents,
  setEventValue,
  setScope,
  pianoRollUnits,
  EVENTDEFAULT_VELOCITY,
  EVENTDEFAULT_VOLUME,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { previewUnitHold, stopPreview } from "../../engine/preview";
import { getUnitColor } from "../../lib/theme";

// 鍵盤ストリップの幅。ピアノ風の単音プレビュー領域で、左パネル (300px) の右に置く。
// 本家 144px から半分以下に縮小 (lib/layout.ts の STRIP_W)
const canvasRef = ref<HTMLCanvasElement | null>(null);

// フォーカスユニットの音域を画面中央に (本家の ResetScroll/JustScroll 相当)
function centerScroll(): void {
  const s = getService();
  let row = 39; // 既定キー 0x6000 の行
  if (s && doc.focusUnit >= 0) {
    const u = s.unitGet(doc.focusUnit);
    const vc = u?.woice?.getVoice(0);
    if (vc) row = codeToRow(vc.basicKey >> 8);
  }
  const fieldH = canvasRef.value?.clientHeight ?? 600;
  const visible = Math.max(1, Math.ceil(fieldH / KEY_HEIGHT));
  doc.scrollYKey = Math.max(0, Math.min(KEYNUM - 1, row - Math.floor(visible / 2)));
}

onMounted(centerScroll);
watch(() => doc.focusUnit, centerScroll);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [
    () => doc.rev,
    () => doc.scrollX,
    () => doc.scrollYKey,
    () => doc.zoom,
    () => doc.divi,
    () => doc.focusUnit,
    () => currentClock.value,
    () => doc.tool,
    () => doc.scope1,
    () => doc.scope2,
  ],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = clockContext();
  const scrollX = doc.scrollX;
  const fieldW = w - STRIP_W; // フィールド幅 (鍵盤ストリップの右側)

  const fieldTop = 0;
  const fieldH = h - fieldTop;
  const scrollY = doc.scrollYKey * KEY_HEIGHT;
  const startRow = Math.floor(scrollY / KEY_HEIGHT);
  const endRow = Math.min(KEYNUM - 1, startRow + Math.ceil(fieldH / KEY_HEIGHT));
  const focus = doc.focusUnit;

  // 鍵盤ストリップ (画面左端) の背景
  fillRect(ctx, 0, fieldTop, STRIP_W, fieldH, COLORS.panelDark);

  // フィールド (グリッド・ノート・スコープ・プレイヘッド) は鍵盤ストリップの右側に描画
  ctx.save();
  ctx.translate(STRIP_W, 0);

  // フィールド背景 + グリッド (拍・小節線)。ルーラー帯は PlayField が担当
  drawGrid(ctx, { w: fieldW, h, scrollX, view, top: fieldTop, bottom: h, showNumber: false });

  // フィールド側の行色 (鍵盤の白鍵/黒鍵に合わせた縞)
  for (let row = startRow; row <= endRow; row++) {
    const y = fieldTop + row * KEY_HEIGHT - scrollY;
    const white = isWhiteRow(row);
    fillRect(ctx, 0, y, fieldW, KEY_HEIGHT, white ? COLORS.rowWhite : COLORS.rowBlack);
  }

  // グリッド線を行色の上に再描画 (行色に覆われないように)
  drawGrid(ctx, { w: fieldW, h, scrollX, view, top: fieldTop, bottom: h, showNumber: false, fillBackground: false });

  // イベント (フォーカス + 表示 + ピン留めユニットを色分け表示)
  const rollUnits = pianoRollUnits();
  for (const u of rollUnits) {
    drawNotes(ctx, s, u, fieldW, fieldTop, fieldH, view, scrollX, scrollY, u === focus);
  }

  // スコープ帯
  if (doc.scope2 > doc.scope1) {
    const x1 = clockToX(view, doc.scope1) - scrollX;
    const x2 = clockToX(view, doc.scope2) - scrollX;
    fillRect(ctx, x1, fieldTop, Math.max(0, x2 - x1), fieldH, COLORS.scopeFaint);
  }

  // プレイヘッド
  if (isPlayingNow.value) {
    const px = clockToX(view, currentClock.value) - scrollX;
    if (px >= 0 && px <= fieldW) fillRect(ctx, px - 1, 0, 2, h, COLORS.playhead);
  }

  ctx.restore();

  // 鍵盤行 (ストリップ側) — フィールドのグリッドを覆う
  for (let row = startRow; row <= endRow; row++) {
    const y = fieldTop + row * KEY_HEIGHT - scrollY;
    const white = isWhiteRow(row);
    fillRect(ctx, 0, y, STRIP_W, KEY_HEIGHT, white ? COLORS.whiteKey : COLORS.blackKey);
  }

  // オクターブラベル (行 12*i に "7-i")
  for (let i = 0; i <= 8; i++) {
    const y = fieldTop + i * (KEY_HEIGHT * 12) - scrollY + 4;
    if (y >= fieldTop - 12 && y <= fieldTop + fieldH + 4) {
      fillText(ctx, String(7 - i), 6, y, COLORS.octaveText, 11);
    }
  }

  // 基本キーマーカー (フォーカスユニットの音色)
  const unit = focus >= 0 ? s.unitGet(focus) : null;
  if (unit?.woice) {
    const vc = unit.woice.getVoice(0);
    if (vc) {
      const basicRow = codeToRow(vc.basicKey >> 8);
      const y = fieldTop + basicRow * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
      if (y > fieldTop && y < fieldTop + fieldH) {
        fillRect(ctx, STRIP_W - 16, y - 1, 16, 2, COLORS.focusOrange);
      }
    }
  }
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  s: NonNullable<ReturnType<typeof getService>>,
  unitNo: number,
  w: number,
  fieldTop: number,
  fieldH: number,
  view: ReturnType<typeof clockContext>,
  scrollX: number,
  scrollY: number,
  isFocus: boolean,
): void {
  const records = s.evels.records;
  // 表示範囲 (clock)。scrollX は px なので xToClock で変換する
  const endClock = xToClock(view, scrollX + w);
  const startClock = Math.max(0, xToClock(view, scrollX) - 10);

  const color = getUnitColor(unitNo);
  let curKey = EVENTDEFAULT_KEY;
  let prevClock = startClock;

  // クリップ (translate 後の座標系なので 0..w がフィールド幅)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, fieldTop, w, fieldH);
  ctx.clip();
  // 非フォーカスユニットは半透明 (色分けして重ねて表示)
  if (!isFocus) ctx.globalAlpha = 0.45;

  const drawAt = (clock: number, key: number, len: number, depth: "off" | "on"): void => {
    const row = keyValueToRow(key);
    const y = fieldTop + row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
    const x1 = clockToX(view, Math.max(startClock, clock)) - scrollX;
    const x2 = clockToX(view, Math.min(endClock, clock + len)) - scrollX;
    if (x2 <= x1) return;
    if (depth === "off") {
      fillRect(ctx, x1, y - 1, x2 - x1, 2, color.shadow(false, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME));
    } else {
      const playing = currentClock.value >= clock && currentClock.value < clock + len;
      fillRect(ctx, x1, y - 3, x2 - x1, 7, color.note(playing, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME));
      // ヘッド
      fillRect(ctx, x1, y - 3, 2, 7, COLORS.noteHead);
    }
  };

  for (const e of records) {
    if (e.kind === EventKind.NULL) continue;
    if (e.unitNo !== unitNo) continue;
    if (e.clock > endClock) break;
    if (e.clock + (e.kind === EventKind.ON ? e.value : 0) < startClock) continue;
    if (e.kind === EventKind.ON) {
      if (e.clock > prevClock) drawAt(prevClock, curKey, e.clock - prevClock, "off");
      drawAt(e.clock, curKey, e.value, "on");
      prevClock = e.clock + e.value;
    } else if (e.kind === EventKind.KEY) {
      // KEY: 縦線 + 点
      if (e.clock > prevClock) drawAt(prevClock, curKey, e.clock - prevClock, "off");
      const row = keyValueToRow(e.value);
      const y = fieldTop + row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
      const x = clockToX(view, e.clock) - scrollX;
      fillRect(ctx, x - 1, y - 4, 2, 8, COLORS.noteHead);
      fillRect(ctx, x - 1, y - 4, 2, 2, COLORS.noteHead);
      curKey = e.value;
      prevClock = e.clock;
    }
  }
  // 末尾 OFF
  if (endClock > prevClock) drawAt(prevClock, curKey, endClock - prevClock, "off");

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- ポインタ ----
const drag = ref<{ button: number; x1: number; x2: number; row: number; undoPushed: boolean } | null>(null);

// フィールド内の x → clock。フィールドは鍵盤ストリップ (STRIP_W) の右から始まる
function clockAt(x: number): number {
  return clockAtX(clockContext(), doc.divi, doc.scrollX, x, STRIP_W);
}

function rowAt(y: number): number {
  return Math.floor(y / KEY_HEIGHT) + Math.floor(doc.scrollYKey);
}

// 押下中サステインで試聴開始 (pointerup まで鳴り続ける)
function previewAt(y: number): void {
  const s = getService();
  if (!s) return;
  const focus = doc.focusUnit;
  if (focus < 0) return;
  const row = Math.max(0, Math.min(KEYNUM - 1, rowAt(y)));
  const value = rowToKeyValue(row);
  previewUnitHold(focus, value, EVENTDEFAULT_VELOCITY);
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  const { x, y } = fieldOffset(c, e);
  const focus = doc.focusUnit;
  const s = getService();
  if (!s) return;
  if (focus < 0 || !s.unitGet(focus)) return;
  const row = Math.max(0, Math.min(KEYNUM - 1, rowAt(y)));
  const clock = clockAt(x);
  if (e.button === 0) {
    if (x < STRIP_W) {
      // 鍵盤ストリップ: 試聴のみ (シークしない)
      previewAt(y);
      return;
    }
    c.setPointerCapture(e.pointerId);
    drag.value = { button: 0, x1: clock, x2: clock, row, undoPushed: false };
    setScope(clock, clock + Math.max(1, doc.divi));
    previewAt(y);
  } else if (e.button === 2) {
    c.setPointerCapture(e.pointerId);
    drag.value = { button: 2, x1: clock, x2: clock, row, undoPushed: false };
  }
}

function onPointerMove(e: PointerEvent): void {
  const d = drag.value;
  if (!d) return;
  const { x } = fieldOffset(canvasRef.value!, e);
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
  const u = doc.focusUnit;
  if (u < 0) return;
  const c1 = Math.min(d.x1, d.x2);
  const c2 = Math.max(d.x1, d.x2);
  if (c2 <= c1) {
    if (d.button === 0) setScope(c1, c1 + Math.max(1, doc.divi));
    return;
  }
  setScope(c1, c2);
  const value = rowToKeyValue(d.row);
  const keyOnly = doc.tool === "hand";
  if (d.button === 0) {
    if (keyOnly) {
      setEventValue(c1, c2, u, EventKind.KEY, value);
      addEvent(c1, u, EventKind.KEY, value);
    } else {
      deleteEvents(c1, c2, u, EventKind.KEY);
      addEvent(c1, u, EventKind.KEY, value);
      deleteEvents(c1, c2, u, EventKind.VELOCITY);
      addEvent(c1, u, EventKind.VELOCITY, EVENTDEFAULT_VELOCITY);
      deleteEvents(c1, c2, u, EventKind.ON);
      addEvent(c1, u, EventKind.ON, c2 - c1);
    }
  } else {
    deleteEvents(c1, c2, u, EventKind.KEY);
    if (!keyOnly) {
      deleteEvents(c1, c2, u, EventKind.ON);
      deleteEvents(c1, c2, u, EventKind.VELOCITY);
    }
  }
  doc.rev++;
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  if (c && c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
  stopPreview(); // 押下中サステインを停止
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

function onWheel(e: WheelEvent): void {
  const zoom = zoomByWheel(e, doc.zoom);
  if (zoom !== null) {
    doc.zoom = zoom;
    return;
  }
  if (e.shiftKey) {
    doc.scrollX = Math.max(0, doc.scrollX + (e.deltaY > 0 ? 48 : -48));
    return;
  }
  doc.scrollYKey = Math.max(0, Math.min(KEYNUM - 1, doc.scrollYKey + Math.sign(e.deltaY)));
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
