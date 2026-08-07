// サイドバーに埋め込むパネル (タイトル + 閉じる + ボディ)
<script setup lang="ts">
defineProps<{
  title: string;
}>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <section class="panelbox">
    <header class="panelbox-head">
      <span>{{ title }}</span>
      <button class="panelbox-close" title="閉じる" @click="emit('close')">✕</button>
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
  background: var(--card);
  border: 1px solid var(--border-strong);
}

.panelbox-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  background: var(--secondary);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--foreground);
  user-select: none;
  flex: none;
}

.panelbox-close {
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
}

.panelbox-close:hover {
  color: var(--danger-text);
}

.panelbox-body {
  padding: 6px;
  font-size: 12px;
  overflow-y: auto;
  min-height: 0;
}
</style>
