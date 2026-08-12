// 上部のモードタブ (Collage / Voice / Noise)
<script setup lang="ts">
import type { AppMode } from "../../lib/modes";

defineProps<{ mode: AppMode }>();
const emit = defineEmits<{ (e: "change", mode: AppMode): void }>();

const tabs = [
  { id: "collage", label: "Collage" },
  { id: "voice", label: "Voice" },
  { id: "noise", label: "Noise" },
] as const;
</script>

<template>
  <div class="mode-tabs">
    <button v-for="tab in tabs" :key="tab.id" class="mode-tab" :class="{ active: mode === tab.id }" @click="emit('change', tab.id)">
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
/* モードタブ (Collage / Voice / Noise) */
.mode-tabs {
  display: flex;
}

.mode-tab {
  padding: 0 18px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--text-xl);
  font-weight: bold;
  cursor: pointer;
}

.mode-tab:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.mode-tab.active {
  background: var(--background);
  color: var(--foreground);
  box-shadow: inset 0 3px 0 var(--primary);
}
</style>
