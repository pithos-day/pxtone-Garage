<script setup lang="ts">
import { applyUpdate, dismissUpdate, updateReady } from "../../state/pwa";
import { t } from "../../i18n";
</script>

<template>
  <div v-if="updateReady" class="update-toast" role="status">
    <span>{{ t("update.available") }}</span>
    <button type="button" class="btn" @click="applyUpdate">{{ t("update.reload") }}</button>
    <button type="button" class="btn" @click="dismissUpdate">{{ t("update.later") }}</button>
  </div>
</template>

<style scoped>
.update-toast {
  position: fixed;
  right: var(--space-xl);
  bottom: var(--space-xl);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-lg) var(--space-xl);
  font-size: var(--text-sm);
  color: var(--foreground);
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius, 4px);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.35);
}
</style>
