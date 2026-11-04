<script setup lang="ts">
// モード切替 (W/U) + ピアノロールのツール
import { Music2, Piano, MousePointer2, Pencil, Pointer } from "@lucide/vue";
import { doc } from "../../state/project";
import { formatShortcut } from "../../state/keybindings";
import { t } from "../../i18n";
</script>

<template>
  <div class="toolpanel">
    <div class="tool-mode">
      <button class="btn btn-sm mode" :class="{ on: doc.mode === 'W' }" :title="`${t('tool.woiceManage')} (${formatShortcut('modeW')})`" @click="doc.mode = 'W'"><Music2 :size="18" /></button>
      <button class="btn btn-sm mode" :class="{ on: doc.mode === 'U' }" :title="`${t('tool.unitManage')} (${formatShortcut('modeU')})`" @click="doc.mode = 'U'"><Piano :size="18" /></button>
      <span class="tool-sep" />
      <!-- ピアノロールのツールは W/U どちらのモードでも切り替えられる -->
      <button class="btn btn-sm mode" :class="{ on: doc.tool === 'smart' }" :title="`${t('tool.smart')} (${formatShortcut('toolSmart')})`" @click="doc.tool = 'smart'"><MousePointer2 :size="18" /></button>
      <button class="btn btn-sm mode" :class="{ on: doc.tool === 'pen' }" :title="`${t('tool.pen')} (${formatShortcut('toolPen')})`" @click="doc.tool = 'pen'"><Pencil :size="18" /></button>
      <button class="btn btn-sm mode" :class="{ on: doc.tool === 'hand' }" :title="`${t('tool.hand')} (${formatShortcut('toolHand')})`" @click="doc.tool = 'hand'"><Pointer :size="18" /></button>
    </div>
  </div>
</template>

<style scoped>
.toolpanel {
  flex: none;
  display: flex;
  padding: 5px 7px;
  border-bottom: 1px solid var(--border);
  background: var(--background);
  user-select: none;
}

.tool-mode {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: var(--space-2xs);
}

.tool-sep {
  flex: none;
  width: 1px;
  margin: 2px var(--space-sm);
  background: var(--border);
}

/* 左パネルの幅に合わせて伸縮する */
.tool-mode .btn {
  flex: 1;
  min-width: 0;
  padding-inline: 0;
}

</style>
