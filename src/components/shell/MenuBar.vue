// 上部メニューバー (Blockbench 風)。
// 左: Collage/Voice/Noise のモードタブ (大きめフォント)
// 右: モード別ドロップダウンメニュー (collage = File/Edit/View/Help、voice/noise = File/Edit/Help)
<script setup lang="ts">
import { computed, ref } from "vue";
import { FileUp, FileDown, Music, ListMusic, FileMusic, AudioLines, SlidersHorizontal, SquareStack, CircleGauge, Copy, Columns4, PackagePlus, Link2, Settings, Palette, Keyboard, History, Eraser, AlignHorizontalJustifyStart } from "@lucide/vue";
import { DIVI_TABLE } from "../../lib/clock";
import { doc, setAllUnitsVisible, exportBytes, addWoice, WoiceType } from "../../state/project";
import {
  newProjectInTab,
  openProjectInTab,
  saveProject,
  saveProjectAs,
  isTuneProject,
  currentProjectId,
  applyWoiceLink,
  projects,
} from "../../state/projects";
import { newVoice, saveVoice, closeVoice, undoVoice, redoVoice, currentVoice, currentVoiceId, snapshotVoice, markVoiceClean, voices } from "../../state/voice";
import { newNoise, saveNoise, closeNoise, undoNoise, redoNoise, currentNoise, currentNoiseId, snapshotNoise, markNoiseClean, noises } from "../../state/noise";
import { exportPttune, exportVoiceWav, exportNoiseWav, openFileDialog, openFilesDialog, readBlobAndApply } from "../../engine/io";
import { OPEN_KINDS, openFilesInTabs, openRecentFile, type OpenKind } from "../../state/open-files";
import { clearRecent, recentFiles, supportsRecentFiles } from "../../state/recent-files";
import { convertMidiToPtcop } from "../../engine/midi";
import { undo, redo, canUndo, canRedo } from "../../state/undo";
import { appAlert, appConfirm } from "../../state/dialog";
import { t } from "../../i18n";
import type { EventVolumeMode } from "../../lib/eventVolume";
import type { AppMode } from "../../lib/modes";
import MenuItemRow from "./MenuItemRow.vue";
import {
  buildFileMenu,
  buildEditMenu,
  buildViewMenu,
  buildHelpMenu,
  flattenMenuItems,
  MENU_LABELS,
  menuNamesFor,
  type FeatureEntry,
  type MenuItem,
  type MenuName,
  type ModeMenuOps,
} from "../../lib/menuItems";
import { useDropdownMenu } from "../../composables/useDropdownMenu";
import { useGlobalKeys } from "../../composables/useGlobalKeys";
import { SHORTCUTS, shortcutAreaOf } from "../../lib/shortcuts";
import { shortcutCommand } from "../../state/keybindings";
import { isModalOpen } from "../../state/ui";
import ModeTabs from "./ModeTabs.vue";
import FeatureSearchDialog from "./FeatureSearchDialog.vue";

