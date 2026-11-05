// スタンドアロン版のウィンドウ操作ボタン (標準のタイトルバーの代わり)。ブラウザでは表示しない
<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { Copy, Minus, RotateCw, Square, X } from "@lucide/vue";
import { requestWindowClose, requestWindowReload } from "../../state/window-unload";
import { t } from "../../i18n";

const controls = window.windowControls;
const maximized = ref(false);

if (controls) {
  void controls.isMaximized().then((value) => (maximized.value = value));
  onBeforeUnmount(controls.onMaximizedChange((value) => (maximized.value = value)));
  onBeforeUnmount(controls.onCloseRequest(() => requestWindowClose(controls)));
}
</script>

<template>
  <!-- フォーカスを奪うと Space (再生) などのキー操作がボタンを押してしまうので mousedown を止める -->
  <div v-if="controls" class="window-controls" @mousedown.prevent>
    <button type="button" class="window-btn" :title="t('window.reload')" :aria-label="t('window.reload')" @click="requestWindowReload(controls)">
      <RotateCw :size="16" />
    </button>
    <button type="button" class="window-btn" :title="t('window.minimize')" :aria-label="t('window.minimize')" @click="controls.minimize()">
      <Minus :size="16" />
    </button>
    <button
      type="button"
      class="window-btn"
      :title="t(maximized ? 'window.restore' : 'window.maximize')"
      :aria-label="t(maximized ? 'window.restore' : 'window.maximize')"
      @click="controls.toggleMaximize()"
    >
      <component :is="maximized ? Copy : Square" :size="16" />
    </button>
    <button type="button" class="window-btn window-close" :title="t('common.close')" :aria-label="t('common.close')" @click="controls.close()">
      <X :size="16" />
    </button>
  </div>
</template>

<style scoped>
.window-controls {
  display: flex;
  flex: none;
  -webkit-app-region: no-drag;
}

.window-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}

.window-btn:hover {
  background: var(--card);
  color: var(--card-foreground);
}

.window-close:hover {
  background: var(--destructive);
  color: #fff;
}
</style>
