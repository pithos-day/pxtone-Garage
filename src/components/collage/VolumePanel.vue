// ボリュームモード切替パネル (縦に8モード)
<script setup lang="ts">
import { doc } from "../../state/project";
import { t } from "../../i18n";

defineProps<{ modes: string[] }>();
</script>

<template>
  <div class="volpanel">
    <button
      v-for="(m, i) in modes"
      :key="m"
      class="btn btn-sm vol-mode"
      :class="{ on: doc.volumeMode === i }"
      :title="m"
      @click="doc.volumeMode = i"
    >
      {{ m }}
    </button>
    <button class="btn btn-sm vol-close" :title="t('common.close')" @click="doc.volumeVisible = false">✕</button>
  </div>
</template>

<style scoped>
.volpanel {
  width: 144px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-right: 1px solid var(--border);
  background: var(--background);
  user-select: none;
}

.vol-mode {
  text-align: left;
  font-size: var(--text-xs);
  padding: 2px 6px;
}

.vol-close {
  margin-top: auto;
}
</style>
