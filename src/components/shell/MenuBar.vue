// 上部メニューバー (Blockbench 風)。
// 左: Collage/Voice/Noise のモードタブ (大きめフォント)
// 右: File/Edit/View のドロップダウンメニュー
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { doc, setAllUnitsVisible, exportBytes } from "../../state/project";
import {
  newProjectInTab,
  openProjectInTab,
  closeProject,
  saveProjectFile,
  currentProjectId,
} from "../../state/projects";
import { exportPttune, exportWav, openFileDialog } from "../../engine/io";
import { undo, redo, canUndo, canRedo } from "../../state/undo";
import { ZOOM_TABLE, DIVI_TABLE } from "../../lib/clock";
import { THEMES, theme, setThemeName, setDark } from "../../state/theme";

const mode = defineModel<"collage" | "voice" | "noise">({ required: true });
const emit = defineEmits<{ (e: "project"): void }>();

interface MenuItem {
  label?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  sep?: boolean;
  sub?: MenuItem[];
}

const openMenu = ref<null | "file" | "edit" | "view">(null);
const openSub = ref<number>(-1);

function toggleMenu(name: "file" | "edit" | "view"): void {
  openMenu.value = openMenu.value === name ? null : name;
  openSub.value = -1;
}

function hoverMenu(name: "file" | "edit" | "view"): void {
  if (openMenu.value) {
    openMenu.value = name;
    openSub.value = -1;
  }
}

function run(item: MenuItem): void {
  if (item.disabled) return;
  if (item.sub) return;
  openMenu.value = null;
  openSub.value = -1;
  item.action?.();
}

function onGlobalClick(e: MouseEvent): void {
  if (!(e.target as HTMLElement).closest(".menu-bar")) {
    openMenu.value = null;
    openSub.value = -1;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && openMenu.value) {
    openMenu.value = null;
    openSub.value = -1;
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

// ---- アクション ----

function onNew(): void {
  if (!doc.dirty || window.confirm("未保存の変更は破棄されます。新規作成しますか?")) {
    newProjectInTab();
  }
}

function onOpen(): void {
  void openFileDialog(".ptcop,.pttune").then((bytes) => {
    if (!bytes) return;
    const err = openProjectInTab(bytes);
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
  if (doc.dirty && !window.confirm("未保存の変更は破棄されます。閉じますか?")) return;
  closeProject(id);
}

const allVisible = computed(() => doc.unitVisible.length > 0 && doc.unitVisible.every(Boolean));

const fileMenu = computed<MenuItem[]>(() => [
  { label: "新規作成", action: onNew },
  { label: "開く...", action: onOpen },
  { label: "保存", action: () => saveProjectFile(false) },
  { label: "別名で保存...", action: () => saveProjectFile(true) },
  { sep: true },
  { label: "書き出し (.pttune)", action: onExportPttune },
  { label: "書き出し (WAV)...", action: onExportWav },
  { sep: true },
  { label: "Project...", action: () => emit("project") },
  { sep: true },
  { label: "閉じる", action: onClose },
]);

const editMenu = computed<MenuItem[]>(() => [
  { label: "元に戻す", action: () => undo(), disabled: !canUndo.value },
  { label: "やり直す", action: () => redo(), disabled: !canRedo.value },
]);

const viewMenu = computed<MenuItem[]>(() => [
  { label: "全ユニット表示", action: () => setAllUnitsVisible(!allVisible.value), checked: allVisible.value },
  { sep: true },
  {
    label: "テーマ",
    sub: THEMES.map((t) => ({ label: t.label, action: () => setThemeName(t.id), checked: theme.name === t.id })),
  },
  {
    label: theme.dark ? "ライトモード" : "ダークモード",
    action: () => setDark(!theme.dark),
    checked: !theme.dark,
  },
  { sep: true },
  {
    label: "ズーム",
    sub: ZOOM_TABLE.map((z) => ({ label: `${z}px`, action: () => (doc.zoom = z), checked: doc.zoom === z })),
  },
  {
    label: "分割",
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
        v-for="m in (['file', 'edit', 'view'] as const)"
        :key="m"
        class="menu-label"
        :class="{ open: openMenu === m }"
        @click="toggleMenu(m)"
        @mouseenter="hoverMenu(m)"
      >
        {{ { file: "File", edit: "Edit", view: "View" }[m] }}
      </button>
      <div v-if="openMenu" class="menu-pop">
        <template v-for="(item, i) in openItems" :key="i">
          <div v-if="item.sep" class="menu-sep" />
          <div
            v-else
            class="menu-item"
            :class="{ disabled: item.disabled, 'has-sub': item.sub }"
            @click="run(item)"
            @mouseenter="openSub = item.sub ? i : -1"
          >
            <span class="menu-check">{{ item.checked ? "✓" : "" }}</span>
            <span class="menu-text">{{ item.label }}</span>
            <span v-if="item.sub" class="menu-arrow">▸</span>
            <div v-if="item.sub && openSub === i" class="menu-sub">
              <template v-for="(sub, j) in item.sub" :key="j">
                <div v-if="sub.sep" class="menu-sep" />
                <div v-else class="menu-item" :class="{ disabled: sub.disabled }" @click="run(sub)">
                  <span class="menu-check">{{ sub.checked ? "✓" : "" }}</span>
                  <span class="menu-text">{{ sub.label }}</span>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: stretch;
  height: 36px;
  background: var(--muted);
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
  background: var(--secondary);
  color: var(--foreground);
}

.mode-tab.active {
  background: var(--card);
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
  background: var(--secondary);
  color: var(--foreground);
}

.menu-pop {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 190px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  box-shadow: 2px 2px 10px var(--shadow);
  padding: 3px 0;
  z-index: 100;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--foreground);
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}

.menu-item:hover {
  background: var(--btn-accent-bg);
}

.menu-item.disabled {
  color: var(--muted-foreground);
  cursor: default;
}

.menu-item.disabled:hover {
  background: transparent;
}

.menu-check {
  width: 16px;
  color: var(--primary);
  font-size: 11px;
  flex: none;
}

.menu-text {
  flex: 1;
}

.menu-arrow {
  margin-left: 10px;
  color: var(--muted-foreground);
  font-size: 10px;
}

.menu-sep {
  height: 1px;
  margin: 3px 6px;
  background: var(--border);
}

.menu-sub {
  position: absolute;
  left: 100%;
  top: -4px;
  min-width: 150px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  box-shadow: 2px 2px 10px var(--shadow);
  padding: 3px 0;
}
</style>
