// アプリのシェル: メニューバー (モードタブ + File/Edit/View) → ファイルタブ →
// 再生コントロール → コンテンツ。
<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import MenuBar from "./MenuBar.vue";
import FileTabs from "./FileTabs.vue";
import TransportBar from "./TransportBar.vue";
import ProjectDialog from "./ProjectDialog.vue";
import SettingsDialog from "./SettingsDialog.vue";
import CopyMeasDialog from "./CopyMeasDialog.vue";
import EventVolumeDialog from "./EventVolumeDialog.vue";
import type { EventVolumeMode } from "../../lib/eventVolume";
import type { AppMode } from "../../lib/modes";
import CollageTab from "../collage/CollageEditor.vue";
import VoiceTab from "../voice/VoiceEditor.vue";
import NoiseTab from "../noise/NoiseEditor.vue";
import VoiceCopyDialog from "../voice/VoiceCopyDialog.vue";
import { ensureInitialProject } from "../../state/projects";
import { openProjectInTab } from "../../state/projects";
import { initLanguage } from "../../i18n";
import { copyVoiceSide, openVoice, ensureInitialVoice } from "../../state/voice";
import { openNoise, ensureInitialNoise } from "../../state/noise";

const activeTab = ref<AppMode>("collage");
const projectDialogOpen = ref(false);
const settingsDialogOpen = ref(false);
const copyMeasOpen = ref(false);
const eventVolumeKind = ref<null | EventVolumeMode>(null);
// A/B コピー確認ダイアログ (AB = A→B, BA = B→A)
const voiceCopyDir = ref<null | "AB" | "BA">(null);

function onVoiceCopyYes(): void {
  if (voiceCopyDir.value === "AB") copyVoiceSide(0, 1);
  else if (voiceCopyDir.value === "BA") copyVoiceSide(1, 0);
  voiceCopyDir.value = null;
}

// マウント前に初期プロジェクトと言語設定を済ませておく
// (テンプレートの初期描画が空の doc/service を参照しないようにするため)
ensureInitialProject();
ensureInitialVoice();
ensureInitialNoise();
initLanguage();

// ブラウザのコンテキストメニューをアプリ全体で無効化
// (アプリ独自の右クリックメニューは preventDefault だけで動作する)
const onAppContextMenu = (e: Event): void => e.preventDefault();

// インプットフォーカスの解除: テキスト入力がフォーカス中に、
// その入力の外側をクリックしたら blur() を呼んで確実に解除する
// (一部の要素では既定のフォーカス移動が起きないため)
const onAppPointerDown = (e: PointerEvent): void => {
  const el = document.activeElement;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
  if (el === e.target || el.contains(e.target as Node)) return;
  const t = e.target as HTMLElement | null;
  if (t && t.closest?.(".dlg, .ctxmenu")) return;
  (el as HTMLElement).blur();
};

window.addEventListener("contextmenu", onAppContextMenu, true);
window.addEventListener("pointerdown", onAppPointerDown, true);
onBeforeUnmount(() => {
  window.removeEventListener("contextmenu", onAppContextMenu, true);
  window.removeEventListener("pointerdown", onAppPointerDown, true);
});

// モード別にファイルをドロップで開く。現在のモードに対応する拡張子のみ受け付ける
function onDragOver(e: DragEvent): void {
  e.preventDefault();
}

async function onDrop(e: DragEvent): Promise<void> {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const name = file.name.replace(/\.(ptcop|pttune|ptvoice|ptnoise)$/i, "");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let err: string | null = null;
  if (activeTab.value === "collage" && (ext === "ptcop" || ext === "pttune")) {
    err = openProjectInTab(bytes, name);
  } else if (activeTab.value === "voice" && ext === "ptvoice") {
    err = openVoice(bytes, name);
  } else if (activeTab.value === "noise" && ext === "ptnoise") {
    err = openNoise(bytes, name);
  }
  if (err) window.alert(err);
}
</script>

<template>
  <div class="app-shell" @dragover.prevent="onDragOver" @drop.prevent="onDrop">
    <MenuBar
      v-model="activeTab"
      @project="projectDialogOpen = true"
      @settings="settingsDialogOpen = true"
      @copy-meas="copyMeasOpen = true"
      @event-volume="(kind) => (eventVolumeKind = kind)"
      @voice-copy-a-b="voiceCopyDir = 'AB'"
      @voice-copy-b-a="voiceCopyDir = 'BA'"
    />
    <FileTabs :mode="activeTab" />
    <TransportBar v-if="activeTab === 'collage'" />
    <main class="app-main">
      <CollageTab v-show="activeTab === 'collage'" :active="activeTab === 'collage'" @open-editor="activeTab = $event" />
      <VoiceTab v-show="activeTab === 'voice'" :active="activeTab === 'voice'" />
      <NoiseTab v-show="activeTab === 'noise'" :active="activeTab === 'noise'" />
    </main>
    <ProjectDialog v-if="projectDialogOpen" @close="projectDialogOpen = false" />
    <SettingsDialog v-if="settingsDialogOpen" @close="settingsDialogOpen = false" />
    <CopyMeasDialog v-if="copyMeasOpen" @close="copyMeasOpen = false" />
    <EventVolumeDialog v-if="eventVolumeKind" :kind="eventVolumeKind" @close="eventVolumeKind = null" />
    <VoiceCopyDialog
      v-if="voiceCopyDir"
      :direction="voiceCopyDir"
      @yes="onVoiceCopyYes"
      @close="voiceCopyDir = null"
    />
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
