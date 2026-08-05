<script setup lang="ts">
defineProps<{
  dirty: boolean;
  title: string;
}>();

const model = defineModel<"collage" | "voice" | "noise">({ required: true });

const tabs = [
  { id: "collage", label: "コラージュ", sub: "DAW" },
  { id: "voice", label: "ボイス", sub: "PTV音源エディタ" },
  { id: "noise", label: "ノイズ", sub: "PTNノイズエディタ" },
] as const;
</script>

<template>
  <nav class="tabbar">
    <button
      v-for="t in tabs"
      :key="t.id"
      class="tab"
      :class="{ active: model === t.id }"
      @click="model = t.id"
    >
      {{ t.label }}
      <small>{{ t.sub }}</small>
    </button>
    <span class="tabbar-spacer" />
    <span class="tabbar-brand">pxtone-garage</span>
  </nav>
</template>
