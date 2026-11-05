// 指でしか操作できない端末が縦向きのとき、横向きへの変更を案内する。
// ブラウザのタブからは画面の向きを固定できないため、対応端末では全画面で固定する手段も出す
<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { canLockLandscape, isTouchOnlyDevice, lockLandscape } from "../../lib/mobile";
import { t } from "../../i18n";

const touchOnly = isTouchOnlyDevice();
const portrait = ref(false);
const lockable = touchOnly && canLockLandscape();

if (touchOnly) {
  const query = matchMedia("(orientation: portrait)");
  const update = (): void => {
    portrait.value = query.matches;
  };
  update();
  query.addEventListener("change", update);
  onBeforeUnmount(() => query.removeEventListener("change", update));
}
</script>

<template>
  <div v-if="portrait" class="landscape-guard">
    <p>{{ t("mobile.rotate") }}</p>
    <button v-if="lockable" class="btn btn-accent" @click="lockLandscape">{{ t("mobile.lockLandscape") }}</button>
  </div>
</template>

<style scoped>
/* 縦向きでも PC と同じ幅でレイアウトするため、文字は画面幅を基準にする */
.landscape-guard {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4vw;
  padding: 8vw;
  background: var(--background);
  color: var(--foreground);
  font-size: 5vw;
  text-align: center;
}

.landscape-guard p {
  margin: 0;
}

.landscape-guard .btn {
  padding: 2vw 4vw;
  font-size: 4.5vw;
}
</style>
