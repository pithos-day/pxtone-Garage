// アプリのシェル: メニューバー (モードタブ + File/Edit/View) → ファイルタブ →
// 再生コントロール → コンテンツ。
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import MenuBar from "./MenuBar.vue";
import FileTabs from "./FileTabs.vue";
import TransportBar from "./TransportBar.vue";
import ProjectDialog from "./ProjectDialog.vue";
import UpdateToast from "./UpdateToast.vue";
import SettingsDialog from "./SettingsDialog.vue";
import CopyMeasDialog from "./CopyMeasDialog.vue";
import QuantizeDialog from "./QuantizeDialog.vue";
import EventVolumeDialog from "./EventVolumeDialog.vue";
import WavExportDialog from "./WavExportDialog.vue";
import UnsavedDialog from "./UnsavedDialog.vue";
import KeySettingsDialog from "./KeySettingsDialog.vue";
import AboutDialog from "./AboutDialog.vue";
import ProgressDialog from "./ProgressDialog.vue";
import AppDialogHost from "./AppDialogHost.vue";
import LandscapeGuard from "./LandscapeGuard.vue";
import type { EventVolumeMode } from "../../lib/eventVolume";
import type { AppMode } from "../../lib/modes";
import CollageTab from "../collage/CollageEditor.vue";
import VoiceTab from "../voice/VoiceEditor.vue";
import NoiseTab from "../noise/NoiseEditor.vue";
import VoiceCopyDialog from "../voice/VoiceCopyDialog.vue";
import { ensureInitialProject } from "../../state/projects";
import { openSampleProject } from "../../state/samples";
import { droppedFiles } from "../../engine/io";
import { OPEN_KINDS, openFilesInTabs } from "../../state/open-files";
import { initRecentFiles } from "../../state/recent-files";
import { appAlert } from "../../state/dialog";
import { lang, t } from "../../i18n";
import { copyVoiceSide, ensureInitialVoice } from "../../state/voice";
import { ensureInitialNoise } from "../../state/noise";
import { doc } from "../../state/project";
import { MODE_DOCS } from "../../state/mode-docs";
import { useTabCloseFlow } from "../../composables/useTabCloseFlow";
import { restoreDrafts } from "../../state/drafts";
import { useDraftAutosave } from "../../composables/useDraftAutosave";

// 未保存ドラフトを先に復元し、無ければ通常の初期タブを作る。
// 復元したアクティブモードを初期表示に使う
const restoredMode = restoreDrafts();
const activeTab = ref<AppMode>(restoredMode ?? "collage");
const projectDialogOpen = ref(false);
const settingsDialogOpen = ref(false);
const keySettingsDialogOpen = ref(false);
const aboutDialogOpen = ref(false);
const copyMeasOpen = ref(false);
const quantizeOpen = ref(false);
const eventVolumeKind = ref<null | EventVolumeMode>(null);
const wavExportOpen = ref(false);
const wavExportStems = ref(false);
// A/B コピー確認ダイアログ (AB = A→B, BA = B→A)
const voiceCopyDir = ref<null | "AB" | "BA">(null);

const { closeRequest, closeBusy, requestClose, requestCloseAll, onUnsavedSave, onUnsavedDiscard, onUnsavedCancel } =
  useTabCloseFlow(activeTab);

function onVoiceCopyYes(): void {
  if (voiceCopyDir.value === "AB") copyVoiceSide(0, 1);
  else if (voiceCopyDir.value === "BA") copyVoiceSide(1, 0);
  voiceCopyDir.value = null;
}

// マウント前に初期プロジェクトを用意しておく
// (テンプレートの初期描画が空の doc/service を参照しないようにするため)
ensureInitialProject();
ensureInitialVoice();
ensureInitialNoise();
void initRecentFiles();

// 読み込み後に URL から sample クエリを消す。
// 残したままだとリロードのたびにサンプルタブが増えるため
function clearSampleQuery(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("sample")) return;
    url.searchParams.delete("sample");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // URL を書き換えられなくても読み込み自体は成功している
  }
}

