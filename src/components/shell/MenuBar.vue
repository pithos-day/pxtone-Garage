// 上部メニューバー (Blockbench 風)。
// 左: Collage/Voice/Noise のモードタブ (大きめフォント)
// 右: モード別ドロップダウンメニュー (collage = File/Edit/View、voice/noise = File)
<script setup lang="ts">
import { computed } from "vue";
import { FileUp, FileDown, Music, ListMusic, FileMusic, AudioLines, SlidersHorizontal, Settings, SquareStack, CircleGauge, Copy } from "@lucide/vue";
import { doc, setAllUnitsVisible, exportBytes } from "../../state/project";
import {
  newProjectInTab,
  openProjectInTab,
  closeProject,
  saveProject,
  saveProjectAs,
  currentProjectId,
} from "../../state/projects";
import { newVoice, openVoice, saveVoice, closeVoice, undoVoice, redoVoice, currentVoice, currentVoiceId } from "../../state/voice";
import { newNoise, openNoise, saveNoise, closeNoise, undoNoise, redoNoise, currentNoise, currentNoiseId } from "../../state/noise";
import { exportPttune, exportWav, exportVoiceWav, exportNoiseWav, openFileDialog } from "../../engine/io";
import { convertMidiToPtcop } from "../../engine/midi";
import { undo, redo, canUndo, canRedo } from "../../state/undo";
import { t } from "../../i18n";
import type { EventVolumeMode } from "../../lib/eventVolume";
import type { AppMode } from "../../lib/modes";
import MenuItemRow from "./MenuItemRow.vue";
import {
  buildFileMenu,
  buildEditMenu,
  buildViewMenu,
  MENU_LABELS,
  menuNamesFor,
  type MenuItem,
  type MenuName,
  type ModeMenuOps,
} from "../../lib/menuItems";
import { useDropdownMenu } from "../../composables/useDropdownMenu";
import ModeTabs from "./ModeTabs.vue";

const mode = defineModel<AppMode>({ required: true });const emit = defineEmits<{
  (e: "project"): void;
  (e: "settings"): void;
  (e: "copyMeas"): void;
  (e: "eventVolume", kind: EventVolumeMode): void;
  (e: "voiceCopyAB"): void;
  (e: "voiceCopyBA"): void;
}>();

// ドロップダウンの開閉管理 (メニュー外クリック / Escape で閉じる)
const { openMenu, openSubIndex, toggleMenu, hoverMenu, close } = useDropdownMenu<MenuName>();

// モード別のトップメニュー (表示ラベルと順序は lib/menuItems で定義)
const menuNames = computed<MenuName[]>(() => menuNamesFor(mode.value));

function runMenuItem(item: MenuItem): void {
  if (item.disabled) return;
  if (item.sub) return;
  close();
  item.action?.();
}

// ---- コラージュのアクション ----

function onNew(): void {
  if (doc.dirty && !window.confirm(t("confirm.new"))) return;
  newProjectInTab();
}

// 保存系アクション: 書き込み失敗時だけエラー表示 (キャンセルは何もしない)
function runSave(p: Promise<unknown>): void {
  void p.catch(() => window.alert(t("error.save")));
}

function onOpen(): void {
  void openFileDialog(".ptcop,.pttune").then((file) => {
    if (!file) return;
    const err = openProjectInTab(file.bytes, file.name);
    if (err) window.alert(err);
  });
}

function onExportPttune(): void {
  const bytes = exportBytes();
  if (bytes) runSave(exportPttune(bytes, doc.fileName || "untitled"));
}

// MIDI ファイルを選択して ptcop として読み込む (split = 和音を別ユニットに分割)
function onImportMidi(split: boolean): void {
  void openFileDialog(".mid,.midi", /\.midi?$/i).then((file) => {
    if (!file) return;
    const bytes = convertMidiToPtcop(file.bytes, split ? { splitOverlap: true } : {});
    if (!bytes) {
      window.alert(t("error.midi"));
      return;
    }
    const err = openProjectInTab(bytes, file.name);
    if (err) window.alert(err);
  });
}

