// 再生中の出力レベルメーター (L/R) とクリップ表示。
// クリップ表示は音割れに気づけるよう保持し、クリックか次の再生開始で消す
<script setup lang="ts">
import { clearClip, outputLevel } from "../../state/player";
import { levelToPercent } from "../../lib/level";
import { t } from "../../i18n";
</script>

<template>
  <div class="level-meter" role="img" :aria-label="t('transport.level')" :title="t('transport.level')">
    <div class="level-bar"><div class="level-fill" :style="{ width: `${levelToPercent(outputLevel.left)}%` }" /></div>
    <div class="level-bar"><div class="level-fill" :style="{ width: `${levelToPercent(outputLevel.right)}%` }" /></div>
  </div>
  <button
    class="clip-lamp"
    :class="{ on: outputLevel.clipped }"
    :disabled="!outputLevel.clipped"
    :title="t('transport.clip')"
    @click="clearClip"
  >
    CLIP
  </button>
</template>

<style scoped>
.level-meter {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 72px;
}

.level-bar {
  height: 6px;
  background: var(--muted);
  border: 1px solid var(--border);
}

.level-fill {
  height: 100%;
  background: var(--control-fill);
}

.clip-lamp {
  padding: 1px 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--text-2xs);
}

.clip-lamp.on {
  border-color: var(--destructive);
  background: var(--destructive);
  color: var(--destructive-foreground);
  cursor: pointer;
}
</style>
