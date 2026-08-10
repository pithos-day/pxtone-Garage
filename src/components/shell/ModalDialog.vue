// 汎用モーダルダイアログのシェル。オーバーレイクリックで "close" を emit する。
// タイトルは title スロット、本体はデフォルトスロット、ボタンは buttons スロット。
<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string; // aria-label
    width?: string; // ダイアログ幅 (CSS 値)
    bodyGap?: string; // 本体の縦間隔 (CSS 値)
  }>(),
  { width: "420px", bodyGap: "8px" },
);

const emit = defineEmits<{ (e: "close"): void }>();

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains("dlg-overlay")) emit("close");
}
</script>

<template>
  <div class="dlg-overlay" @click="onOverlayClick">
    <div class="dlg" role="dialog" :aria-label="label">
      <div class="dlg-title"><slot name="title" /></div>
      <div class="dlg-body"><slot /></div>
      <div class="dlg-buttons"><slot name="buttons" /></div>
    </div>
  </div>
</template>

<style scoped>
.dlg-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 55%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dlg {
  width: v-bind(width);
  background: var(--background);
  border: 1px solid var(--border);
  box-shadow: 4px 4px 16px rgb(0 0 0 / 0.35);
}

.dlg-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: bold;
  color: var(--foreground);
  background: var(--background);
  border-bottom: 1px solid var(--border);
}

.dlg-body {
  display: flex;
  flex-direction: column;
  gap: v-bind(bodyGap);
  padding: 12px;
}

.dlg-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 12px 12px;
}
</style>
