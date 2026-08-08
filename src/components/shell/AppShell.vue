// アプリのシェル: メニューバー (モードタブ + File/Edit/View) → ファイルタブ →
// 再生コントロール → コンテンツ。
<script setup lang="ts">
import { ref } from "vue";
import MenuBar from "./MenuBar.vue";
import FileTabs from "./FileTabs.vue";
import TransportBar from "./TransportBar.vue";
import ProjectDialog from "./ProjectDialog.vue";
import SettingsDialog from "./SettingsDialog.vue";
import CollageTab from "../collage/CollageEditor.vue";
import VoiceTab from "../voice/VoiceEditor.vue";
import NoiseTab from "../noise/NoiseEditor.vue";
import { ensureInitialProject } from "../../state/projects";
import { initLanguage } from "../../i18n";

const activeTab = ref<"collage" | "voice" | "noise">("collage");
const projectDialogOpen = ref(false);
const settingsDialogOpen = ref(false);

ensureInitialProject();
initLanguage();

// ブラウザのコンテキストメニューをアプリ全体で無効化
// (アプリ独自の右クリックメニューは preventDefault だけで動作する)
window.addEventListener(
  "contextmenu",
  (e) => e.preventDefault(),
  true,
);
</script>

<template>
  <div class="app-shell">
    <MenuBar v-model="activeTab" @project="projectDialogOpen = true" @settings="settingsDialogOpen = true" />
    <FileTabs />
    <TransportBar />
    <main class="app-main">
      <CollageTab v-show="activeTab === 'collage'" />
      <VoiceTab v-show="activeTab === 'voice'" />
      <NoiseTab v-show="activeTab === 'noise'" />
    </main>
    <ProjectDialog v-if="projectDialogOpen" @close="projectDialogOpen = false" />
    <SettingsDialog v-if="settingsDialogOpen" @close="settingsDialogOpen = false" />
  </div>
</template>

<style scoped>
.app-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