const mode = defineModel<AppMode>({ required: true });
const emit = defineEmits<{
  (e: "project"): void;
  (e: "settings"): void;
  (e: "keySettings"): void;
  (e: "about"): void;
  (e: "requestClose", mode: AppMode, id: number): void;
  (e: "requestCloseAll", mode: AppMode): void;
  (e: "copyMeas"): void;
  (e: "quantize"): void;
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

async function onNew(): Promise<void> {
  if (doc.dirty && !(await appConfirm(t("confirm.new")))) return;
  newProjectInTab();
}

// 保存系アクション: 書き込み失敗時だけエラー表示 (キャンセルは何もしない)
function runSave(p: Promise<unknown>): void {
  void p.catch(() => void appAlert(t("error.save")));
}

// 「開く」: 選んだファイルをそれぞれ新しいタブで開く
async function onOpenFiles(kind: OpenKind): Promise<void> {
  const { accept, exts } = OPEN_KINDS[kind];
  const files = await openFilesDialog(accept, exts);
  if (files.length > 0) await openFilesInTabs(kind, files);
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
    if (err) void appAlert(err);
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

function onCloseAll(): void {
  emit("requestCloseAll", mode.value);
}

// ---- 音声 (ptVoice) のアクション ----

async function onCloseVoice(): Promise<void> {
  const id = currentVoiceId.value;
  if (currentVoice()?.dirty && !(await appConfirm(t("confirm.close")))) return;
  closeVoice(id);
}

// ---- ノイズ (ptNoise) のアクション ----

async function onCloseNoise(): Promise<void> {
  const id = currentNoiseId.value;
  if (currentNoise()?.dirty && !(await appConfirm(t("confirm.close")))) return;
  closeNoise(id);
}

// ---- WAV 書き出し (voice/noise) ----

function onExportVoiceWav(): void {
  const v = currentVoice();
  if (!v) return;
  void exportVoiceWav(v.woice, v.fileName || "untitled").then((err) => {
    if (err) void appAlert(err);
  });
}

function onExportNoiseWav(): void {
  const d = currentNoise();
  if (!d) return;
  void exportNoiseWav(d.noise, d.fileName || "untitled").then((err) => {
    if (err) void appAlert(err);
  });
}

// ---- Collage への追加 (voice/noise) ----

// 編集中の音色を、現在アクティブな Collage タブのファイルへ音色として追加する。
// pttune (再生専用) ではメニュー側で disabled にしているが、二重防御でここでも弾く
function addToCollage(bytes: Uint8Array | null, type: WoiceType, name: string): void {
  if (!bytes || isTuneProject()) return;
  void addWoice(bytes, type, name || undefined).then((err) => {
    if (err) void appAlert(err);
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

// 「音色を編集」で開いたタブの書き戻し先 (通常のオープンでは undefined)。
// collage では voice/noise のどちらのリンクも使わない
const currentLink = computed(() => {
  if (mode.value === "voice") return currentVoice()?.link;
  if (mode.value === "noise") return currentNoise()?.link;
  return undefined;
});

// 編集した音色を、元の Collage プロジェクトの音色 index へ書き戻す。
// 適用できたらタブの dirty を解除する (タブの link アイコンも通常色に戻る)
function onApplyLink(): void {
  if (mode.value === "voice") {
    const v = currentVoice();
    const bytes = v ? snapshotVoice(v) : null;
    if (!v?.link || !bytes) return;
    const err = applyWoiceLink(v.link, bytes, WoiceType.PTV);
    if (err) {
      void appAlert(err);
      return;
    }
    markVoiceClean();
  } else if (mode.value === "noise") {
    const d = currentNoise();
    const bytes = d ? snapshotNoise(d) : null;
    if (!d?.link || !bytes) return;
    const err = applyWoiceLink(d.link, bytes, WoiceType.PTN);
    if (err) {
      void appAlert(err);
      return;
    }
    markNoiseClean();
  }
}

// リンク付き (「音色を編集」で開いた) タブの保存は元の Collage へ適用する。
// 単独ファイルとして保存する場合は「名前を付けて保存」を使う
function onSaveVoice(): void {
  if (currentVoice()?.link) onApplyLink();
  else runSave(saveVoice(false));
}

function onSaveNoise(): void {
  if (currentNoise()?.link) onApplyLink();
  else runSave(saveNoise(false));
}

// ---- モード別メニュー ----

const allVisible = computed(() => doc.unitVisible.length > 0 && doc.unitVisible.every(Boolean));

// モード別に差し替わる操作 (File メニュー・undo/redo)。3 分岐をこのテーブルに集約
const modeOps: Record<AppMode, ModeMenuOps> = {
  collage: {
    new: onNew,
    open: () => void onOpenFiles("project"),
    save: () => runSave(saveProject()),
    saveAs: () => runSave(saveProjectAs()),
    close: onClose,
    closeAll: onCloseAll,
    undo,
    redo,
    canUndo: () => canUndo.value,
    canRedo: () => canRedo.value,
    canSave: () => !tuneReadOnly.value,
    // タブが 1 つだと閉じられない (closeProject が no-op) ためグレーアウトする
    canClose: () => projects.value.length > 1,
    // 閉じる (最後の 1 つは残す) と同じ条件でグレーアウトする
    canCloseAll: () => projects.value.length > 1,
  },
  voice: {
    new: () => newVoice(),
    open: () => void onOpenFiles("voice"),
    save: onSaveVoice,
    saveAs: () => runSave(saveVoice(true)),
    close: onCloseVoice,
    closeAll: onCloseAll,
    undo: undoVoice,
    redo: redoVoice,
    canUndo: () => (currentVoice()?.undoStack.length ?? 0) > 0,
    canRedo: () => (currentVoice()?.redoStack.length ?? 0) > 0,
    // タブバーの X 表示 (2 つ以上) と揃える
    canClose: () => voices.value.length > 1,
    // 閉じる (最後の 1 つは残す) と同じ条件でグレーアウトする
    canCloseAll: () => voices.value.length > 1,
  },
  noise: {
    new: () => newNoise(),
    open: () => void onOpenFiles("noise"),
    save: onSaveNoise,
    saveAs: () => runSave(saveNoise(true)),
    close: onCloseNoise,
    closeAll: onCloseAll,
    undo: undoNoise,
    redo: redoNoise,
    canUndo: () => (currentNoise()?.undoStack.length ?? 0) > 0,
    canRedo: () => (currentNoise()?.redoStack.length ?? 0) > 0,
    // タブバーの X 表示 (2 つ以上) と揃える
    canClose: () => noises.value.length > 1,
    // 閉じる (最後の 1 つは残す) と同じ条件でグレーアウトする
    canCloseAll: () => noises.value.length > 1,
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

// 「最近使ったファイル」のサブメニュー (非対応ブラウザでは出さない)
function recentMenu(): MenuItem | undefined {
  if (!supportsRecentFiles()) return undefined;
  const kind: OpenKind = mode.value === "collage" ? "project" : mode.value;
  const list = recentFiles.value[kind];
  return {
    label: t("menu.file.recent"),
    icon: History,
    disabled: list.length === 0,
    sub: [
      ...list.map((handle) => ({ label: handle.name, action: () => void openRecentFile(kind, handle) })),
      { sep: true },
      { label: t("menu.file.recentClear"), icon: Eraser, action: () => void clearRecent(kind) },
    ],
  };
}

const fileMenu = computed<MenuItem[]>(() => {
  const ops = modeOps[mode.value];
  // リンク付き音色は「プロジェクトを保存」の位置に「変更を適用」を出す (Ctrl+S も同じ)。
  // リンクなしでは保存項目をそのまま使う
  const saveItem: MenuItem | undefined = currentLink.value
    ? { label: t("menu.file.applyChanges"), icon: Link2, action: onApplyLink, command: "save" }
    : undefined;
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
  return buildFileMenu(ops, extra, saveItem, recentMenu());
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
            { label: t("menu.edit.quantize"), icon: AlignHorizontalJustifyStart, action: () => emit("quantize"), disabled: tuneReadOnly.value },
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

const ISSUES_URL = "https://github.com/pithos-day/pxtone-garage/issues";

const featureSearchOpen = ref(false);

// 現在のモードで使える機能。メニューに無いショートカットは案内として後ろへ並べる
const featureEntries = computed<FeatureEntry[]>(() => {
  const entries = [
    ...flattenMenuItems(fileMenu.value, MENU_LABELS.file),
    ...flattenMenuItems(editMenu.value, MENU_LABELS.edit),
    ...(mode.value === "collage" ? flattenMenuItems(viewMenu.value, MENU_LABELS.view) : []),
  ];
  const inMenu = new Set(entries.map((entry) => entry.command));
  const shortcutsOnly = SHORTCUTS.filter(
    (s) => !inMenu.has(s.command) && (s.area === "app" || mode.value === "collage"),
  ).map((s): FeatureEntry => ({ path: `${t("search.shortcut")} > ${s.action}`, command: s.command }));
  return [...entries, ...shortcutsOnly];
});

const helpMenu = computed<MenuItem[]>(() =>
  buildHelpMenu({
    onSearch: () => (featureSearchOpen.value = true),
    onReportIssue: () => void window.open(ISSUES_URL, "_blank", "noopener"),
    onAbout: () => emit("about"),
  }),
);

const openItems = computed<MenuItem[]>(() => {
  if (openMenu.value === "file") return fileMenu.value;
  if (openMenu.value === "edit") return editMenu.value;
  if (openMenu.value === "view") return viewMenu.value;
  if (openMenu.value === "help") return helpMenu.value;
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
    <div class="app-logo" role="img" aria-label="pxtone Garage"></div>
    <Teleport to="body">
      <FeatureSearchDialog v-if="featureSearchOpen" :entries="featureEntries" @close="featureSearchOpen = false" />
    </Teleport>
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
  /* メニューバーは UI 拡大の対象外 (従来の見た目を維持) */
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

/* メニュー (File / Edit / View / Help) — 左揃え (モードタブの直後) */
.menu-right {
  display: flex;
  position: relative;
}

.menu-label {
  padding: 0 14px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  /* メニューバーは UI 拡大の対象外 (従来の見た目を維持) */
  font-size: 14px;
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

/* ロゴ — SVG をマスクにしてテーマの primary 色で塗る。
   ドット絵が崩れないよう viewBox (77x8) の整数倍 (3 倍) で表示し、
   中央揃えだと小数 px になるので上端は margin で揃える */
.app-logo {
  flex: none;
  align-self: flex-start;
  width: 231px;
  height: 24px;
  margin: 7px 6px 0 auto;
  background: var(--primary);
  -webkit-mask: url("/logo.svg") center / 100% 100% no-repeat;
  mask: url("/logo.svg") center / 100% 100% no-repeat;
}
</style>
