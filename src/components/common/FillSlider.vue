<script setup lang="ts">
// 塗り表示付きのレンジスライダー。center を指定すると中央基準 (パンなど) で塗る。
// 値の更新は v-model、contextmenu などのイベントは input へそのまま渡す。
import { computed } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{ modelValue: number; min: number; max: number; center?: number; disabled?: boolean }>(),
  { center: undefined, disabled: false },
);
const emit = defineEmits<{ (e: "update:modelValue", v: number): void }>();

function pct(v: number): number {
  const range = props.max - props.min;
  if (range <= 0) return 0;
  return (Math.max(props.min, Math.min(props.max, v)) - props.min) / range * 100;
}

const fillStyle = computed(() => {
  const base = pct(props.center ?? props.min);
  const cur = pct(props.modelValue);
  return { left: `${Math.min(base, cur)}%`, width: `${Math.abs(cur - base)}%` };
});
</script>

<template>
  <span class="fill-slider" :class="{ off: disabled }">
    <span class="fill-slider-track" />
    <span class="fill-slider-fill" :style="fillStyle" />
    <input
      v-bind="$attrs"
      type="range"
      step="1"
      :min="min"
      :max="max"
      :value="modelValue"
      :disabled="disabled"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
  </span>
</template>

<style scoped>
.fill-slider {
  position: relative;
  display: block;
  /* 横並びでは余白を埋め、縦並びでは 18px の高さを保つ */
  flex: 1 1 auto;
  min-width: 0;
  height: 18px;
}

.fill-slider-track,
.fill-slider-fill {
  position: absolute;
  top: 7px;
  height: 4px;
  border-radius: 2px;
}

.fill-slider-track {
  left: 0;
  right: 0;
  background: var(--control-track);
}

.fill-slider-fill {
  background: var(--control-fill);
}

.fill-slider.off {
  opacity: 0.4;
}

.fill-slider input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
}

.fill-slider input:disabled {
  cursor: default;
}

.fill-slider input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--foreground);
  border: 2px solid var(--muted);
}

.fill-slider input::-moz-range-thumb {
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--foreground);
  border: 2px solid var(--muted);
}

.fill-slider input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
  border-radius: 2px;
}
</style>
