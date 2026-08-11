// 上部メニューバー (Blockbench 風)。
// 左: Collage/Voice/Noise のモードタブ (大きめフォント)
// 右: モード別ドロップダウンメニュー (collage = File/Edit/View、voice/noise = File)
<script setup lang="ts">
import { computed } from "vue";
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
import { exportPttune, exportWav, openFileDialog } from "../../engine/io";
import { undo, redo, canUndo, canRedo } from "../../state/undo";
import { t } from "../../i18n";
import type { EventVolumeMode } from "../../lib/eventVolume";
import type { AppMode } from "../../lib/modes";
import MenuItemRow from "./MenuItemRow.vue";
import { buildFileMenu, buildEditMenu, buildViewMenu, type MenuItem, type ModeMenuOps } from "../../lib/menuItems";
import { useDropdownMenu } from "../../composables/useDropdownMenu";
import ModeTabs from "./ModeTabs.vue";

const mode = defineModel<AppMode>({ required: true });
const emit = defineEmits<{
  (e: "project"): void;
  (e: "settings"): void;
  (e: "copyMeas"): void;
  (e: "eventVolume", kind: EventVolumeMode): void;
  (e: "voiceCopyAB"): void;
  (e: "voiceCopyBA"): void;
}>();

type MenuName = "file" | "edit" | "view";

// トップメニューの表示ラベル (順序もここで定義)
const MENU_LABELS: Record<MenuName, string> = {
  file: "File",
  edit: "Edit",
  view: "View",
};

// ドロップダウンの開閉管理 (メニュー外クリック / Escape で閉じる)
const { openMenu, openSubIndex, toggleMenu, hoverMenu, close } = useDropdownMenu<MenuName>();

// モード別のトップメニュー (voice/noise は File のみ)
const menuNames = computed<MenuName[]>(() => (mode.value === "collage" ? ["file", "edit", "view"] : ["file"]));

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

function onOpen(): void {
  void openFileDialog(".ptcop,.pttune").then((file) => {
    if (!file) return;
    const err = openProjectInTab(file.bytes, file.name);
    if (err) window.alert(err);
  });
}

function onExportPttune(): void {
  const bytes = exportBytes();
  if (bytes) exportPttune(bytes, doc.fileName || "untitled");
}

function onExportWav(): void {
  const bytes = exportBytes();
  if (bytes) {
    const err = exportWav(bytes, doc.fileName || "untitled");
    if (err) window.alert(err);
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

// ---- モード別メニュー ----

const allVisible = computed(() => doc.unitVisible.length > 0 && doc.unitVisible.every(Boolean));

// モード別に差し替わる操作 (File メニュー・undo/redo)。3 分岐をこのテーブルに集約
const modeOps: Record<AppMode, ModeMenuOps> = {
  collage: {
    new: onNew,
    open: onOpen,
    save: () => saveProject(),
    saveAs: () => saveProjectAs(),
    close: onClose,
    undo,
    redo,
    canUndo: () => canUndo.value,
    canRedo: () => canRedo.value,
  },
  voice: {
    new: () => newVoice(),
    open: onOpenVoice,
    save: () => saveVoice(false),
    saveAs: () => saveVoice(true),
    close: onCloseVoice,
    undo: undoVoice,
    redo: redoVoice,
    canUndo: () => (currentVoice()?.undoStack.length ?? 0) > 0,
    canRedo: () => (currentVoice()?.redoStack.length ?? 0) > 0,
  },
  noise: {
    new: () => newNoise(),
    open: onOpenNoise,
    save: () => saveNoise(false),
    saveAs: () => saveNoise(true),
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
          { label: t("menu.file.exportPttune"), action: onExportPttune },
          { label: t("menu.file.exportWav"), action: onExportWav },
          { sep: true },
          { label: t("menu.file.project"), action: () => emit("project") },
          { label: t("menu.file.settings"), action: () => emit("settings") },
          { sep: true },
        ]
      : [];
  return buildFileMenu(ops, extra);
});

const editMenu = computed<MenuItem[]>(() => {
  const ops = modeOps[mode.value];
  const extra: MenuItem[] =
    mode.value === "voice"
      ? [
          { sep: true },
          { label: t("menu.edit.copyAtoB"), action: () => emit("voiceCopyAB") },
          { label: t("menu.edit.copyBtoA"), action: () => emit("voiceCopyBA") },
        ]
      : mode.value === "collage"
        ? [
            { sep: true },
            { label: t("menu.edit.copyMeas"), action: () => emit("copyMeas") },
            { label: t("menu.edit.velocity"), action: () => emit("eventVolume", "velocity") },
            { label: t("menu.edit.pantime"), action: () => emit("eventVolume", "pantime") },
            { label: t("menu.edit.panvolume"), action: () => emit("eventVolume", "panvolume") },
            { label: t("menu.edit.volume"), action: () => emit("eventVolume", "volume") },
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
  <div class="menu-bar">
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
      <div v-if="openMenu" class="menu-pop">
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
  height: 36px;
  background: var(--background);
  border-bottom: 1px solid var(--border);
  user-select: none;
  z-index: 30;
}

.mode-tab {
  padding: 0 18px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 17px;
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
  font-size: 13px;
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
  border: 1px solid var(--border);
  box-shadow: 2px 2px 10px rgb(0 0 0 / 0.35);
  padding: 3px 0;
  z-index: 100;
}
</style>
