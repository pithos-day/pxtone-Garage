// メニュー項目1行。サブメニューを持つ項目は内部で再帰的に描画する。
// クリック時は選択された項目を "select" で親へ渡す
<script setup lang="ts">
import type { MenuItem } from "../../lib/menuItems";

defineProps<{ item: MenuItem; subOpen: boolean }>();
const emit = defineEmits<{
  (e: "select", item: MenuItem): void;
  (e: "hover"): void;
}>();
</script>

<template>
  <div v-if="item.sep" class="menu-sep" />
  <div
    v-else
    class="menu-item"
    :class="{ disabled: item.disabled, 'has-sub': item.sub }"
    @click="emit('select', item)"
    @mouseenter="emit('hover')"
  >
    <span class="menu-check">
      <template v-if="item.checked">✓</template>
      <component v-else-if="item.icon" :is="item.icon" :size="16" />
    </span>
    <span class="menu-text">{{ item.label }}</span>
    <span v-if="item.sub" class="menu-arrow">▸</span>
    <div v-if="item.sub && subOpen" class="menu-sub popup">
      <MenuItemRow
        v-for="(sub, j) in item.sub"
        :key="j"
        :item="sub"
        :sub-open="false"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: var(--text-lg);
  color: var(--card-foreground);
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}

.menu-item:hover {
  background: var(--primary);
  color: var(--primary-foreground);
}

.menu-item.disabled {
  color: color-mix(in srgb, var(--card-foreground) 50%, transparent);
  cursor: default;
}

.menu-item.disabled:hover {
  background: transparent;
}

.menu-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  font-size: var(--text-sm);
  flex: none;
}

.menu-text {
  flex: 1;
}

.menu-arrow {
  font-size: var(--text-sm);
}

.menu-sep {
  height: 1px;
  margin: 3px 6px;
  background: var(--border);
}

.menu-sub {
  position: absolute;
  left: 100%;
  top: -4px;
  min-width: 150px;
  background: var(--card);
  padding: 3px 0;
}
</style>
