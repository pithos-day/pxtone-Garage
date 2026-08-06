// ピアノロール (K モード)
// 左ドラッグ: 音符 (KEY+ON+VELOCITY) 生成、右ドラッグ: 削除、鍵盤クリック: 試聴
// 行 → コード: row = 108 - code、イベント値: value = 0x8700 - row*0x100 (本家準拠)
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText } from "../../lib/draw";
import {
  clockToX,
  xToClock,
  snapClock,
  KEY_HEIGHT,
  KEYNUM,
  ZOOM_TABLE,
  isWhiteRow,
  codeToRow,
} from "../../lib/clock";
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
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { previewUnitHold, stopPreview } from "../../engine/preview";
import { getUnitColor } from "../../lib/theme";

const BAND = 12;
const STRIP_W = 144;
const canvasRef = ref<HTMLCanvasElement | null>(null);

// 行 → KEY イベント値 (本家の生成式: value = 0x8700 - row*0x100)
function valueAtRow(row: number): number {
  return 0x8700 - row * 0x100;
}

// KEY 値 → 行
function rowOfValue(value: number): number {
  return (0x8700 - value) / 0x100;
}

// フォーカスユニットの音域を画面中央に (本家の ResetScroll/JustScroll 相当)
function centerScroll(): void {
  const s = getService();
  let row = 39; // 既定キー 0x6000 の行
  if (s && doc.focusUnit >= 0) {
    const u = s.unitGet(doc.focusUnit);
    const vc = u?.woice?.getVoice(0);
    if (vc) row = codeToRow(vc.basicKey >> 8);
  }
  const fieldH = (canvasRef.value?.clientHeight ?? 600) - BAND;
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
  const view = projectClockView();
  const scrollX = doc.scrollX;
  const fieldW = w - STRIP_W; // フィールド幅 (鍵盤ストリップの右側)

  const fieldTop = BAND;
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

  // ルーラー帯 (小節番号) — フィールド幅のみ
  drawGrid(ctx, { w: fieldW, h, scrollX, view, top: 0, bottom: BAND, showNumber: true, numberTop: 0 });

  // フィールド背景 + グリッド (拍・小節線)
  drawGrid(ctx, { w: fieldW, h, scrollX, view, top: fieldTop, bottom: h, showNumber: false });

  // フィールド側の行色 (鍵盤の白鍵/黒鍵に合わせた縞)
  for (let row = startRow; row <= endRow; row++) {
    const y = fieldTop + row * KEY_HEIGHT - scrollY;
    const white = isWhiteRow(row);
    fillRect(ctx, 0, y, fieldW, KEY_HEIGHT, white ? "rgba(64,64,64,0.30)" : "rgba(32,32,32,0.30)");
  }

  // イベント (フォーカスユニットのみ)
  if (focus >= 0) {
    drawNotes(ctx, s, focus, fieldW, fieldTop, fieldH, view, scrollX, scrollY);
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
      fillText(ctx, String(7 - i), 6, y, "#e0e0e0", 11);
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
  view: ReturnType<typeof projectClockView>,
  scrollX: number,
  scrollY: number,
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

  const drawAt = (clock: number, key: number, len: number, depth: "off" | "on"): void => {
    const row = rowOfValue(key);
    const y = fieldTop + row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
    const x1 = clockToX(view, Math.max(startClock, clock)) - scrollX;
    const x2 = clockToX(view, Math.min(endClock, clock + len)) - scrollX;
    if (x2 <= x1) return;
    if (depth === "off") {
      fillRect(ctx, x1, y - 1, x2 - x1, 2, color.shadow(false, 104, 104));
    } else {
      const playing = currentClock.value >= clock && currentClock.value < clock + len;
      fillRect(ctx, x1, y - 3, x2 - x1, 7, color.note(playing, 104, 104));
      // ヘッド
      fillRect(ctx, x1, y - 3, 2, 7, "#ffffff");
    }
  };

  for (const e of records) {
    if (e.kind === 0) continue;
    if (e.unitNo !== unitNo) continue;
    if (e.clock > endClock) break;
    if (e.clock + (e.kind === 1 ? e.value : 0) < startClock) continue;
    if (e.kind === 1) {
      // ON
      if (e.clock > prevClock) drawAt(prevClock, curKey, e.clock - prevClock, "off");
      drawAt(e.clock, curKey, e.value, "on");
      prevClock = e.clock + e.value;
    } else if (e.kind === 2) {
      // KEY: 縦線 + 点
      if (e.clock > prevClock) drawAt(prevClock, curKey, e.clock - prevClock, "off");
      const row = rowOfValue(e.value);
      const y = fieldTop + row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
      const x = clockToX(view, e.clock) - scrollX;
      fillRect(ctx, x - 1, y - 4, 2, 8, "#ffffff");
      fillRect(ctx, x - 1, y - 4, 2, 2, "#ffffff");
      curKey = e.value;
      prevClock = e.clock;
    }
  }
  // 末尾 OFF
  if (endClock > prevClock) drawAt(prevClock, curKey, endClock - prevClock, "off");

  ctx.restore();
}

// ---- ポインタ ----
const drag = ref<{ button: number; x1: number; x2: number; row: number; undoPushed: boolean } | null>(null);

function fieldOffset(e: PointerEvent): { x: number; y: number } {
  const c = canvasRef.value!;
  const r = c.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// フィールド内の x → clock。フィールドは鍵盤ストリップ (STRIP_W) の右から始まる
function clockAt(x: number): number {
  const view = projectClockView();
  return snapClock(view, doc.divi, xToClock(view, x - STRIP_W + doc.scrollX));
}

function rowAt(y: number): number {
  return Math.floor((y - BAND) / KEY_HEIGHT) + Math.floor(doc.scrollYKey);
}

// 押下中サステインで試聴開始 (pointerup まで鳴り続ける)
function previewAt(y: number): void {
  const s = getService();
  if (!s) return;
  const focus = doc.focusUnit;
  if (focus < 0) return;
  const row = Math.max(0, Math.min(KEYNUM - 1, rowAt(y)));
  const value = valueAtRow(row);
  previewUnitHold(focus, value, EVENTDEFAULT_VELOCITY);
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  const { x, y } = fieldOffset(e);
  if (y < BAND) {
    // ルーラー帯クリック = シーク (鍵盤ストリップの上は対象外)
    if (e.button === 0 && x >= STRIP_W) seekToClock(clockAt(x));
    return;
  }
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
  const u = doc.focusUnit;
  if (u < 0) return;
  const c1 = Math.min(d.x1, d.x2);
  const c2 = Math.max(d.x1, d.x2);
  if (c2 <= c1) {
    if (d.button === 0) setScope(c1, c1 + Math.max(1, doc.divi));
    return;
  }
  setScope(c1, c2);
  const value = valueAtRow(d.row);
  const keyOnly = doc.tool === "hand";
  if (d.button === 0) {
    if (keyOnly) {
      setEventValue(c1, c2, u, 2, value);
      addEvent(c1, u, 2, value);
    } else {
      deleteEvents(c1, c2, u, 2);
      addEvent(c1, u, 2, value);
      deleteEvents(c1, c2, u, 4);
      addEvent(c1, u, 4, EVENTDEFAULT_VELOCITY);
      deleteEvents(c1, c2, u, 1);
      addEvent(c1, u, 1, c2 - c1);
    }
  } else {
    deleteEvents(c1, c2, u, 2);
    if (!keyOnly) {
      deleteEvents(c1, c2, u, 1);
      deleteEvents(c1, c2, u, 4);
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
  if (e.ctrlKey) {
    e.preventDefault();
    const idx = (ZOOM_TABLE as readonly number[]).indexOf(doc.zoom);
    const next = e.deltaY < 0 ? Math.min(ZOOM_TABLE.length - 1, idx + 1) : Math.max(0, idx - 1);
    doc.zoom = ZOOM_TABLE[next]!;
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
