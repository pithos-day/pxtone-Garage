// アプリのシェル: メニューバー (モードタブ + File/Edit/View) → ファイルタブ →
// 再生コントロール → コンテンツ。
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import MenuBar from "./MenuBar.vue";
import FileTabs from "./FileTabs.vue";
import TransportBar from "./TransportBar.vue";
import ProjectDialog from "./ProjectDialog.vue";
import SettingsDialog from "./SettingsDialog.vue";
import CopyMeasDialog from "./CopyMeasDialog.vue";
import EventVolumeDialog from "./EventVolumeDialog.vue";
import WavExportDialog from "./WavExportDialog.vue";
import UnsavedDialog from "./UnsavedDialog.vue";
import KeySettingsDialog from "./KeySettingsDialog.vue";
import ProgressDialog from "./ProgressDialog.vue";
import type { EventVolumeMode } from "../../lib/eventVolume";
import type { AppMode } from "../../lib/modes";
import CollageTab from "../collage/CollageEditor.vue";
import VoiceTab from "../voice/VoiceEditor.vue";
import NoiseTab from "../noise/NoiseEditor.vue";
import VoiceCopyDialog from "../voice/VoiceCopyDialog.vue";
import { closeProject, ensureInitialProject, openProjectFromBlob, projects, saveProject, switchProject } from "../../state/projects";
import { openSampleProject } from "../../state/samples";
import { readBlobAndApply } from "../../engine/io";
import { initLanguage, t } from "../../i18n";
import { copyVoiceSide, openVoice, ensureInitialVoice, closeVoice, saveVoice, voiceRevision, voices, switchVoice } from "../../state/voice";
import { openNoise, ensureInitialNoise, closeNoise, saveNoise, noiseRevision, noises, switchNoise } from "../../state/noise";
import { doc } from "../../state/project";
import {
  cancelDraftSave,
  hasUnsavedDocuments,
  restoreDrafts,
  saveDraftsNow,
  scheduleDraftSave,
} from "../../state/drafts";

// 未保存ドラフトを先に復元し、無ければ通常の初期タブを作る。
// 復元したアクティブモードを初期表示に使う
const restoredMode = restoreDrafts();
const activeTab = ref<AppMode>(restoredMode ?? "collage");
const projectDialogOpen = ref(false);
const settingsDialogOpen = ref(false);
const keySettingsDialogOpen = ref(false);
const copyMeasOpen = ref(false);
const eventVolumeKind = ref<null | EventVolumeMode>(null);
const wavExportOpen = ref(false);
// A/B コピー確認ダイアログ (AB = A→B, BA = B→A)
const voiceCopyDir = ref<null | "AB" | "BA">(null);

// 未保存のタブを閉じる際の確認ダイアログ
interface CloseRequest {
  mode: AppMode;
  id: number;
  name: string;
  canSave: boolean;
}
const closeRequest = ref<CloseRequest | null>(null);
const closeBusy = ref(false);

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
      if (err) window.alert(err);
    })
    .catch(() => window.alert(t("error.sampleFetch")))
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
  // 現在のモードに対応する拡張子のみ開く (読み込みは進捗つき・キャンセル可)
  let err: string | null = null;
  if (activeTab.value === "collage" && (ext === "ptcop" || ext === "pttune")) {
    err = await openProjectFromBlob(file, name);
  } else if (activeTab.value === "voice" && ext === "ptvoice") {
    err = await readBlobAndApply(t("progress.openTitle"), file, (bytes) => openVoice(bytes, name));
  } else if (activeTab.value === "noise" && ext === "ptnoise") {
    err = await readBlobAndApply(t("progress.openTitle"), file, (bytes) => openNoise(bytes, name));
  }
  if (err) window.alert(err);
}

// ---- 未保存のタブを閉じる ----

function closeTargetInfo(mode: AppMode, id: number): { name: string; dirty: boolean; canSave: boolean } | null {
  if (mode === "collage") {
    const p = projects.value.find((x) => x.id === id);
    return p ? { name: p.fileName || t("common.untitled"), dirty: p.dirty, canSave: p.kind !== "tune" } : null;
  }
  if (mode === "voice") {
    const v = voices.value.find((x) => x.id === id);
    return v ? { name: v.fileName || t("common.untitled"), dirty: v.dirty, canSave: true } : null;
  }
  const n = noises.value.find((x) => x.id === id);
  return n ? { name: n.fileName || t("common.untitled"), dirty: n.dirty, canSave: true } : null;
}

