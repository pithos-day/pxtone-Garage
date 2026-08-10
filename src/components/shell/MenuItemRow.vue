// メニュー項目1行。サブメニューを持つ項目は内部で再帰的に描画する。
// クリック時は選択された項目を "select" で親へ渡す
<script setup lang="ts">
export interface MenuItem {
  label?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  sep?: boolean;
  sub?: MenuItem[];
}

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
    <span class="menu-check">{{ item.checked ? "✓" : "" }}</span>
    <span class="menu-text">{{ item.label }}</span>
    <span v-if="item.sub" class="menu-arrow">▸</span>
    <div v-if="item.sub && subOpen" class="menu-sub">
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
  padding: 5px 12px;
  font-size: 12px;
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
  width: 16px;
  color: var(--primary);
  font-size: 11px;
  flex: none;
}

.menu-text {
  flex: 1;
}

.menu-arrow {
  margin-left: 10px;
  color: var(--muted-foreground);
  font-size: 10px;
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
  border: 1px solid var(--border);
  box-shadow: 2px 2px 10px rgb(0 0 0 / 0.35);
  padding: 3px 0;
}
</style>
