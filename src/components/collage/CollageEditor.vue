// コラージュ (ptCollage 相当) の全体レイアウト。
// 画面中央は常にピアノロール、左パネルは W/U タブで切り替え。
// ピン留めユニットのレーンは上部に固定表示される。
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { doc, units, ensureInit, pinnedUnits } from "../../state/project";
import { panels } from "../../state/panels";
import { togglePlay, seekToClock } from "../../state/player";
import { undo, redo } from "../../state/undo";
import { ZOOM_TABLE, DIVI_TABLE } from "../../lib/clock";
import ToolPanel from "./ToolPanel.vue";
import UnitTray from "./UnitTray.vue";
import WoiceTray from "./WoiceTray.vue";
import PinnedLanes from "./PinnedLanes.vue";
import KeyField from "./KeyField.vue";
import PlayField from "./PlayField.vue";
import ScopeField from "./ScopeField.vue";
import VolumePanel from "./VolumePanel.vue";
import VolumeField from "./VolumeField.vue";
import PlayerPanel from "./PlayerPanel.vue";
import ProjectorPanel from "./ProjectorPanel.vue";
import EffectorPanel from "./EffectorPanel.vue";
import CopierPanel from "./CopierPanel.vue";
import ScrollBar from "./ScrollBar.vue";

ensureInit();

const pinned = computed(() => pinnedUnits());

function onKeydown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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
        doc.operated = units.value.map((u) => u.index);
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

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

function setZoom(z: number): void {
  doc.zoom = z;
}

function setDivi(d: number): void {
  doc.divi = d;
}

const volumeModes = ["Velocity", "Pan_Volume", "Pan_Time", "Volume", "Portament", "VoiceNo", "GroupNo", "Tuning"];
</script>

<template>
  <div class="collage">
    <div class="collage-header">
      <ToolPanel />
      <div class="collage-ruler-col">
        <PlayField />
        <ScopeField />
      </div>
      <div class="collage-header-right">
        <span class="zoom-label">ズーム</span>
        <button v-for="z in ZOOM_TABLE" :key="z" class="btn btn-sm" :class="{ on: doc.zoom === z }" @click="setZoom(z)">
          {{ z }}
        </button>
        <span class="sep-v" />
        <span class="zoom-label">分割</span>
        <button v-for="d in DIVI_TABLE" :key="d" class="btn btn-sm" :class="{ on: doc.divi === d }" @click="setDivi(d)">
          {{ d }}
        </button>
        <span class="sep-v" />
        <span class="zoom-label">パネル</span>
        <button v-for="p in (['player', 'projector', 'effector', 'copier'] as const)" :key="p" class="btn btn-sm" :class="{ on: panels[p].open }" @click="panels[p].open = !panels[p].open">
          {{ { player: "Player", projector: "Projector", effector: "Effector", copier: "Copier" }[p] }}
        </button>
        <span class="sep-v" />
        <button class="btn btn-sm" :class="{ on: doc.volumeVisible }" @click="doc.volumeVisible = !doc.volumeVisible">
          Volume
        </button>
      </div>
    </div>
    <div class="collage-body">
      <!-- ピン留めユニットのレーン (上部固定) -->
      <div v-if="pinned.length > 0" class="collage-pinned" :style="{ height: (12 + pinned.length * 16) + 'px' }">
        <PinnedLanes />
      </div>
      <div class="collage-main">
        <!-- 左パネル (W/U で切り替え) -->
        <div class="collage-tray">
          <UnitTray v-if="doc.mode === 'U'" />
          <WoiceTray v-if="doc.mode === 'W'" />
        </div>
        <div class="collage-field-wrap">
          <KeyField />
          <ScrollBar class="vscroll" :vertical="true" :length="88" vertical-kind="key" />
        </div>
        <!-- パネル (ページ埋め込み) -->
        <aside class="collage-sidebar">
          <PlayerPanel v-if="panels.player.open" />
          <ProjectorPanel v-if="panels.projector.open" />
          <EffectorPanel v-if="panels.effector.open" />
          <CopierPanel v-if="panels.copier.open" />
        </aside>
      </div>
    </div>
    <div v-if="doc.volumeVisible" class="collage-vol">
      <VolumePanel :modes="volumeModes" />
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
  background: var(--bg);
}

.collage-header {
  display: flex;
  align-items: stretch;
  background: var(--panel-dark);
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.collage-ruler-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.collage-header-right {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border-left: 1px solid var(--border);
}

.zoom-label {
  font-size: 10px;
  color: var(--text-dim);
  margin: 0 2px;
}

.sep-v {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}

.btn-sm {
  padding: 1px 6px;
  font-size: 11px;
}

.btn-sm.on {
  background: var(--accent-dark);
  border-color: var(--accent);
  color: #fff;
}

.collage-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ピン留めユニットのレーン (上部固定) */
.collage-pinned {
  flex: none;
  border-bottom: 1px solid var(--border);
  background: var(--panel-dark);
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
  border-top: 1px solid var(--border);
  background: var(--panel-dark);
}

.collage-tray {
  width: 144px;
  flex: none;
  border-right: 1px solid var(--border);
  background: var(--panel-dark);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.collage-field-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
}

.collage-field-wrap > :deep(.field-canvas) {
  flex: 1;
}

/* パネルサイドバー (ページ埋め込み) */
.collage-sidebar {
  width: 250px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-left: 1px solid var(--border);
  background: var(--panel-dark);
  overflow-y: auto;
  min-height: 0;
}


.vscroll {
  width: 14px;
  flex: none;
  border-left: 1px solid var(--border);
}

.collage-hscroll {
  display: flex;
  border-top: 1px solid var(--border);
  background: var(--panel-dark);
}

.collage-hscroll-spacer {
  width: 144px;
  flex: none;
}

.hscroll {
  flex: 1;
  height: 14px;
}
</style>
