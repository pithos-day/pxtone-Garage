// 音色リスト (W モード)。型別色分け、選択、削除、並べ替え
<script setup lang="ts">
import { ref } from "vue";
import {
  woices,
  getService,
  removeWoice,
  EVENTDEFAULT_KEY,
  EVENTDEFAULT_VELOCITY,
} from "../../state/project";
import { WoiceType, VoiceType } from "pxtone-ts";
import { previewWoiceHold, stopPreview } from "../../engine/preview";
import { woiceTypeColor } from "../../lib/theme";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
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
  if (w) previewWoiceHold(idx, EVENTDEFAULT_KEY, EVENTDEFAULT_VELOCITY);
}

function onPointerUp(): void {
  stopPreview();
}

function onMenuAction(action: "remove"): void {
  const w = menu.value?.w;
  menu.value = null;
  if (w === undefined) return;
  if (action === "remove") removeWoice(w);
}

// 音色の型別サマリ
function woiceSummary(idx: number): string {
  const s = getService();
  if (!s) return "";
  const w = s.woiceGet(idx);
  if (!w) return "";
  const vc = w.getVoice(0);
  if (!vc) return "";
  switch (w.type) {
    case WoiceType.PCM:
      return `${vc.pcm.sps}Hz/${vc.pcm.bps}bit/${vc.pcm.ch}ch ${(vc.pcm.sec * 1000).toFixed(0)}ms`;
    case WoiceType.PTV:
      return vc.type === VoiceType.Coodinate
        ? t("woice.summaryCoord").replace("{n}", String(vc.wave.num))
        : vc.type === VoiceType.Overtone
          ? t("woice.summaryOvertone").replace("{n}", String(vc.wave.num))
          : t("woice.summaryUnknown");
    case WoiceType.PTN:
      return t("woice.summaryPtn").replace("{n}", String(vc.ptn.unitNum)).replace("{ms}", (vc.ptn.sec * 1000).toFixed(0));
    default:
      return "";
  }
}
</script>

<template>
  <div class="tray">
    <div class="tray-title">{{ t("woice.title") }} ({{ woices.length }})</div>
    <div class="tray-list" @contextmenu.prevent @pointerup="onPointerUp">
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
    <div v-if="menu" class="ctxmenu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
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
  font-size: 11px;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
  background: var(--muted);
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
  font-size: 11px;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--row-border);
  cursor: pointer;
}

.woice-row:hover {
  background: var(--secondary);
}

.woice-name {
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.woice-type {
  font-size: 9px;
  color: var(--primary);
}

.woice-summary {
  font-size: 9px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tray-empty {
  padding: 8px;
  font-size: 11px;
  color: var(--muted-foreground);
  line-height: 1.6;
  white-space: pre-line;
}

.ctxmenu .danger {
  color: var(--danger-text);
}
</style>
