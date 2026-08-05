// 音色リスト (W モード)。型別色分け、選択、削除、並べ替え
<script setup lang="ts">
import { ref } from "vue";
import {
  woices,
  getService,
  removeWoice,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { previewWoice } from "../../engine/preview";
import { woiceTypeColor } from "../../lib/theme";

const menu = ref<{ x: number; y: number; w: number } | null>(null);

function onPointerDown(e: PointerEvent, idx: number): void {
  const s = getService();
  if (!s) return;
  if (e.button === 2) {
    menu.value = { x: e.clientX, y: e.clientY, w: idx };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  // 試聴
  const w = s.woiceGet(idx);
  if (w) previewWoice(idx, EVENTDEFAULT_KEY, 104, 0.8);
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
    case 1: // PCM
      return `${vc.pcm.sps}Hz/${vc.pcm.bps}bit/${vc.pcm.ch}ch ${(vc.pcm.sec * 1000).toFixed(0)}ms`;
    case 2: // PTV
      return vc.type === 0 ? `座標波形 (${vc.wave.num}点)` : vc.type === 1 ? `倍音 (${vc.wave.num}音)` : "?";
    case 3: // PTN
      return `${vc.ptn.unitNum}ユニット ${(vc.ptn.sec * 1000).toFixed(0)}ms`;
    default:
      return "";
  }
}
</script>

<template>
  <div class="tray">
    <div class="tray-title">音色 ({{ woices.length }})</div>
    <div class="tray-list" @contextmenu.prevent>
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
        音色がありません。<br />ツールパネルの「＋音色」から<br />.ptvoice / .ptnoise / .wav を追加
      </div>
    </div>
    <div v-if="menu" class="ctxmenu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <button class="danger" @click="onMenuAction('remove')">削除</button>
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
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
  background: var(--panel-light);
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
  color: var(--text);
  border-bottom: 1px solid rgba(52, 50, 85, 0.4);
  cursor: pointer;
}

.woice-row:hover {
  background: var(--panel-light);
}

.woice-name {
  color: var(--text-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.woice-type {
  font-size: 9px;
  color: var(--accent);
}

.woice-summary {
  font-size: 9px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tray-empty {
  padding: 8px;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.6;
}

.ctxmenu .danger {
  color: #ff8888;
}
</style>
