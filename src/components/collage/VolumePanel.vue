// ボリュームモード切替パネル (2 列に 8 モード)
<script setup lang="ts">
import { doc } from "../../state/project";

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
  </div>
</template>

<style scoped>
.volpanel {
  width: var(--name-w);
  flex: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-content: start;
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
</style>
