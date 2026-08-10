// 上部メニューバー (Blockbench 風)。
// 左: Collage/Voice/Noise のモードタブ (大きめフォント)
// 右: モード別ドロップダウンメニュー (collage = File/Edit/View、voice/noise = File)
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { doc, setAllUnitsVisible, exportBytes } from "../../state/project";
import {
  newProjectInTab,
  openProjectInTab,
  closeProject,
  saveProject,
  saveProjectAs,
  currentProjectId,
} from "../../state/projects";
import { newVoice, openVoice, saveVoice, closeVoice, undoVoice, redoVoice, voices, currentVoiceId } from "../../state/voice";
import { newNoise, openNoise, saveNoise, closeNoise, undoNoise, redoNoise, noises, currentNoiseId } from "../../state/noise";
import { exportPttune, exportWav, openFileDialog } from "../../engine/io";
import { undo, redo, canUndo, canRedo } from "../../state/undo";
import { ZOOM_TABLE, DIVI_TABLE } from "../../lib/clock";
import { t } from "../../i18n";
import type { EventVolumeMode } from "./EventVolumeDialog.vue";
import MenuItemRow, { type MenuItem } from "./MenuItemRow.vue";

const mode = defineModel<"collage" | "voice" | "noise">({ required: true });
const emit = defineEmits<{
  (e: "project"): void;
  (e: "settings"): void;
  (e: "copyMeas"): void;
  (e: "eventVolume", kind: EventVolumeMode): void;
}>();

type MenuName = "file" | "edit" | "view";

// トップメニューの表示ラベル (順序もここで定義)
const MENU_LABELS: Record<MenuName, string> = {
  file: "File",
  edit: "Edit",
  view: "View",
};

const openMenu = ref<null | MenuName>(null);
const openSubIndex = ref(-1);

// モード別のトップメニュー (voice/noise は File のみ)
const menuNames = computed<MenuName[]>(() => (mode.value === "collage" ? ["file", "edit", "view"] : ["file"]));

function toggleMenu(name: MenuName): void {
  openMenu.value = openMenu.value === name ? null : name;
  openSubIndex.value = -1;
}

function hoverMenu(name: MenuName): void {
  if (openMenu.value) {
    openMenu.value = name;
    openSubIndex.value = -1;
  }
}

function runMenuItem(item: MenuItem): void {
  if (item.disabled) return;
  if (item.sub) return;
  openMenu.value = null;
  openSubIndex.value = -1;
  item.action?.();
}

function onGlobalClick(e: MouseEvent): void {
  if (!(e.target as HTMLElement).closest(".menu-bar")) {
    openMenu.value = null;
    openSubIndex.value = -1;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && openMenu.value) {
    openMenu.value = null;
    openSubIndex.value = -1;
  }
}

onMounted(() => {
  window.addEventListener("click", onGlobalClick);
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("click", onGlobalClick);
  window.removeEventListener("keydown", onKeydown);
});

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
  const v = voices.value.find((x) => x.id === id);
  if (v?.dirty && !window.confirm(t("confirm.close"))) return;
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
  const n = noises.value.find((x) => x.id === id);
  if (n?.dirty && !window.confirm(t("confirm.close"))) return;
  closeNoise(id);
}

// ---- モード別メニュー ----

const allVisible = computed(() => doc.unitVisible.length > 0 && doc.unitVisible.every(Boolean));

const fileMenu = computed<MenuItem[]>(() => {
  if (mode.value === "voice") {
    return [
      { label: t("menu.file.new"), action: () => newVoice() },
      { label: t("menu.file.open"), action: onOpenVoice },
      { label: t("menu.file.save"), action: () => saveVoice(false) },
      { label: t("menu.file.saveAs"), action: () => saveVoice(true) },
      { sep: true },
      { label: t("menu.file.close"), action: onCloseVoice },
    ];
  }
  if (mode.value === "noise") {
    return [
      { label: t("menu.file.new"), action: () => newNoise() },
      { label: t("menu.file.open"), action: onOpenNoise },
      { label: t("menu.file.save"), action: () => saveNoise(false) },
      { label: t("menu.file.saveAs"), action: () => saveNoise(true) },
      { sep: true },
      { label: t("menu.file.close"), action: onCloseNoise },
    ];
  }
  return [
    { label: t("menu.file.new"), action: onNew },
    { label: t("menu.file.open"), action: onOpen },
    { label: t("menu.file.save"), action: () => saveProject() },
    { label: t("menu.file.saveAs"), action: () => saveProjectAs() },
    { sep: true },
    { label: t("menu.file.exportPttune"), action: onExportPttune },
    { label: t("menu.file.exportWav"), action: onExportWav },
    { sep: true },
    { label: t("menu.file.project"), action: () => emit("project") },
    { label: t("menu.file.settings"), action: () => emit("settings") },
    { sep: true },
    { label: t("menu.file.close"), action: onClose },
  ];
});