function onExportWav(): void {
  const bytes = exportBytes();
  if (bytes) {
    void exportWav(bytes, doc.fileName || "untitled").then((err) => {
      if (err) window.alert(err);
    });
  }
}

function onClose(): void {
  const id = currentProjectId.value;
  if (doc.dirty && !window.confirm(t("confirm.close"))) return;
  closeProject(id);
}

// ---- 音声 (ptVoice) のアクション ----

function onOpenVoice(): void {
  void openFileDialog(".ptvoice", /\.ptvoice$/i).then((file) => {
    if (!file) return;
    const err = openVoice(file.bytes, file.name);
    if (err) window.alert(err);
  });
}

function onCloseVoice(): void {
  const id = currentVoiceId.value;
  if (currentVoice()?.dirty && !window.confirm(t("confirm.close"))) return;
  closeVoice(id);
}

// ---- ノイズ (ptNoise) のアクション ----

function onOpenNoise(): void {
  void openFileDialog(".ptnoise", /\.ptnoise$/i).then((file) => {
    if (!file) return;
    const err = openNoise(file.bytes, file.name);
    if (err) window.alert(err);
  });
}

function onCloseNoise(): void {
  const id = currentNoiseId.value;
  if (currentNoise()?.dirty && !window.confirm(t("confirm.close"))) return;
  closeNoise(id);
}

// ---- WAV 書き出し (voice/noise) ----

function onExportVoiceWav(): void {
  const v = currentVoice();
  if (!v) return;
  void exportVoiceWav(v.woice, v.fileName || "untitled").then((err) => {
    if (err) window.alert(err);
  });
}

function onExportNoiseWav(): void {
  const d = currentNoise();
  if (!d) return;
  void exportNoiseWav(d.noise, d.fileName || "untitled").then((err) => {
    if (err) window.alert(err);
  });
}

// ---- モード別メニュー ----

const allVisible = computed(() => doc.unitVisible.length > 0 && doc.unitVisible.every(Boolean));

// モード別に差し替わる操作 (File メニュー・undo/redo)。3 分岐をこのテーブルに集約
const modeOps: Record<AppMode, ModeMenuOps> = {
  collage: {
    new: onNew,
    open: onOpen,
    save: () => runSave(saveProject()),
    saveAs: () => runSave(saveProjectAs()),
    close: onClose,
    undo,
    redo,
    canUndo: () => canUndo.value,
    canRedo: () => canRedo.value,
  },
  voice: {
    new: () => newVoice(),
    open: onOpenVoice,
    save: () => runSave(saveVoice(false)),
    saveAs: () => runSave(saveVoice(true)),
    close: onCloseVoice,
    undo: undoVoice,
    redo: redoVoice,
    canUndo: () => (currentVoice()?.undoStack.length ?? 0) > 0,
    canRedo: () => (currentVoice()?.redoStack.length ?? 0) > 0,
  },
  noise: {
    new: () => newNoise(),
    open: onOpenNoise,
    save: () => runSave(saveNoise(false)),
    saveAs: () => runSave(saveNoise(true)),
    close: onCloseNoise,
    undo: undoNoise,
    redo: redoNoise,
    canUndo: () => (currentNoise()?.undoStack.length ?? 0) > 0,
    canRedo: () => (currentNoise()?.redoStack.length ?? 0) > 0,
  },
};

