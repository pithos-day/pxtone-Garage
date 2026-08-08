// コピー種別フィルタ (9種) — フローティング
<script setup lang="ts">
import PanelBox from "./PanelBox.vue";
import { doc } from "../../state/project";
import { EventKind } from "pxtone-ts";
import { t } from "../../i18n";

const KINDS = [
  { i: 0, label: "ON", kind: EventKind.ON },
  { i: 1, label: "KEY", kind: EventKind.KEY },
  { i: 2, label: "PAN_VOLUME", kind: EventKind.PAN_VOLUME },
  { i: 3, label: "PAN_TIME", kind: EventKind.PAN_TIME },
  { i: 4, label: "VELOCITY", kind: EventKind.VELOCITY },
  { i: 5, label: "VOLUME", kind: EventKind.VOLUME },
  { i: 6, label: "PORTAMENT", kind: EventKind.PORTAMENT },
  { i: 7, label: "VOICENO", kind: EventKind.VOICENO },
  { i: 8, label: "GROUPNO", kind: EventKind.GROUPNO },
] as const;

function toggle(i: number): void {
  doc.copier[i] = !doc.copier[i]!;
}
</script>

<template>
  <PanelBox :title="t('copier.title')">
    <div class="copier-body">
      <label v-for="k in KINDS" :key="k.i" class="copier-item">
        <input type="checkbox" :checked="doc.copier[k.i]" @change="toggle(k.i)" />
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
  font-size: 11px;
  color: var(--muted-foreground);
  cursor: pointer;
}

.copier-item input {
  accent-color: var(--primary);
}
</style>
