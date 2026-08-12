// コピー種別フィルタ (9種) — フローティング
<script setup lang="ts">
import PanelBox from "./PanelBox.vue";
import { doc } from "../../state/project";
import { t } from "../../i18n";

import { COPIER_KINDS as KINDS } from "../../lib/eventKinds";

function toggle(i: number): void {
  doc.copier[i] = !doc.copier[i]!;
}
</script>

<template>
  <PanelBox :title="t('copier.title')">
    <div class="copier-body">
      <label v-for="k in KINDS" :key="k.index" class="copier-item">
        <input type="checkbox" :checked="doc.copier[k.index]" @change="toggle(k.index)" />
        {{ k.label }}
      </label>
    </div>
  </PanelBox>
</template>

<style scoped>
.copier-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.copier-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  cursor: pointer;
}

.copier-item input {
  accent-color: var(--primary);
}
</style>
