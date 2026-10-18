// IO 中の進捗ダイアログ。
// パーセントの数字 + プログレスバー + バーの下のキャンセルボタン (ESC も同じ)。
// 状態は state/progress.ts が持ち、ここは表示と ESC の受け取りだけを行う。
// 進捗が測れない段階 (解析中など) は数字を据え置きでバーを不定表示にする
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { cancelProgress, progress } from "../../state/progress";
import { t } from "../../i18n";

const percent = computed(() => Math.round(progress.value * 100));
const label = computed(() => (progress.cancelling ? t("progress.cancelling") : progress.label));

// ESC はキャンセルボタンと同じ。capture で他のキー処理より先に受ける
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== "Escape" || !progress.open) return;
  e.preventDefault();
  e.stopPropagation();
  cancelProgress();
}
onMounted(() => window.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));

// 表示時にキャンセルボタンへフォーカスする (キーボードだけで中断できるように)
const cancelBtn = ref<HTMLButtonElement | null>(null);
watch(
  () => progress.open,
  (open) => {
    if (open) void nextTick(() => cancelBtn.value?.focus());
  },
);
</script>

<template>
  <!-- オーバーレイは処理開始直後から出す (入力を止める)。暗転はダイアログ表示後 -->
  <div v-if="progress.active" class="progress-overlay" :class="{ visible: progress.open }">
    <div v-if="progress.open" class="progress-dlg" role="dialog" :aria-label="progress.title">
      <div class="progress-title">{{ progress.title }}</div>
      <div class="progress-body">
        <div class="progress-label">{{ label }}</div>
        <div class="progress-percent">{{ percent }}%</div>
        <div
          class="progress-bar"
          :class="{ indeterminate: progress.indeterminate }"
          role="progressbar"
          :aria-valuenow="percent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-fill" :style="{ width: `${percent}%` }" />
          <div v-if="progress.indeterminate" class="progress-stripe" />
        </div>
        <div class="progress-buttons">
          <button v-if="progress.cancellable" ref="cancelBtn" class="btn" :disabled="progress.cancelling" @click="cancelProgress">
            {{ t("progress.cancel") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 他のダイアログ (200) より上に出す */
  z-index: 300;
}

/* ダイアログ表示後に暗転する (遅延中は見た目を変えないまま入力を止める) */
.progress-overlay.visible {
  background: rgb(0 0 0 / 55%);
}

.progress-dlg {
  width: 360px;
  background: var(--background);
  border: 1px solid var(--border);
  box-shadow: 4px 4px 16px rgb(0 0 0 / 0.35);
}

.progress-title {
  padding: 8px 12px;
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--foreground);
  border-bottom: 1px solid var(--border);
}

.progress-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.progress-label {
  font-size: var(--text-md);
  color: var(--muted-foreground);
  min-height: 1.4em;
}

.progress-percent {
  align-self: flex-end;
  font-size: var(--text-xl);
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  line-height: 1;
}

.progress-bar {
  position: relative;
  height: 14px;
  border: 1px solid var(--border);
  background: var(--card);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 80ms linear;
}

/* 進捗が測れない段階のストライプ (transform のみなので合成側で動く) */
.progress-stripe {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40%;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary-foreground) 45%, transparent), transparent);
  animation: progress-stripe 1.1s linear infinite;
}

@keyframes progress-stripe {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

.progress-buttons {
  display: flex;
  justify-content: flex-end;
}
</style>