// 起動時 URL の ?sample=<id> で同梱サンプルを開く。
// サンプルが見えるよう Collage モードへ切り替える
onMounted(() => {
  const sampleId = new URLSearchParams(window.location.search).get("sample");
  if (!sampleId) return;
  activeTab.value = "collage";
  void openSampleProject(sampleId)
    .then((err) => {
      if (err) void appAlert(err);
    })
    .catch(() => void appAlert(t("error.sampleFetch")))
    .finally(clearSampleQuery);
});

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
  const target = e.target as HTMLElement | null;
  if (target && target.closest?.(".dlg, .ctxmenu")) return;
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

function onDrop(e: DragEvent): void {
  const kind = MODE_DOCS[activeTab.value].openKind;
  // 非対応の拡張子は無視する (音色トレイへのドロップもここへバブリングしてくるため)
  if (!e.dataTransfer) return;
  void droppedFiles(e.dataTransfer, OPEN_KINDS[kind].exts).then((files) => {
    if (files.length > 0) void openFilesInTabs(kind, files);
  });
}

useDraftAutosave(activeTab);

// canvas の文字も切り替わるよう再描画を促す
watch(lang, () => doc.rev++);
</script>

<template>
  <div class="app-shell" @dragover.prevent="onDragOver" @drop.prevent="onDrop">
    <MenuBar
      v-model="activeTab"
      @project="projectDialogOpen = true"
      @settings="settingsDialogOpen = true"
      @key-settings="keySettingsDialogOpen = true"
      @about="aboutDialogOpen = true"
      @request-close="requestClose"
      @request-close-all="requestCloseAll"
      @copy-meas="copyMeasOpen = true"
      @quantize="quantizeOpen = true"
      @event-volume="(kind) => (eventVolumeKind = kind)"
      @export-wav="(stems) => { wavExportStems = stems; wavExportOpen = true; }"
      @voice-copy-a-b="voiceCopyDir = 'AB'"
      @voice-copy-b-a="voiceCopyDir = 'BA'"
    />
    <FileTabs :mode="activeTab" @request-close="requestClose" />
    <TransportBar v-if="activeTab === 'collage'" />
    <main class="app-main">
      <CollageTab
        v-show="activeTab === 'collage'"
        :active="activeTab === 'collage'"
        @open-editor="activeTab = $event"
        @transpose="eventVolumeKind = 'transpose'"
        @quantize="quantizeOpen = true"
      />
      <VoiceTab v-show="activeTab === 'voice'" :active="activeTab === 'voice'" />
      <NoiseTab v-show="activeTab === 'noise'" :active="activeTab === 'noise'" />
    </main>
    <ProjectDialog v-if="projectDialogOpen" @close="projectDialogOpen = false" />
    <SettingsDialog v-if="settingsDialogOpen" @close="settingsDialogOpen = false" />
    <KeySettingsDialog v-if="keySettingsDialogOpen" @close="keySettingsDialogOpen = false" />
    <AboutDialog v-if="aboutDialogOpen" @close="aboutDialogOpen = false" />
    <UnsavedDialog
      v-if="closeRequest"
      :name="closeRequest.name"
      :can-save="closeRequest.canSave"
      :busy="closeBusy"
      @save="onUnsavedSave"
      @discard="onUnsavedDiscard"
      @cancel="onUnsavedCancel"
    />
    <CopyMeasDialog v-if="copyMeasOpen" @close="copyMeasOpen = false" />
    <QuantizeDialog v-if="quantizeOpen" @close="quantizeOpen = false" />
    <EventVolumeDialog v-if="eventVolumeKind" :kind="eventVolumeKind" @close="eventVolumeKind = null" />
    <WavExportDialog v-if="wavExportOpen" :stems="wavExportStems" @close="wavExportOpen = false" />
    <VoiceCopyDialog
      v-if="voiceCopyDir"
      :direction="voiceCopyDir"
      @yes="onVoiceCopyYes"
      @close="voiceCopyDir = null"
    />
    <!-- IO 中の進捗ダイアログ (state/progress を購読する) -->
    <ProgressDialog />
    <AppDialogHost />
    <LandscapeGuard />
    <UpdateToast />
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
