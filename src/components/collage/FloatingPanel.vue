// ドラッグ可能なフローティングパネル (本家のラック相当)
<script setup lang="ts">
import { ref } from "vue";
import { panels } from "../../state/panels";

const props = defineProps<{
  name: string;
  title: string;
  width?: number;
}>();
const emit = defineEmits<{ close: [] }>();

const headRef = ref<HTMLElement | null>(null);

function onHeadDown(e: PointerEvent): void {
  const head = headRef.value;
  if (!head) return;
  head.setPointerCapture(e.pointerId);
  const p = panels[props.name];
  const startX = e.clientX;
  const startY = e.clientY;
  const ox = p.x;
  const oy = p.y;
  const onMove = (ev: PointerEvent): void => {
    p.x = Math.max(0, ox + (ev.clientX - startX));
    p.y = Math.max(0, oy + (ev.clientY - startY));
  };
  const onUp = (): void => {
    head.removeEventListener("pointermove", onMove);
    head.removeEventListener("pointerup", onUp);
  };
  head.addEventListener("pointermove", onMove);
  head.addEventListener("pointerup", onUp);
}
</script>

<template>
  <div class="fpanel" :style="{ left: panels[name].x + 'px', top: panels[name].y + 'px', width: (width ?? 200) + 'px' }">
    <div ref="headRef" class="fpanel-head" @pointerdown="onHeadDown">
      <span>{{ title }}</span>
      <button class="fpanel-close" @click="emit('close')">✕</button>
    </div>
    <div class="fpanel-body">
      <slot />
    </div>
  </div>
</template>
