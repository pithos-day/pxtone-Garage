<script setup lang="ts">
// キー設定の 1 つの割り当て。クリックで入力待ちへ、× で削除する
import { X } from "@lucide/vue";
import { bindingLabel, bindingParts, type KeyBinding } from "../../lib/shortcuts";
import { t } from "../../i18n";

defineProps<{ binding: KeyBinding; actionLabel: string }>();
const emit = defineEmits<{ (e: "edit"): void; (e: "remove"): void }>();
</script>

<template>
  <div class="keys-chip">
    <button type="button" class="keys-chip-keys" :aria-label="`${actionLabel}: ${bindingLabel(binding)}`" @click="emit('edit')">
      <kbd v-for="part in bindingParts(binding)" :key="part">{{ part }}</kbd>
    </button>
    <button type="button" class="keys-chip-remove" :title="t('keys.remove')" :aria-label="t('keys.remove')" @click="emit('remove')">
      <X :size="12" />
    </button>
  </div>
</template>

<style scoped>
.keys-chip {
  display: flex;
  align-items: center;
  border-radius: calc(var(--radius) - 2px);
}

.keys-chip:hover,
.keys-chip:focus-within {
  background: var(--control-surface);
}

.keys-chip-keys {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: 1px 2px;
  border: none;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}

.keys-chip-keys:hover kbd {
  color: var(--primary-foreground);
  background: var(--primary);
}

.keys-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  /* レイアウトを動かさないよう場所は確保したまま隠す */
  opacity: 0;
}

.keys-chip:hover .keys-chip-remove,
.keys-chip-remove:focus-visible {
  opacity: 1;
}

.keys-chip-remove:hover {
  color: var(--destructive);
}

/* タッチ操作では hover できないので削除ボタンは常に出す */
@media (max-width: 640px) {
  .keys-chip-remove {
    opacity: 1;
  }
}

@media (hover: none) {
  .keys-chip-remove {
    opacity: 1;
  }
}
</style>