function closeNow(mode: AppMode, id: number): void {
  if (mode === "collage") closeProject(id);
  else if (mode === "voice") closeVoice(id);
  else closeNoise(id);
  closeRequest.value = null;
  // 閉じたタブを退避データからも消す (次回起動時に復活させない)
  saveDraftsNow(activeTab.value);
}

// タブの X / メニューの「閉じる」から呼ばれる。未保存なら 3 択ダイアログを出す
function requestClose(mode: AppMode, id: number): void {
  const target = closeTargetInfo(mode, id);
  if (!target) return;
  if (!target.dirty) {
    closeNow(mode, id);
    return;
  }
  // 非アクティブタブの「保存」は現在のタブを保存してしまうため、対象へ切り替える
  if (mode === "collage") switchProject(id);
  else if (mode === "voice") switchVoice(id);
  else switchNoise(id);
  closeRequest.value = { mode, id, name: target.name, canSave: target.canSave };
}

async function onUnsavedSave(): Promise<void> {
  const req = closeRequest.value;
  if (!req || closeBusy.value) return;
  closeBusy.value = true;
  let saved = false;
  try {
    if (req.mode === "collage") saved = await saveProject();
    else if (req.mode === "voice") saved = await saveVoice(false);
    else saved = await saveNoise(false);
  } catch {
    window.alert(t("error.save"));
  } finally {
    closeBusy.value = false;
  }
  // 保存ダイアログをキャンセルした場合はダイアログを開いたままにする
  if (saved) closeNow(req.mode, req.id);
}

function onUnsavedDiscard(): void {
  const req = closeRequest.value;
  if (req) closeNow(req.mode, req.id);
}

// ---- 未保存ドラフトの自動退避 ----

// 編集 (doc.rev / dirty / voice・noise の revision) を監視して遅延保存する
watch(
  [
    () => doc.rev,
    () => doc.dirty,
    () => projects.value.map((p) => `${p.id}:${p.dirty}`).join("|"),
    voiceRevision,
    noiseRevision,
  ],
  () => scheduleDraftSave(activeTab.value),
);
watch(activeTab, () => scheduleDraftSave(activeTab.value));

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (!hasUnsavedDocuments()) return;
  // ここで同期保存しておくことで、確認ダイアログで「離れる」を選んでも復元できる
  saveDraftsNow(activeTab.value);
  e.preventDefault();
  e.returnValue = "";
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") saveDraftsNow(activeTab.value);
}

window.addEventListener("beforeunload", onBeforeUnload);
document.addEventListener("visibilitychange", onVisibilityChange);
// 編集を検知できない経路 (直接のデータ変更など) の保険
const draftInterval = window.setInterval(() => {
  if (hasUnsavedDocuments()) saveDraftsNow(activeTab.value);
}, 30000);
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.clearInterval(draftInterval);
  cancelDraftSave();
});
</script>

<template>
  <div class="app-shell" @dragover.prevent="onDragOver" @drop.prevent="onDrop">
    <MenuBar
      v-model="activeTab"
      @project="projectDialogOpen = true"
      @settings="settingsDialogOpen = true"
      @key-settings="keySettingsDialogOpen = true"
      @request-close="requestClose"
      @copy-meas="copyMeasOpen = true"
      @event-volume="(kind) => (eventVolumeKind = kind)"
      @export-wav="wavExportOpen = true"
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
      />
      <VoiceTab v-show="activeTab === 'voice'" :active="activeTab === 'voice'" />
      <NoiseTab v-show="activeTab === 'noise'" :active="activeTab === 'noise'" />
    </main>
    <ProjectDialog v-if="projectDialogOpen" @close="projectDialogOpen = false" />
    <SettingsDialog v-if="settingsDialogOpen" @close="settingsDialogOpen = false" />
    <KeySettingsDialog v-if="keySettingsDialogOpen" @close="keySettingsDialogOpen = false" />
    <UnsavedDialog
      v-if="closeRequest"
      :name="closeRequest.name"
      :can-save="closeRequest.canSave"
      :busy="closeBusy"
      @save="onUnsavedSave"
      @discard="onUnsavedDiscard"
      @cancel="closeRequest = null"
    />
    <CopyMeasDialog v-if="copyMeasOpen" @close="copyMeasOpen = false" />
    <EventVolumeDialog v-if="eventVolumeKind" :kind="eventVolumeKind" @close="eventVolumeKind = null" />
    <WavExportDialog v-if="wavExportOpen" @close="wavExportOpen = false" />
    <VoiceCopyDialog
      v-if="voiceCopyDir"
      :direction="voiceCopyDir"
      @yes="onVoiceCopyYes"
      @close="voiceCopyDir = null"
    />
    <!-- IO 中の進捗ダイアログ (state/progress を購読する) -->
    <ProgressDialog />
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
