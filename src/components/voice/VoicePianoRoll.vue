<script setup lang="ts">
// 縦型88鍵ピアノロール + ベロシティスライダー。
// 左クリックで押している間ホールド再生 (ドラッグで音階変更)、離すと停止。
// クリック (短い押下) でも必ず鳴るよう、最低 250ms は再生を継続する。
// Space は最後に触れたキーのホールド再生 (本家 ptuiOrganKey の VK_SPACE 準拠)。
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { COLORS } from "../../lib/theme";
import { fillRect, fillText } from "../../lib/draw";
import { isWhiteKey, codeToRow, rowToKeyValue, KEY_CODE_TOP, KEY_CODE_BOTTOM, KEY_HEIGHT } from "../../lib/clock";
import { currentVoice } from "../../state/voice";
import { previewWoiceObjectHold, stopPreview, clearWoicePreviewCache } from "../../engine/preview";
import { t } from "../../i18n";

const props = defineProps<{ editRev: number; active: boolean }>();

const voice = computed(() => currentVoice());
// ベロシティの初期値は本家 ptuiVelocity (ptvVelocity_Set(104)) に合わせる
const velocity = ref(104);
// 最後に触れたキー (Space 用)。初期値はコード 60 相当 (本家の初期 _tone_last_key 基準)
const lastKey = ref(rowToKeyValue(codeToRow(60)));

const ROW_NUM = KEY_CODE_TOP - KEY_CODE_BOTTOM + 1; // 88

const canvasRef = ref<HTMLCanvasElement | null>(null);
const scrollRef = ref<HTMLDivElement | null>(null);
const pressed = ref<number | null>(null); // 押下中のコード
const pressStart = ref(0);

useCanvas(canvasRef, draw, [() => voice.value, () => props.editRev, () => pressed.value, () => velocity.value]);

function draw(ctx: CanvasRenderingContext2D, w: number, _h: number): void {
  for (let row = 0; row < ROW_NUM; row++) {
    const code = KEY_CODE_TOP - row;
    const y = row * KEY_HEIGHT;
    const white = isWhiteKey(code);
    fillRect(ctx, 0, y, w, KEY_HEIGHT, white ? COLORS.whiteKey : COLORS.blackKey);
    // C (ド) のオクターブ番号
    if (code % 12 === 0) {
      fillText(ctx, String(Math.floor(code / 12) - 1), 2, y + KEY_HEIGHT - 3, COLORS.octaveText, 9);
    }
  }
  // 鍵盤の区切り線
  ctx.strokeStyle = COLORS.keyEdge;
  for (let row = 1; row < ROW_NUM; row++) {
    ctx.beginPath();
    ctx.moveTo(0.5, row * KEY_HEIGHT + 0.5);
    ctx.lineTo(w - 0.5, row * KEY_HEIGHT + 0.5);
    ctx.stroke();
  }
  // 押下中キーのハイライト
  if (pressed.value !== null) {
    const row = codeToRow(pressed.value);
    fillRect(ctx, 0, row * KEY_HEIGHT, w, KEY_HEIGHT, COLORS.focusOrange);
  }
}

// ピアノロールの y (スクロールオフセット込み) → コード
function codeAtY(y: number): number {
  return KEY_CODE_TOP - Math.floor(y / KEY_HEIGHT);
}

function playKey(code: number): void {
  lastKey.value = rowToKeyValue(codeToRow(code));
  const v = voice.value;
  if (!v) return;
  previewWoiceObjectHold(v.woice, lastKey.value, velocity.value);
}

function onPointerDown(e: PointerEvent): void {
  const c = canvasRef.value;
  const sc = scrollRef.value;
  if (!c || !sc) return;
  const r = c.getBoundingClientRect();
  const y = e.clientY - r.top + sc.scrollTop;
  const code = codeAtY(y);
  if (code < KEY_CODE_BOTTOM || code > KEY_CODE_TOP) return;
  pressed.value = code;
  pressStart.value = performance.now();
  playKey(code);
  c.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (pressed.value === null) return;
  const c = canvasRef.value;
  const sc = scrollRef.value;
  if (!c || !sc) return;
  const r = c.getBoundingClientRect();
  const y = e.clientY - r.top + sc.scrollTop;
  const code = codeAtY(y);
  if (code < KEY_CODE_BOTTOM || code > KEY_CODE_TOP) return;
  if (code !== pressed.value) {
    pressed.value = code;
    playKey(code);
  }
}

function onPointerUp(e: PointerEvent): void {
  const c = canvasRef.value;
  if (c && c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
  const code = pressed.value;
  pressed.value = null;
  if (code === null) return;
  // クリック (短い押下) でも必ず聴こえるよう、最低 250ms は鳴らしてから停止する
  const dur = performance.now() - pressStart.value;
  if (dur < 250) {
    setTimeout(() => {
      if (pressed.value === null) stopPreview();
    }, 250 - dur);
  } else {
    stopPreview();
  }
}

// ---- Space: 最後に触れたキーのホールド再生 ----
let spaceOn = false;

function onKeydown(e: KeyboardEvent): void {
  if (!props.active) return;
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.code !== "Space") return;
  e.preventDefault();
  if (e.repeat || spaceOn) return;
  spaceOn = true;
  const v = voice.value;
  if (!v) return;
  previewWoiceObjectHold(v.woice, lastKey.value, velocity.value);
}

function onKeyup(e: KeyboardEvent): void {
  if (e.code !== "Space") return;
  spaceOn = false;
  stopPreview();
}

// 音色編集・タブ切替時はプレビューキャッシュを破棄する
watch(
  () => props.editRev,
  () => clearWoicePreviewCache(),
);
watch(
  () => voice.value,
  () => clearWoicePreviewCache(),
);

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("keyup", onKeyup);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("keyup", onKeyup);
  stopPreview();
});
</script>

<template>
  <div class="vpr">
    <div ref="scrollRef" class="vpr-scroll">
      <canvas
        ref="canvasRef"
        class="field-canvas vpr-canvas"
        :style="{ height: ROW_NUM * KEY_HEIGHT + 'px' }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @contextmenu.prevent
      />
    </div>
    <div class="vpr-vel">
      <span class="vpr-vel-label">{{ t("voice.velocity") }}</span>
      <input type="range" class="vpr-vel-range" min="1" max="127" step="1" v-model.number="velocity" />
      <span class="vpr-vel-val">{{ velocity }}</span>
    </div>
  </div>
</template>

<style scoped>
.vpr {
  flex: none;
  width: 76px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  background: var(--card);
  padding: 4px;
}

.vpr-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.vpr-canvas {
  width: 100%;
}

.vpr-vel {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

.vpr-vel-label {
  font-size: 9px;
  color: var(--muted-foreground);
  writing-mode: vertical-rl;
}

.vpr-vel-range {
  flex: 1;
  min-width: 0;
  accent-color: var(--primary);
}

.vpr-vel-val {
  font-size: 10px;
  color: var(--muted-foreground);
  width: 22px;
  text-align: right;
}
</style>
