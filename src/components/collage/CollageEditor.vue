// コラージュ (ptCollage 相当) の全体レイアウト。
// 画面中央は常にピアノロール、左パネルは W/U タブで切り替え。
// ピン留めユニットのレーンは上部に固定表示される。
<script setup lang="ts">
import { computed } from "vue";
import { ChevronDown, ChevronRight } from "@lucide/vue";
import { doc, units, ensureInit, pinnedUnits, VOLUME_MODES } from "../../state/project";
import { KEY_HEIGHT, KEYNUM } from "../../lib/clock";
import { RULER_H, STRIP_W, LEFT_W, NAME_W } from "../../lib/layout";
import { useGlobalKeys } from "../../composables/useGlobalKeys";
import { panels } from "../../state/panels";
import { togglePlay, seekToClock } from "../../state/player";
import { undo, redo } from "../../state/undo";
import ToolPanel from "./ToolPanel.vue";
import UnitTray from "./UnitTray.vue";
import WoiceTray from "./WoiceTray.vue";
import PinnedLanes from "./PinnedLanes.vue";
import KeyField from "./KeyField.vue";
import PlayField from "./PlayField.vue";
import ScopeField from "./ScopeField.vue";
import VolumePanel from "./VolumePanel.vue";
import VolumeField from "./VolumeField.vue";
import EffectorPanel from "./EffectorPanel.vue";
import CopierPanel from "./CopierPanel.vue";
import ScrollBar from "./ScrollBar.vue";
import MeasNoField from "./MeasNoField.vue";
import { t } from "../../i18n";

// v-show で常時マウントされるため、キーハンドラは collage モードのときだけ有効にする
// (Voice/Noise モードでは各エディタが Space をプレビュー再生に使う)
const props = defineProps<{ active: boolean }>();

ensureInit();

const pinned = computed(() => pinnedUnits());

function onKeydown(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case "z":
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      case "y":
        e.preventDefault();
        redo();
        return;
      case "a":
        e.preventDefault();
        doc.selectedUnits = units.value.map((u) => u.index);
        return;
    }
    return;
  }
  switch (e.key) {
    case "F1":
      e.preventDefault();
      doc.mode = "W";
      break;
    case "F2":
      e.preventDefault();
      doc.mode = "U";
      break;
    case " ":
      e.preventDefault();
      togglePlay();
      break;
    case "Home":
      e.preventDefault();
      seekToClock(0);
      break;
  }
}

useGlobalKeys(() => props.active, { keydown: onKeydown });

// ボリュームモードボタンの表示名 (VOLUME_MODES と index 対応)
const volumeModeLabels = VOLUME_MODES.map((m) => m.label);
</script>

<template>
  <!-- レイアウト幅は lib/layout から CSS 変数として注入 (px の手動同期を排除) -->
  <div class="collage" :style="{ '--left-w': LEFT_W + 'px', '--strip-w': STRIP_W + 'px', '--name-w': NAME_W + 'px' }">
    <div class="collage-body">
      <!-- ピン留めユニットのレーン (上部固定) -->
      <div v-if="pinned.length > 0" class="collage-pinned" :style="{ height: (RULER_H + pinned.length * KEY_HEIGHT) + 'px' }">
        <PinnedLanes />
      </div>
      <div class="collage-main">
        <!-- 左パネル (ツール + W/U リスト + Volume トグル) -->
        <div class="collage-tray">
          <ToolPanel />
          <UnitTray v-if="doc.mode === 'U'" />
          <WoiceTray v-if="doc.mode === 'W'" />
          <button class="volume-toggle bar-header" :class="{ on: doc.volumeVisible }" :title="t('common.volumeToggle')" @click="doc.volumeVisible = !doc.volumeVisible">
            <span class="vt-label">Volume</span>
            <span class="vt-arrow"><ChevronDown v-if="doc.volumeVisible" :size="12" /><ChevronRight v-else :size="12" /></span>
          </button>
        </div>
        <!-- フィールド列: ルーラー (トラック直上) + トラック -->
        <div class="collage-field-col">
          <div class="collage-ruler-row">
            <div class="collage-ruler-spacer" />
            <div class="collage-ruler-col">
              <MeasNoField />
              <PlayField />
              <ScopeField />
            </div>
            <div class="collage-ruler-vspacer" />
          </div>
          <div class="collage-field-wrap">
            <KeyField />
            <ScrollBar class="vscroll" :vertical="true" :length="KEYNUM" vertical-kind="key" />
          </div>
        </div>
        <!-- フローティングパネル (Effector / Copier を編集画面上にポップアップ表示) -->
        <div class="panel-popups">
          <EffectorPanel v-if="panels.effector.open" class="panel-popup" @close="panels.effector.open = false" />
          <CopierPanel v-if="panels.copier.open" class="panel-popup" @close="panels.copier.open = false" />
        </div>
      </div>
    </div>
    <div v-if="doc.volumeVisible" class="collage-vol">
      <VolumePanel :modes="volumeModeLabels" />
      <VolumeField />
    </div>
    <div class="collage-hscroll">
      <div class="collage-hscroll-spacer" />
      <ScrollBar class="hscroll" :vertical="false" />
    </div>
  </div>
</template>

<style scoped>
.collage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--background);
}

.collage-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border);
}

/* ピン留めユニットのレーン (上部固定) */
.collage-pinned {
  flex: none;
  border-bottom: 1px solid var(--border);
  background: var(--background);
}

.collage-pinned > :deep(.field-canvas) {
  width: 100%;
  height: 100%;
}

.collage-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.collage-vol {
  display: flex;
  background: var(--background);
}

.collage-tray {
  width: var(--left-w);
  flex: none;
  border-right: 1px solid var(--border);
  background: var(--background);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Volume トグル (左パネル最下部)。枠は上罫のみ (bar-header の下罫は border:none で打ち消す) */
.volume-toggle {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: none;
  border-top: 1px solid var(--border);
  font-size: var(--text-sm);
  padding: 6px 10px;
  cursor: pointer;
}

.volume-toggle:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.volume-toggle.on {
  color: var(--foreground);
}

.volume-toggle.on .vt-label {
  color: var(--primary);
}

.vt-label {
  font-size: var(--text-sm);
}

.vt-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* フィールド列 (ルーラー + トラック) */
.collage-field-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ルーラー行: 鍵盤ストリップ分のスペーサ + PlayField + ScopeField をトラック直上に */
.collage-ruler-row {
  flex: none;
  display: flex;
  background: var(--background);
}

.collage-ruler-spacer {
  width: var(--strip-w);
  flex: none;
}

.collage-ruler-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.collage-ruler-vspacer {
  width: 14px;
  flex: none;
  border-left: 1px solid var(--border);
}

.collage-field-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
}

/* canvas の min-width:auto (固有幅) が vscroll を押し出さないように */
.collage-field-wrap > :deep(.field-canvas) {
  flex: 1;
  min-width: 0;
}

/* フローティングパネル (Effector / Copier ポップアップ) */
.panel-popups {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  max-height: calc(100% - 16px);
  pointer-events: none;
}

.panel-popup {
  width: 260px;
  max-height: 70%;
  box-shadow: 2px 2px 10px rgb(0 0 0 / 0.35);
  pointer-events: auto;
}

.vscroll {
  width: 14px;
  flex: none;
  border-left: 1px solid var(--border);
}

.collage-hscroll {
  display: flex;
  background: var(--background);
}

.collage-hscroll-spacer {
  width: var(--name-w);
  flex: none;
}

.hscroll {
  flex: 1;
  height: 14px;
}
</style>
