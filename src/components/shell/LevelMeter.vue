// 再生中の出力レベルメーター (L/R)。各チャンネルの右端の延長線上に音割れのランプを置く。
// ランプは音割れに気づけるよう保持し、メーターのクリックか次の再生開始で消す
<script setup lang="ts">
import { computed } from "vue";
import { clearClip, outputLevel } from "../../state/player";
import { levelToPercent } from "../../lib/level";
import { t } from "../../i18n";

const channels = computed(() => [
  { width: levelToPercent(outputLevel.left), clipped: outputLevel.clipLeft },
  { width: levelToPercent(outputLevel.right), clipped: outputLevel.clipRight },
]);
const clipped = computed(() => outputLevel.clipLeft || outputLevel.clipRight);
const label = computed(() => t(clipped.value ? "transport.clip" : "transport.level"));
</script>

<template>
  <button class="level-meter" :class="{ clipped }" :disabled="!clipped" :title="label" :aria-label="label" @click="clearClip">
    <span v-for="(channel, i) in channels" :key="i" class="level-channel">
      <span class="level-bar"><span class="level-fill" :style="{ width: `${channel.width}%` }" /></span>
      <span class="level-clip" :class="{ on: channel.clipped }" />
    </span>
  </button>
</template>

<style scoped>
.level-meter {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: 80px;
  padding: 0;
  border: none;
  background: transparent;
}

.level-meter.clipped {
  cursor: pointer;
}

.level-channel {
  display: flex;
  gap: 1px;
  height: 6px;
}

.level-bar {
  flex: 1;
  background: var(--muted);
  border: 1px solid var(--border);
}

.level-fill {
  display: block;
  height: 100%;
  background: var(--control-fill);
}

.level-clip {
  flex: none;
  width: 8px;
  background: var(--muted);
  border: 1px solid var(--border);
}

.level-clip.on {
  background: var(--destructive);
  border-color: var(--destructive);
}
</style>
