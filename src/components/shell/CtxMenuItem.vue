// コンテキストメニュー (.ctxmenu) の 1 項目。
// アイコン列 + ラベル、danger / disabled の見た目を共通化する。
// ショートカットを持つ項目 (command) は右寄せでキーを併記する
<script setup lang="ts">
import type { Component } from "vue";
import type { ShortcutCommand } from "../../lib/shortcuts";
import { formatShortcut } from "../../state/keybindings";

defineProps<{
  icon: Component;
  disabled?: boolean;
  danger?: boolean;
  command?: ShortcutCommand;
}>();

const emit = defineEmits<{ (e: "click"): void }>();
</script>

<template>
  <button :class="{ danger }" :disabled="disabled" @click="emit('click')">
    <span class="menu-icon"><component :is="icon" :size="16" /></span>
    <span class="menu-text"><slot /></span>
    <span v-if="command" class="menu-key">{{ formatShortcut(command) }}</span>
  </button>
</template>
