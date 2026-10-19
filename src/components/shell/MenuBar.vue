// 上部メニューバー (Blockbench 風)。
// 左: Collage/Voice/Noise のモードタブ (大きめフォント)
// 右: モード別ドロップダウンメニュー (collage = File/Edit/View、voice/noise = File/Edit)
<script setup lang="ts">
import { computed } from "vue";
import { FileUp, FileDown, Music, ListMusic, FileMusic, AudioLines, SlidersHorizontal, SquareStack, CircleGauge, Copy, Columns4, PackagePlus, Link2, Settings, Palette, Keyboard } from "@lucide/vue";
import { DIVI_TABLE } from "../../lib/clock";
import { doc, setAllUnitsVisible, exportBytes, addWoice, WoiceType } from "../../state/project";
import {
  newProjectInTab,
  openProjectInTab,
  openProjectFromBlob,
  saveProject,
  saveProjectAs,
  isTuneProject,
  currentProjectId,
  applyWoiceLink,
  projects,
} from "../../state/projects";
import { newVoice, openVoice, saveVoice, closeVoice, undoVoice, redoVoice, currentVoice, currentVoiceId, snapshotVoice, markVoiceClean, voices } from "../../state/voice";
import { newNoise, openNoise, saveNoise, closeNoise, undoNoise, redoNoise, currentNoise, currentNoiseId, snapshotNoise, markNoiseClean, noises } from "../../state/noise";
import { exportPttune, exportVoiceWav, exportNoiseWav, openFileDialog, readBlobAndApply } from "../../engine/io";
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
import { useGlobalKeys } from "../../composables/useGlobalKeys";
import { shortcutAreaOf } from "../../lib/shortcuts";
import { shortcutCommand } from "../../state/keybindings";
import { isModalOpen } from "../../state/ui";
import ModeTabs from "./ModeTabs.vue";

const mode = defineModel<AppMode>({ required: true });
const emit = defineEmits<{
  (e: "project"): void;
  (e: "settings"): void;
  (e: "keySettings"): void;
  (e: "requestClose", mode: AppMode, id: number): void;
  (e: "copyMeas"): void;
  (e: "eventVolume", kind: EventVolumeMode): void;
  (e: "exportWav"): void;
  (e: "voiceCopyAB"): void;
  (e: "voiceCopyBA"): void;
}>();

// ドロップダウンの開閉管理 (メニュー外クリック / Escape で閉じる)
const { openMenu, openSubIndex, toggleMenu, hoverMenu, close } = useDropdownMenu<MenuName>();

// モード別のトップメニュー (表示ラベルと順序は lib/menuItems で定義)
const menuNames = computed<MenuName[]>(() => menuNamesFor(mode.value));

// pttune 再生専用タブでは保存系・編集系を無効化する
const tuneReadOnly = computed(() => mode.value === "collage" && isTuneProject());

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
  void openFileDialog(".ptcop,.pttune").then(async (opened) => {
    if (!opened) return;
    const err = await openProjectFromBlob(opened.file, opened.name);
    if (err) window.alert(err);
  });
}

function onExportPttune(): void {
  // tune タブからの再書き出しは二重量子化で壊れるため禁止 (メニュー側でも disabled)
  if (isTuneProject()) return;
  const bytes = exportBytes();
  if (bytes) runSave(exportPttune(bytes, doc.fileName || "untitled"));
}

// MIDI ファイルを選択して ptcop として読み込む (split = 和音を別ユニットに分割)
function onImportMidi(split: boolean): void {
  void openFileDialog(".mid,.midi", /\.midi?$/i).then(async (opened) => {
    if (!opened) return;
    // 読み込み (実進捗) → MIDI 変換 (不定) → タブで開く
    const err = await readBlobAndApply(
      t("progress.midiTitle"),
      opened.file,
      (bytes) => {
        const ptcop = convertMidiToPtcop(bytes, split ? { splitOverlap: true } : {});
        if (!ptcop) return t("error.midi");
        return openProjectInTab(ptcop, opened.name);
      },
      { apply: t("progress.midiConvert") },
    );
    if (err) window.alert(err);
  });
}

