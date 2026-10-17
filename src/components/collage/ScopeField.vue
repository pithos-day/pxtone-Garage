// 選択範囲 (スコープ) 表示帯 (本家準拠)。左ドラッグで範囲選択。
// 左クリック = シーク + 範囲選択解除 + 貼り付けメニュー (点選択)。
// 右クリック = 範囲があれば編集メニュー (コピー/切り取り/クリア/消去/移調)、
// なければ貼り付けメニュー。押下位置をグリッド (divi) にスナップし [scope1, scope2) を更新する
// (逆方向のドラッグは setScope が小さい方を scope1 にする)
<script setup lang="ts">
import { ref } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, drawPlayhead, drawScopeBand } from "../../lib/draw";
import { clockToX } from "../../lib/clock";
import { capturePointer, clockAtX, fieldOffset, releasePointerCapture } from "../../lib/field";
import {
  doc,
  clockContext,
  setScope,
  scopeCopy,
  scopeCut,
  scopeClear,
  scopeDelete,
  scopePaste,
  scopeInsert,
  scopeClipReady,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
import { t } from "../../i18n";

const emit = defineEmits<{ (e: "transpose"): void }>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
// 左ドラッグの範囲選択状態 (clock1 = 押下位置、clock2 = 現在位置。どちらもスナップ済み)
let drag: { clock1: number; clock2: number; moved: boolean } | null = null;
// コンテキストメニュー。kind: "point" = 範囲未選択 (貼り付け/挿入)、"scope" = 選択中 (編集系)。
// clock は押下位置 (貼り付け/挿入の基準)、canPaste はメニューを開いた時点のクリップボードの有無
const menu = ref<{ x: number; y: number; clock: number; kind: "point" | "scope"; canPaste: boolean } | null>(null);

useCtxMenuClose(menu);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [() => doc.rev, () => doc.scrollX, () => doc.zoom, () => doc.scope1, () => doc.scope2, () => currentClock.value],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const view = clockContext();
  // 帯色は半透明のため fieldBg の上に重ねる (canvas 下の --background が透けないように)
  fillRect(ctx, 0, 0, w, h, COLORS.fieldBg);
  fillRect(ctx, 0, 0, w, h, COLORS.scopefieldBg);
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: h, showNumber: false, fillBackground: false });
  if (doc.scope2 > doc.scope1) {
    const x1 = clockToX(view, doc.scope1) - doc.scrollX;
    const x2 = clockToX(view, doc.scope2) - doc.scrollX;
    // 中央と縁で明暗が分かれないよう、帯全体を同じ色で塗る
    drawScopeBand(ctx, x1, x2, 0, h, COLORS.scope);
  }
  // プレイヘッド (再生バー)
  if (isPlayingNow.value) {
    drawPlayhead(ctx, clockToX(view, currentClock.value) - doc.scrollX, w, h);
  }
}

// 画面 x (canvas 座標 px) → グリッドにスナップしたクロック
function clockAt(x: number): number {
  return clockAtX(clockContext(), doc.divi, doc.scrollX, x);
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!c) return;
  if (e.button === 0) {
    const clock = clockAt(fieldOffset(c, e).x);
    drag = { clock1: clock, clock2: clock, moved: false };
    capturePointer(c, e);
    return;
  }
  if (e.button === 2) {
    // 右クリック = コンテキストメニュー。選択範囲の有無で中身が変わる (本家準拠)
    // 読み取り専用タブでは出さない (PlayField と同じ)
    if (doc.readOnly) return;
    menu.value = {
      x: e.clientX,
      y: e.clientY,
      clock: clockAt(fieldOffset(c, e).x),
      kind: doc.scope2 > doc.scope1 ? "scope" : "point",
      canPaste: scopeClipReady(),
    };
  }
}

function onPointerMove(e: PointerEvent): void {
  const c = canvasRef.value;
  if (!drag || !c) return;
  const clock = clockAt(fieldOffset(c, e).x);
  // スナップ位置が変わったときだけ更新する (連続する pointermove での再描画を抑える)
  if (clock === drag.clock2) return;
  drag.clock2 = clock;
  drag.moved = true;
  setScope(drag.clock1, clock);
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  releasePointerCapture(c, e);
  const d = drag;
  drag = null;
  if (!d || d.moved || e.button !== 0) return;
  // 左クリック (ドラッグなし) = シーク + 範囲選択解除 + 貼り付けメニュー (本家準拠)。
  // 選択範囲は押下位置の 1 点にする (draw は scope1 == scope2 を帯なしとして描画する)
  seekToClock(d.clock1);
  setScope(d.clock1, d.clock1);
  if (!doc.readOnly) {
    menu.value = { x: e.clientX, y: e.clientY, clock: d.clock1, kind: "point", canPaste: scopeClipReady() };
  }
}

type MenuAction = "copy" | "cut" | "clear" | "delete" | "transpose" | "paste" | "insert";

function onMenuAction(action: MenuAction): void {
  const m = menu.value;
  menu.value = null;
  if (!m) return;
  switch (action) {
    // 範囲メニュー: 現在の選択範囲に対して操作する
    case "copy":
      scopeCopy(doc.scope1, doc.scope2);
      break;
    case "cut":
      scopeCut(doc.scope1, doc.scope2);
      break;
    case "clear":
      scopeClear(doc.scope1, doc.scope2);
      break;
    case "delete":
      scopeDelete(doc.scope1, doc.scope2);
      break;
    case "transpose":
      // 移調は既存のイベント音量ダイアログを KEY 種別で開く (本家 DLG_EVENTVOLUME 相当)
      emit("transpose");
      break;
    // ポイントメニュー: 押下位置を貼り付け基準にする
    case "paste":
      scopePaste(m.clock);
      break;
    case "insert":
      scopeInsert(m.clock);
      break;
  }
}
</script>

<template>
  <div class="scopefield">
    <canvas
      ref="canvasRef"
      class="field-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @contextmenu.prevent
    />
    <div v-if="menu" class="ctxmenu popup" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <template v-if="menu.kind === 'point'">
        <button :disabled="!menu.canPaste" @click="onMenuAction('paste')">{{ t("scope.paste") }}</button>
        <button :disabled="!menu.canPaste" @click="onMenuAction('insert')">{{ t("scope.insert") }}</button>
      </template>
      <template v-else>
        <button @click="onMenuAction('copy')">{{ t("scope.copy") }}</button>
        <button @click="onMenuAction('cut')">{{ t("scope.cut") }}</button>
        <button @click="onMenuAction('clear')">{{ t("scope.clear") }}</button>
        <button @click="onMenuAction('delete')">{{ t("scope.delete") }}</button>
        <button @click="onMenuAction('transpose')">{{ t("scope.transpose") }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.scopefield {
  /* 音階1個分 (KEY_HEIGHT) と同じ高さ */
  height: var(--key-h);
  position: relative;
  border-bottom: 1px solid var(--border);
}
</style>
