// ボリュームモード切替パネル (縦に8モード)
<script setup lang="ts">
import { X } from "@lucide/vue";
import { doc } from "../../state/project";
import { t } from "../../i18n";

defineProps<{ modes: string[] }>();
</script>

<template>
  <div class="volpanel">
    <button
      v-for="(m, i) in modes"
      :key="m"
      class="btn btn-sm vol-mode mode"
      :class="{ on: doc.volumeMode === i }"
      :title="m"
      @click="doc.volumeMode = i"
    >
      {{ m }}
    </button>
    <button class="btn btn-sm vol-close" :title="t('common.close')" @click="doc.volumeVisible = false"><X :size="12" /></button>
  </div>
</template>

<style scoped>
.volpanel {
  width: var(--name-w);
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end; /* モードボタンを右揃え (右端 = VolumeField の左端 = NAME_W) */
  gap: var(--space-2xs);
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
