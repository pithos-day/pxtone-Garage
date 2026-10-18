// 音色リスト (W モード)。型別色分け、選択、削除、並べ替え
<script setup lang="ts">
import { computed, ref } from "vue";
import { Download, ExternalLink, SquarePen, RefreshCw, Trash2 } from "@lucide/vue";
import {
  doc,
  woices,
  getService,
  removeWoice,
  addWoice,
  replaceWoiceFile,
  detectWoiceType,
  woiceNameRaw,
  WoiceType,
  EVENTDEFAULT_KEY,
  EVENTDEFAULT_VELOCITY,
} from "../../state/project";
import { previewWoiceHold } from "../../engine/preview";
import { openWoiceAsVoice } from "../../state/voice";
import { openPtnAsNoise } from "../../state/noise";
import { currentProjectId, type WoiceLink } from "../../state/projects";
import { woiceTypeColor } from "../../lib/theme";
import { woiceSummary as formatWoiceSummary, WOICE_FILE_ACCEPT, WOICE_FILE_EXT_RE } from "../../lib/woice";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
import { useHoldPreview } from "../../composables/useHoldPreview";
import { capturePointer, releasePointerCapture } from "../../lib/field";
import { openFileDialog, exportWoiceFile, readBlobAndApply } from "../../engine/io";
import { t } from "../../i18n";
import WoicePropertyDialog from "./WoicePropertyDialog.vue";
import CtxMenuItem from "../shell/CtxMenuItem.vue";

const emit = defineEmits<{ (e: "open-editor", mode: "voice" | "noise"): void }>();

const menu = ref<{ x: number; y: number; w: number } | null>(null);
// プロパティダイアログ (本家 dlg_Woice 相当) の対象音色 index (-1 = 非表示)
const propIdx = ref(-1);
const trayListRef = ref<HTMLElement | null>(null);

useCtxMenuClose(menu);

// 音色が編集エディタ (ptvoice/ptnoise) で開ける型か (PCM/OGGV は対象外)
function hasEditorType(idx: number): boolean {
  const w = woices.value.find((x) => x.index === idx);
  return w?.type === WoiceType.PTV || w?.type === WoiceType.PTN;
}

// "音色を編集" / "音色を開く" を出せるか
const menuHasEditor = computed(() => (menu.value ? hasEditorType(menu.value.w) : false));

function onPointerDown(e: PointerEvent, idx: number): void {
  const s = getService();
  if (!s) return;
  if (e.button === 2) {
    // 読み取り専用タブでも「音色を開く」「音色を保存」は出せる (編集系はテンプレート側で出さない)
    menu.value = { x: e.clientX, y: e.clientY, w: idx };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  // 押下中サステインで試聴 (pointerup まで鳴り続ける)。
  // ポインタがリスト外でリリースされても pointerup を拾えるよう capture する
  const w = s.woiceGet(idx);
  if (w) {
    capturePointer(trayListRef.value, e);
    hold.onPress();
    previewWoiceHold(idx, EVENTDEFAULT_KEY, EVENTDEFAULT_VELOCITY);
  }
}

const hold = useHoldPreview();
function onPointerUp(e: PointerEvent): void {
  hold.onRelease();
  releasePointerCapture(trayListRef.value, e);
}

function onMenuAction(action: "remove" | "replace" | "properties" | "openEditor" | "save"): void {
  const w = menu.value?.w;
  menu.value = null;
  if (w === undefined) return;
  if (action === "remove") removeWoice(w);
  else if (action === "replace") void replaceByDialog(w);
  // 音色を元フォーマット (ptvoice/ptnoise/ogg/wav) でダウンロードする
  else if (action === "save") void saveWoiceFile(w);
  // プロパティ (名前 / チューニング / 基本キー / フラグ) を編集する
  else if (action === "properties") propIdx.value = w;
  // 音色エディタ (ptvoice/ptnoise) で開く。編集可能タブでは書き戻し先 (元の
  // Collage プロジェクトの音色) をタブに持たせ、読み取り専用タブでは link なしで開く
  else if (action === "openEditor") {
    openWoiceInEditor(w, doc.readOnly ? undefined : { projectId: currentProjectId.value, woiceIndex: w });
  }
}

// 音色を元フォーマットのファイルとして保存する (保存ピッカー / ダウンロード)
async function saveWoiceFile(idx: number): Promise<void> {
  const w = getService()?.woiceGet(idx);
  if (!w) return;
  const err = await exportWoiceFile(w, woiceNameRaw(w) || "woice");
  if (err) console.error(err);
}

// 音色を ptvoice/ptnoise エディタで開き、そちらのモードタブへ移動する。
// 開くのはコピーで、元の Collage の音色は変化しない。
// link を渡した場合のみ、File メニューの「変更を適用」で元の音色へ書き戻せる
function openWoiceInEditor(idx: number, link: WoiceLink | undefined): void {
  const w = getService()?.woiceGet(idx);
  if (!w) return;
  const name = woiceNameRaw(w);
  if (w.type === WoiceType.PTV) {
    if (openWoiceAsVoice(w, name, link)) emit("open-editor", "voice");
    return;
  }
  if (w.type === WoiceType.PTN) {
    const ptn = w.getVoice(0)?.ptn;
    if (ptn && openPtnAsNoise(ptn, name, link)) emit("open-editor", "noise");
  }
}

// ファイル選択ダイアログで選んだ別の音色で、指定 index の音色を置き換える
async function replaceByDialog(idx: number): Promise<void> {
  const opened = await openFileDialog(WOICE_FILE_ACCEPT, WOICE_FILE_EXT_RE);
  if (!opened) return;
  const err = await readBlobAndApply(t("progress.woiceTitle"), opened.file, (bytes) =>
    replaceWoiceFile(idx, bytes, detectWoiceType(bytes), opened.name),
  );
  if (err) console.error(err);
}

// 音色ファイルのドラッグ&ドロップ追加。拡張子は除いて音色名にする
async function onDrop(e: DragEvent): Promise<void> {
  // 読み取り専用タブでは追加不可
  if (doc.readOnly) return;
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const name = file.name.replace(WOICE_FILE_EXT_RE, "");
  // 読み込み (実進捗) → 適用 (解析・追加)。キャンセル時は null
  const err = await readBlobAndApply(t("progress.woiceTitle"), file, (bytes) => addWoice(bytes, detectWoiceType(bytes), name));
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
    <div ref="trayListRef" class="tray-list" @contextmenu.prevent @pointerup="onPointerUp" @pointercancel="onPointerUp" @dragover.prevent @drop.prevent="onDrop">
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
      <CtxMenuItem v-if="!doc.readOnly" :icon="SquarePen" @click="onMenuAction('properties')">{{ t("woice.edit") }}</CtxMenuItem>
      <CtxMenuItem v-if="menuHasEditor" :icon="ExternalLink" @click="onMenuAction('openEditor')">{{ t("woice.open") }}</CtxMenuItem>
      <CtxMenuItem :icon="Download" @click="onMenuAction('save')">{{ t("woice.save") }}</CtxMenuItem>
      <template v-if="!doc.readOnly">
        <CtxMenuItem :icon="RefreshCw" @click="onMenuAction('replace')">{{ t("woice.replace") }}</CtxMenuItem>
        <CtxMenuItem :icon="Trash2" danger @click="onMenuAction('remove')">{{ t("common.delete") }}</CtxMenuItem>
      </template>
    </div>
    <WoicePropertyDialog v-if="propIdx >= 0" :woice-idx="propIdx" @close="propIdx = -1" />
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
</style>
