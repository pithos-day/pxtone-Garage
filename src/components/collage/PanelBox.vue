// サイドバーに埋め込むパネル (タイトル + 閉じる + ボディ)
<script setup lang="ts">
import { t } from "../../i18n";

defineProps<{
  title: string;
}>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <section class="panelbox">
    <header class="panelbox-head">
      <span>{{ title }}</span>
      <button class="panelbox-close" :title="t('common.close')" @click="emit('close')">✕</button>
    </header>
    <div class="panelbox-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panelbox {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--background);
  border: 1px solid var(--border);
}

.panelbox-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  background: var(--background);
  border-bottom: 1px solid var(--border);
  font-size: var(--text-sm);
  color: var(--foreground);
  user-select: none;
  flex: none;
}

.panelbox-close {
  border: none;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  font-size: var(--text-md);
  padding: 0 4px;
}

.panelbox-close:hover {
  color: var(--destructive);
}

.panelbox-body {
  padding: 6px;
  font-size: var(--text-md);
  overflow-y: auto;
  min-height: 0;
}
</style>
