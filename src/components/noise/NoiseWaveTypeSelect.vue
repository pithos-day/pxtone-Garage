<script setup lang="ts">
// Noise の波形タイプ選択。ネイティブ <select> の option には画像を置けないため、
// ボタン + ポップアップのリストボックスにし、各項目の右側へ本家 img_patt.bmp 由来の
// 64x24 波形見本を文字と同じ色 (currentColor) で表示する。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronDown } from "@lucide/vue";
import { WaveType } from "pxtone-ts";
import { NOISE_WAVE_TYPES } from "../../lib/noise";
import { noiseWaveSamplePath } from "../../lib/noise-wave-samples";

const props = defineProps<{ modelValue: WaveType }>();
const emit = defineEmits<{ (e: "update:modelValue", v: WaveType): void }>();

const open = ref(false);
const active = ref<WaveType>(props.modelValue);
const triggerRef = ref<HTMLButtonElement | null>(null);
const popupRef = ref<HTMLDivElement | null>(null);
// 配置が決まるまで非表示にする (画面外で一瞬描画されるのを防ぐ)
const positioned = ref(false);
const popupStyle = ref<Record<string, string>>({});

// 波形見本の path は静的なので、開閉のたびに引き直さないよう先に組んでおく
const options = computed(() =>
  NOISE_WAVE_TYPES.map((w) => ({ ...w, sample: noiseWaveSamplePath(w.value) })),
);
const current = computed(
  () => options.value.find((w) => w.value === props.modelValue) ?? options.value[0]!,
);

const POPUP_WIDTH = 196;
const POPUP_MAX_HEIGHT = 480;

function close(): void {
  open.value = false;
  positioned.value = false;
}

function placePopup(): void {
  const b = triggerRef.value?.getBoundingClientRect();
  const p = popupRef.value;
  if (!b || !p) return;
  const width = Math.max(POPUP_WIDTH, b.width);
  const height = p.offsetHeight;
  const left = Math.max(2, Math.min(b.left, window.innerWidth - width - 2));
  // 下に収まらなければ上へ開く (画面端で切れないようにクランプ)
  const top =
    window.innerHeight - b.bottom >= height + 4
      ? b.bottom + 2
      : Math.max(2, b.top - height - 2);
  popupStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${Math.min(POPUP_MAX_HEIGHT, window.innerHeight - 4)}px`,
  };
  positioned.value = true;
}

async function openPopup(): Promise<void> {
  if (open.value) return;
  const b = triggerRef.value?.getBoundingClientRect();
  if (!b) return;
  active.value = props.modelValue;
  open.value = true;
  // 高さを測って上下どちらに開くか決める
  popupStyle.value = {
    left: `${b.left}px`,
    top: `${b.bottom + 2}px`,
    width: `${Math.max(POPUP_WIDTH, b.width)}px`,
    maxHeight: `${Math.min(POPUP_MAX_HEIGHT, window.innerHeight - 4)}px`,
  };
  await nextTick();
  placePopup();
}

function choose(type: WaveType): void {
  emit("update:modelValue", type);
  active.value = type;
  close();
  triggerRef.value?.focus();
}

function moveActive(delta: number): void {
  const i = NOISE_WAVE_TYPES.findIndex((w) => w.value === active.value);
  const n = NOISE_WAVE_TYPES.length;
  active.value = NOISE_WAVE_TYPES[(i + delta + n) % n]!.value;
}

function onTriggerKeydown(e: KeyboardEvent): void {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) {
      void openPopup();
      return;
    }
    moveActive(e.key === "ArrowDown" ? 1 : -1);
  } else if (e.key === "Home" || e.key === "End") {
    if (!open.value) return;
    e.preventDefault();
    const last = NOISE_WAVE_TYPES.length - 1;
    active.value = NOISE_WAVE_TYPES[e.key === "Home" ? 0 : last]!.value;
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (open.value) choose(active.value);
    else void openPopup();
  } else if (e.key === "Tab") {
    close();
  }
}

function onDocPointerDown(e: PointerEvent): void {
  if (!open.value) return;
  const t = e.target as Node | null;
  if (t && (triggerRef.value?.contains(t) || popupRef.value?.contains(t))) return;
  close();
}

function onDocKeydown(e: KeyboardEvent): void {
  if (!open.value || e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  close();
  triggerRef.value?.focus();
}

function onWindowChange(): void {
  if (open.value) close();
}

function onWindowScroll(e: Event): void {
  if (!open.value) return;
  // ポップアップ自身のスクロールでは閉じない
  const t = e.target as Node | null;
  if (t && popupRef.value?.contains(t)) return;
  close();
}

onMounted(() => {
  window.addEventListener("pointerdown", onDocPointerDown, true);
  window.addEventListener("keydown", onDocKeydown, true);
  window.addEventListener("scroll", onWindowScroll, true);
  window.addEventListener("resize", onWindowChange);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onDocPointerDown, true);
  window.removeEventListener("keydown", onDocKeydown, true);
  window.removeEventListener("scroll", onWindowScroll, true);
  window.removeEventListener("resize", onWindowChange);
});

// 外から値が変わったら、閉じているときのハイライトも追従させる
watch(
  () => props.modelValue,
  (v) => {
    if (!open.value) active.value = v;
  },
);
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="nwts-trigger"
    aria-haspopup="listbox"
    :aria-expanded="open"
    @click="open ? close() : openPopup()"
    @keydown="onTriggerKeydown"
  >
    <span class="nwts-trigger-label">{{ current.label }}</span>
    <ChevronDown :size="12" class="nwts-chevron" />
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      ref="popupRef"
      class="popup nwts-popup"
      :style="{ ...popupStyle, visibility: positioned ? 'visible' : 'hidden' }"
      role="listbox"
      @mousedown.prevent
    >
      <button
        v-for="item in options"
        :key="item.value"
        type="button"
        class="nwts-option"
        :class="{ 'is-active': item.value === active, 'is-selected': item.value === modelValue }"
        role="option"
        :aria-selected="item.value === modelValue"
        tabindex="-1"
        @pointermove="active = item.value"
        @click="choose(item.value)"
      >
        <span class="nwts-option-label">{{ item.label }}</span>
        <svg
          v-if="item.sample"
          class="nwts-sample"
          viewBox="0 0 64 24"
          width="64"
          height="24"
          aria-hidden="true"
        >
          <path :d="item.sample" fill="currentColor" shape-rendering="crispEdges" />
        </svg>
        <span v-else class="nwts-sample nwts-sample-none" aria-hidden="true" />
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.nwts-trigger {
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  padding: 0 2px;
  border: 1px solid var(--border);
  background: var(--secondary);
  color: var(--secondary-foreground);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}

.nwts-trigger:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.nwts-trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nwts-chevron {
  flex: none;
  opacity: 0.7;
}

.nwts-popup {
  position: fixed;
  z-index: 150;
  overflow-y: auto;
  background: var(--popover);
  color: var(--popover-foreground);
  padding: 2px 0;
  user-select: none;
}

.nwts-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 1px 8px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: var(--text-sm);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.nwts-option.is-active {
  background: var(--primary);
  color: var(--primary-foreground);
}

.nwts-option.is-selected .nwts-option-label {
  font-weight: bold;
}

.nwts-option-label {
  flex: 1;
  min-width: 0;
}

.nwts-sample {
  flex: none;
  display: block;
  width: 64px;
  height: 24px;
}

.nwts-sample-none {
  visibility: hidden;
}
</style>
