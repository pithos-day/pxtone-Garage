// メニュー項目1行。サブメニューを持つ項目は内部で再帰的に描画する。
// クリック時は選択された項目を "select" で親へ渡す。
// ショートカットを持つ項目 (item.command) は右寄せでキーを併記する
<script setup lang="ts">
import { Check, ChevronRight } from "@lucide/vue";
import type { MenuItem } from "../../lib/menuItems";
import { formatShortcut } from "../../state/keybindings";

defineProps<{ item: MenuItem; subOpen: boolean }>();
const emit = defineEmits<{
  (e: "select", item: MenuItem): void;
  (e: "hover"): void;
}>();
</script>

<template>
  <div v-if="item.sep" class="menu-sep" />
  <div v-else-if="item.slider" class="menu-slider" @click.stop>
    <input
      type="range"
      :min="item.slider.min"
      :max="item.slider.max"
      :step="item.slider.step ?? 1"
      :value="item.slider.value"
      @input="item.slider.onInput(Number(($event.target as HTMLInputElement).value))"
    />
    <span class="menu-slider-value">
      {{ item.slider.format ? item.slider.format(item.slider.value) : item.slider.value }}
    </span>
  </div>
  <div
    v-else
    class="menu-item"
    :class="{ disabled: item.disabled, 'has-sub': item.sub }"
    @click="emit('select', item)"
    @mouseenter="emit('hover')"
  >
    <span class="menu-check">
      <Check v-if="item.checked" :size="14" />
      <component v-else-if="item.icon" :is="item.icon" :size="16" />
    </span>
    <span class="menu-text">{{ item.label }}</span>
    <span v-if="item.command" class="menu-key">{{ formatShortcut(item.command) }}</span>
    <span v-if="item.sub" class="menu-arrow"><ChevronRight :size="14" /></span>
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
  /* メニューバー (ドロップダウン含む) は UI 拡大の対象外 (従来の見た目を維持) */
  font-size: 14px;
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
  font-size: 11px;
  flex: none;
}

.menu-text {
  flex: 1;
}

/* ショートカット表示 (右寄せ・控えめな色) */
.menu-key {
  flex: none;
  margin-left: 16px;
  opacity: 0.6;
  font-size: 11px;
}

.menu-arrow {
  font-size: 11px;
}

.menu-sep {
  height: 1px;
  margin: 3px 6px;
  background: var(--border);
}

/* ズームの微調整スライダー。項目クリックでメニューを閉じないよう独立した行にする */
.menu-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
}

.menu-slider input {
  width: 132px;
  accent-color: var(--primary);
}

.menu-slider-value {
  min-width: 38px;
  text-align: right;
  color: var(--muted-foreground);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
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
