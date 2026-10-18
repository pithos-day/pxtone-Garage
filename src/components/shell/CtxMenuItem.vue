// コンテキストメニュー (.ctxmenu) の 1 項目。
// アイコン列 + ラベル、danger / disabled の見た目を共通化する
<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  icon: Component;
  disabled?: boolean;
  danger?: boolean;
}>();

const emit = defineEmits<{ (e: "click"): void }>();
</script>

<template>
  <button :class="{ danger }" :disabled="disabled" @click="emit('click')">
    <span class="menu-icon"><component :is="icon" :size="14" /></span>
    <slot />
  </button>
</template>
