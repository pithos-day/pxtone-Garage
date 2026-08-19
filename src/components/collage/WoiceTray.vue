// 音色リスト (W モード)。型別色分け、選択、削除、並べ替え
<script setup lang="ts">
import { ref } from "vue";
import {
  woices,
  getService,
  removeWoice,
  addWoice,
  replaceWoiceFile,
  detectWoiceType,
  EVENTDEFAULT_KEY,
  EVENTDEFAULT_VELOCITY,
} from "../../state/project";
import { previewWoiceHold } from "../../engine/preview";
import { woiceTypeColor } from "../../lib/theme";
import { woiceSummary as formatWoiceSummary } from "../../lib/woice";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
import { useHoldPreview } from "../../composables/useHoldPreview";
import { openFileDialog } from "../../engine/io";
import { t } from "../../i18n";

const menu = ref<{ x: number; y: number; w: number } | null>(null);

useCtxMenuClose(menu);

function onPointerDown(e: PointerEvent, idx: number): void {
  const s = getService();
  if (!s) return;
  if (e.button === 2) {
    menu.value = { x: e.clientX, y: e.clientY, w: idx };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  // 押下中サステインで試聴 (pointerup まで鳴り続ける)
  const w = s.woiceGet(idx);
  if (w) {
    hold.onPress();
    previewWoiceHold(idx, EVENTDEFAULT_KEY, EVENTDEFAULT_VELOCITY);
  }
}

const hold = useHoldPreview();
function onPointerUp(): void {
  hold.onRelease();
}

function onMenuAction(action: "remove" | "replace"): void {
  const w = menu.value?.w;
  menu.value = null;
  if (w === undefined) return;
  if (action === "remove") removeWoice(w);
  else if (action === "replace") void replaceByDialog(w);
}

// ファイル選択ダイアログで選んだ別の音色で、指定 index の音色を置き換える
async function replaceByDialog(idx: number): Promise<void> {
  const file = await openFileDialog(".ptvoice,.ptnoise,.wav,.ogg", /\.(ptvoice|ptnoise|wav|ogg)$/i);
  if (!file) return;
  const err = await replaceWoiceFile(idx, file.bytes, detectWoiceType(file.bytes), file.name);
  if (err) console.error(err);
}

// 音色ファイルのドラッグ&ドロップ追加。拡張子は除いて音色名にする
async function onDrop(e: DragEvent): Promise<void> {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const name = file.name.replace(/\.(ptvoice|ptnoise|wav|ogg)$/i, "");
  const err = await addWoice(bytes, detectWoiceType(bytes), name);
  if (err) console.error(err);
}

// 音色の型別サマリ (フォーマット本体は lib/woice.ts)
function woiceSummary(idx: number): string {
  const s = getService();
  if (!s) return "";
  const w = s.woiceGet(idx);
  return w ? formatWoiceSummary(w) : "";
}
</script>

<template>
  <div class="tray">
    <div class="tray-title">{{ t("woice.title") }} ({{ woices.length }})</div>
    <div class="tray-list" @contextmenu.prevent @pointerup="onPointerUp" @dragover.prevent @drop.prevent="onDrop">
      <div
        v-for="w in woices"
        :key="w.index"
        class="woice-row"
        :style="{ borderLeft: '4px solid ' + woiceTypeColor(w.type) }"
        @pointerdown="onPointerDown($event, w.index)"
      >
        <span class="woice-name" :title="w.name">{{ w.index }}. {{ w.name }}</span>
        <span class="woice-type">{{ w.typeName }}</span>
        <span class="woice-summary">{{ woiceSummary(w.index) }}</span>
      </div>
      <div v-if="woices.length === 0" class="tray-empty">
        {{ t("woice.empty") }}
      </div>
    </div>
    <div v-if="menu" class="ctxmenu popup" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <button @click="onMenuAction('replace')">{{ t("woice.replace") }}</button>
      <button class="danger" @click="onMenuAction('remove')">{{ t("common.delete") }}</button>
    </div>
  </div>
</template>

<style scoped>
.tray {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  user-select: none;
}

.tray-title {
  padding: 3px 6px;
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
  background: var(--background);
}

.tray-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
}

.woice-row {
  display: flex;
  flex-direction: column;
  padding: 2px 4px;
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  cursor: pointer;
}

.woice-row:hover {
  background: var(--card);
}

.woice-row:hover:not(.focus) .woice-name {
  color: var(--card-foreground);
}

.woice-row:hover:not(.focus) .woice-summary {
  color: var(--card-foreground);
}

.woice-name {
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.woice-type {
  font-size: var(--text-2xs);
  color: var(--primary);
}

.woice-summary {
  font-size: var(--text-2xs);
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tray-empty {
  padding: 8px;
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  line-height: 1.6;
  white-space: pre-line;
}

.ctxmenu .danger {
  color: var(--destructive);
}
</style>