const fileMenu = computed<MenuItem[]>(() => {
  const ops = modeOps[mode.value];
const extra: MenuItem[] =
    mode.value === "collage"
      ? [
          {
            label: t("menu.file.importMidi"),
            icon: FileUp,
            sub: [
              { label: t("menu.file.importMidiNormal"), icon: Music, action: () => onImportMidi(false) },
              { label: t("menu.file.importMidiSplit"), icon: ListMusic, action: () => onImportMidi(true) },
            ],
          },
          {
            label: t("menu.file.export"),
            icon: FileDown,
            sub: [
              { label: t("menu.file.exportPttune"), icon: FileMusic, action: onExportPttune },
              { label: t("menu.file.exportWav"), icon: AudioLines, action: onExportWav },
            ],
          },
          { sep: true },
          { label: t("menu.file.project"), icon: SlidersHorizontal, action: () => emit("project") },
          { label: t("menu.file.settings"), icon: Settings, action: () => emit("settings") },
          { sep: true },
        ]
      : [
          // voice: 現在の音色を単音レンダリングして WAV 化 / noise: 現在のノイズを WAV 化。
          // ファイル未オープン (タブ0件) では書き出せないため disabled
          {
            label: t("menu.file.exportWav"),
            icon: AudioLines,
            action: mode.value === "voice" ? onExportVoiceWav : onExportNoiseWav,
            disabled: mode.value === "voice" ? !currentVoice() : !currentNoise(),
          },
          { sep: true },
          { label: t("menu.file.settings"), icon: Settings, action: () => emit("settings") },
          { sep: true },
        ];
  return buildFileMenu(ops, extra);
});

const editMenu = computed<MenuItem[]>(() => {
  const ops = modeOps[mode.value];
  const extra: MenuItem[] =
    mode.value === "voice"
      ? [
          { sep: true },
          { label: t("menu.edit.copyAtoB"), icon: Copy, action: () => emit("voiceCopyAB") },
          { label: t("menu.edit.copyBtoA"), icon: Copy, action: () => emit("voiceCopyBA") },
        ]
      : mode.value === "collage"
        ? [
            { sep: true },
            { label: t("menu.edit.copyMeas"), icon: SquareStack, action: () => emit("copyMeas") },
            { label: t("menu.edit.velocity"), icon: CircleGauge, action: () => emit("eventVolume", "velocity") },
            { label: t("menu.edit.pantime"), icon: CircleGauge, action: () => emit("eventVolume", "pantime") },
            { label: t("menu.edit.panvolume"), icon: CircleGauge, action: () => emit("eventVolume", "panvolume") },
            { label: t("menu.edit.volume"), icon: CircleGauge, action: () => emit("eventVolume", "volume") },
          ]
        : [];
  return buildEditMenu(ops, extra);
});

const viewMenu = computed<MenuItem[]>(() =>
  buildViewMenu({
    allVisible: allVisible.value,
    zoom: doc.zoom,
    divi: doc.divi,
    onToggleAll: () => setAllUnitsVisible(!allVisible.value),
    onZoom: (z) => (doc.zoom = z),
    onDivi: (d) => (doc.divi = d),
  }),
);

const openItems = computed<MenuItem[]>(() => {
  if (openMenu.value === "file") return fileMenu.value;
  if (openMenu.value === "edit") return editMenu.value;
  if (openMenu.value === "view") return viewMenu.value;
  return [];
});
</script>

<template>
  <div class="menu-bar bar-header">
    <ModeTabs :mode="mode" @change="mode = $event" />
    <div class="menu-right">
      <button
        v-for="m in menuNames"
        :key="m"
        class="menu-label"
        :class="{ open: openMenu === m }"
        @click="toggleMenu(m)"
        @mouseenter="hoverMenu(m)"
      >
        {{ MENU_LABELS[m] }}
      </button>
      <div v-if="openMenu" class="menu-pop popup">
        <MenuItemRow
          v-for="(item, i) in openItems"
          :key="i"
          :item="item"
          :sub-open="openSubIndex === i"
          @hover="openSubIndex = item.sub ? i : -1"
          @select="runMenuItem"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: stretch;
  height: 40px;
  z-index: 30;
}

.mode-tab {
  padding: 0 18px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--text-xl);
  font-weight: bold;
  cursor: pointer;
}

.mode-tab:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.mode-tab.active {
  background: var(--background);
  color: var(--foreground);
  box-shadow: inset 0 3px 0 var(--primary);
}

/* メニュー (File / Edit / View) — 左揃え (モードタブの直後) */
.menu-right {
  display: flex;
  position: relative;
}

.menu-label {
  padding: 0 14px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--text-lg);
  cursor: pointer;
}

.menu-label:hover,
.menu-label.open {
  background: var(--card);
  color: var(--card-foreground);
}

.menu-pop {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 190px;
  background: var(--card);
  padding: 3px 0;
}
</style>