function onExportWav(): void {
  // 音質・ビルド範囲などのオプションを設定するダイアログを開く
  // (実際の書き出しは AppShell の WavExportDialog が行う)
  emit("exportWav");
}

function onClose(): void {
  const id =
    mode.value === "collage"
      ? currentProjectId.value
      : mode.value === "voice"
        ? currentVoiceId.value
        : currentNoiseId.value;
  if (id >= 0) emit("requestClose", mode.value, id);
}

// ---- 音声 (ptVoice) のアクション ----

function onOpenVoice(): void {
  void openFileDialog(".ptvoice", /\.ptvoice$/i).then(async (opened) => {
    if (!opened) return;
    const err = await readBlobAndApply(t("progress.openTitle"), opened.file, (bytes) => openVoice(bytes, opened.name));
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
  void openFileDialog(".ptnoise", /\.ptnoise$/i).then(async (opened) => {
    if (!opened) return;
    const err = await readBlobAndApply(t("progress.openTitle"), opened.file, (bytes) => openNoise(bytes, opened.name));
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

// ---- Collage への追加 (voice/noise) ----

// 編集中の音色を、現在アクティブな Collage タブのファイルへ音色として追加する。
// pttune (再生専用) ではメニュー側で disabled にしているが、二重防御でここでも弾く
function addToCollage(bytes: Uint8Array | null, type: WoiceType, name: string): void {
  if (!bytes || isTuneProject()) return;
  void addWoice(bytes, type, name || undefined).then((err) => {
    if (err) window.alert(err);
  });
}

function onAddVoiceToCollage(): void {
  const v = currentVoice();
  if (!v) return;
  addToCollage(snapshotVoice(v), WoiceType.PTV, v.fileName);
}

function onAddNoiseToCollage(): void {
  const d = currentNoise();
  if (!d) return;
  addToCollage(snapshotNoise(d), WoiceType.PTN, d.fileName);
}

// ---- 変更を適用 (「音色を編集」で開いた voice/noise) ----

// 「音色を編集」で開いたタブの書き戻し先 (通常のオープンでは undefined)
const currentLink = computed(() => (mode.value === "voice" ? currentVoice()?.link : currentNoise()?.link));

// 編集した音色を、元の Collage プロジェクトの音色 index へ書き戻す。
// 適用できたらタブの dirty を解除する (タブの link アイコンも通常色に戻る)
function onApplyLink(): void {
  if (mode.value === "voice") {
    const v = currentVoice();
    const bytes = v ? snapshotVoice(v) : null;
    if (!v?.link || !bytes) return;
    const err = applyWoiceLink(v.link, bytes, WoiceType.PTV);
    if (err) {
      window.alert(err);
      return;
    }
    markVoiceClean();
  } else if (mode.value === "noise") {
    const d = currentNoise();
    const bytes = d ? snapshotNoise(d) : null;
    if (!d?.link || !bytes) return;
    const err = applyWoiceLink(d.link, bytes, WoiceType.PTN);
    if (err) {
      window.alert(err);
      return;
    }
    markNoiseClean();
  }
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
    canSave: () => !tuneReadOnly.value,
    // タブが 1 つだと閉じられない (closeProject が no-op) ためグレーアウトする
    canClose: () => projects.value.length > 1,
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
    // タブバーの X 表示 (2 つ以上) と揃える
    canClose: () => voices.value.length > 1,
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
    // タブバーの X 表示 (2 つ以上) と揃える
    canClose: () => noises.value.length > 1,
  },
};

// ---- キーボードショートカット (3 タブ共通のコマンド) ----
// 保存 / 名前を付けて保存 / undo / redo はモード別の ops を使うため、モードを
// 知っているここで受ける。collage 担当コマンドは CollageEditor が実行する

// 保存可否 (canSave 未指定は保存可。pttune 再生専用タブは false)
function canSaveNow(): boolean {
  const can = modeOps[mode.value].canSave;
  return !can || can();
}

function onShortcut(e: KeyboardEvent): void {
  const cmd = shortcutCommand(e, { readOnly: false, clipReady: false, modalOpen: isModalOpen() });
  if (!cmd || shortcutAreaOf(cmd) !== "app") return;
  e.preventDefault();
  const ops = modeOps[mode.value];
  switch (cmd) {
    case "undo":
      ops.undo();
      return;
    case "redo":
      ops.redo();
      return;
    case "save":
      if (canSaveNow()) ops.save();
      return;
    case "saveAs":
      if (canSaveNow()) ops.saveAs();
      return;
    default:
      return; // collage 担当 (スコープ操作・スクロール等) は CollageEditor が実行する
  }
}

useGlobalKeys(() => true, { keydown: onShortcut });

const fileMenu = computed<MenuItem[]>(() => {
  const ops = modeOps[mode.value];
  // 「変更を適用」は「音色を編集」で開いたタブのみ有効 (collage では出さない)。
  // buildFileMenu で保存系の手前に差し込む
  const beforeSave: MenuItem[] =
    mode.value === "collage"
      ? []
      : [
          {
            label: t("menu.file.applyChanges"),
            icon: Link2,
            action: onApplyLink,
            disabled: !currentLink.value,
          },
        ];
  // 環境設定はフォルダのようにサブメニュー化する (外観設定 / キー設定)
  const settingsFolder: MenuItem = {
    label: t("menu.file.settings"),
    icon: Settings,
    sub: [
      { label: t("menu.file.appearance"), icon: Palette, action: () => emit("settings") },
      { label: t("menu.file.keys"), icon: Keyboard, action: () => emit("keySettings") },
    ],
  };
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
              { label: t("menu.file.exportPttune"), icon: FileMusic, action: onExportPttune, disabled: tuneReadOnly.value },
              { label: t("menu.file.exportWav"), icon: AudioLines, action: onExportWav },
            ],
          },
          { sep: true },
          { label: t("menu.file.project"), icon: SlidersHorizontal, action: () => emit("project") },
          settingsFolder,
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
          // 編集中の音色を、現在アクティブな Collage タブへ追加する。
          // pttune (再生専用) タブでは追加できないためグレーアウトする
          {
            label: t("menu.file.addToCollage"),
            icon: PackagePlus,
            action: mode.value === "voice" ? onAddVoiceToCollage : onAddNoiseToCollage,
            disabled: isTuneProject() || (mode.value === "voice" ? !currentVoice() : !currentNoise()),
          },
          { sep: true },
          settingsFolder,
          { sep: true },
        ];
  return buildFileMenu(ops, extra, beforeSave);
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
            {
              label: t("menu.edit.gridSnap"),
              icon: Columns4,
              disabled: tuneReadOnly.value,
              sub: DIVI_TABLE.map((d) => ({
                label: d === 1 ? "1" : `1/${d}`,
                action: () => (doc.divi = d),
                checked: doc.divi === d,
              })),
            },
            { label: t("menu.edit.copyMeas"), icon: SquareStack, action: () => emit("copyMeas"), disabled: tuneReadOnly.value },
            { sep: true},
            { label: t("menu.edit.velocity"), icon: CircleGauge, action: () => emit("eventVolume", "velocity"), disabled: tuneReadOnly.value },
            { label: t("menu.edit.pantime"), icon: CircleGauge, action: () => emit("eventVolume", "pantime"), disabled: tuneReadOnly.value },
            { label: t("menu.edit.panvolume"), icon: CircleGauge, action: () => emit("eventVolume", "panvolume"), disabled: tuneReadOnly.value },
            { label: t("menu.edit.volume"), icon: CircleGauge, action: () => emit("eventVolume", "volume"), disabled: tuneReadOnly.value },
          ]
        : [];
  return buildEditMenu(ops, extra);
});

const viewMenu = computed<MenuItem[]>(() =>
  buildViewMenu({
    allVisible: allVisible.value,
    zoom: doc.zoom,
    onToggleAll: () => setAllUnitsVisible(!allVisible.value),
    onZoom: (z) => (doc.zoom = z),
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