// 現在モードの undo/redo 可否 (各モードのスナップショットスタックに連動)
const canUndoNow = computed(() => {
  if (mode.value === "voice") {
    const v = voices.value.find((x) => x.id === currentVoiceId.value);
    return v ? v.undoStack.length > 0 : false;
  }
  if (mode.value === "noise") {
    const n = noises.value.find((x) => x.id === currentNoiseId.value);
    return n ? n.undoStack.length > 0 : false;
  }
  return canUndo.value;
});

const canRedoNow = computed(() => {
  if (mode.value === "voice") {
    const v = voices.value.find((x) => x.id === currentVoiceId.value);
    return v ? v.redoStack.length > 0 : false;
  }
  if (mode.value === "noise") {
    const n = noises.value.find((x) => x.id === currentNoiseId.value);
    return n ? n.redoStack.length > 0 : false;
  }
  return canRedo.value;
});

const editMenu = computed<MenuItem[]>(() => {
  if (mode.value === "voice") {
    return [
      { label: t("menu.edit.undo"), action: () => undoVoice(), disabled: !canUndoNow.value },
      { label: t("menu.edit.redo"), action: () => redoVoice(), disabled: !canRedoNow.value },
    ];
  }
  if (mode.value === "noise") {
    return [
      { label: t("menu.edit.undo"), action: () => undoNoise(), disabled: !canUndoNow.value },
      { label: t("menu.edit.redo"), action: () => redoNoise(), disabled: !canRedoNow.value },
    ];
  }
  return [
    { label: t("menu.edit.undo"), action: () => undo(), disabled: !canUndo.value },
    { label: t("menu.edit.redo"), action: () => redo(), disabled: !canRedo.value },
    { sep: true },
    { label: t("menu.edit.copyMeas"), action: () => emit("copyMeas") },
    { label: t("menu.edit.velocity"), action: () => emit("eventVolume", "velocity") },
    { label: t("menu.edit.pantime"), action: () => emit("eventVolume", "pantime") },
    { label: t("menu.edit.panvolume"), action: () => emit("eventVolume", "panvolume") },
    { label: t("menu.edit.volume"), action: () => emit("eventVolume", "volume") },
  ];
});

const viewMenu = computed<MenuItem[]>(() => [
  { label: t("menu.view.showAllUnits"), action: () => setAllUnitsVisible(!allVisible.value), checked: allVisible.value },
  { sep: true },
  {
    label: t("menu.view.zoom"),
    sub: ZOOM_TABLE.map((z) => ({ label: `${z}px`, action: () => (doc.zoom = z), checked: doc.zoom === z })),
  },
  {
    label: t("menu.view.division"),
    sub: DIVI_TABLE.map((d) => ({ label: `${d}`, action: () => (doc.divi = d), checked: doc.divi === d })),
  },
]);

const openItems = computed<MenuItem[]>(() => {
  if (openMenu.value === "file") return fileMenu.value;
  if (openMenu.value === "edit") return editMenu.value;
  if (openMenu.value === "view") return viewMenu.value;
  return [];
});
const tabs = [
  { id: "collage", label: "Collage" },
  { id: "voice", label: "Voice" },
  { id: "noise", label: "Noise" },
] as const;
</script>

<template>
  <div class="menu-bar">
    <div class="mode-tabs">
      <button v-for="t in tabs" :key="t.id" class="mode-tab" :class="{ active: mode === t.id }" @click="mode = t.id">
        {{ t.label }}
      </button>
    </div>
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

/* モードタブ (Collage / Voice / Noise) */
.mode-tabs {
  display: flex;
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
