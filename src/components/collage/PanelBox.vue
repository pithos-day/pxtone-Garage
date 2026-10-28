// サイドバーに埋め込むパネル (タイトル + 閉じる + ボディ)
<script setup lang="ts">
import { X } from "@lucide/vue";
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
      <button class="panelbox-close" :title="t('common.close')" @click="emit('close')"><X :size="16" /></button>
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
  padding: 4px 7px;
  background: var(--background);
  border-bottom: 1px solid var(--border);
  font-size: var(--text-sm);
  color: var(--foreground);
  user-select: none;
  flex: none;
}

.panelbox-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  padding: 0 4px;
}

.panelbox-close:hover {
  color: var(--destructive);
}

.panelbox-body {
  padding: 7px;
  font-size: var(--text-md);
  overflow-y: auto;
  min-height: 0;
}
</style>
