// メニューとショートカットから実行するアクション (モード別の File / Edit 操作)
import { computed, type Ref } from "vue";
import { convertMidiToPtcop } from "../engine/midi";
import { exportNoiseWav, exportPttune, exportVoiceWav, openFileDialog, openFilesDialog, readBlobAndApply } from "../engine/io";
import { t } from "../i18n";
import type { ModeMenuOps } from "../lib/menuItems";
import type { AppMode } from "../lib/modes";
import { appAlert, appConfirm } from "../state/dialog";
import { MODE_DOCS } from "../state/mode-docs";
import { currentNoise, markNoiseClean, newNoise, noises, redoNoise, saveNoise, snapshotNoise, undoNoise } from "../state/noise";
import { OPEN_KINDS, openFilesInTabs, type OpenKind } from "../state/open-files";
import { addWoice, doc, exportBytes, WoiceType } from "../state/project";
import {
  applyWoiceLink,
  isTuneProject,
  newProjectInTab,
  openProjectInTab,
  projects,
  saveProject,
  saveProjectAs,
  type WoiceLink,
} from "../state/projects";
import { canRedo, canUndo, redo, undo } from "../state/undo";
import { currentVoice, markVoiceClean, newVoice, redoVoice, saveVoice, snapshotVoice, snapshotVoiceForSave, undoVoice, voices } from "../state/voice";

// タブを閉じる操作は未保存の確認を持つ AppShell へ委譲する
export interface MenuTabRequests {
  requestClose(mode: AppMode, id: number): void;
  requestCloseAll(mode: AppMode): void;
}

export function useMenuActions(mode: Ref<AppMode>, tabs: MenuTabRequests) {
  // pttune 再生専用タブでは保存系・編集系を無効化する
  const tuneReadOnly = computed(() => mode.value === "collage" && isTuneProject());

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

  function onClose(): void {
    const id = MODE_DOCS[mode.value].currentId();
    if (id >= 0) tabs.requestClose(mode.value, id);
  }

  function onCloseAll(): void {
    tabs.requestCloseAll(mode.value);
  }

  // ---- 音色タブ (voice/noise) のアクション ----

  // 音色タブの操作をモードによらず同じ形で扱う (タブが無ければ null)
  interface SoundTab {
    link: WoiceLink | undefined; // 「音色を編集」で開いたタブの書き戻し先
    fileName: string;
    woiceType: WoiceType;
    snapshot(): Uint8Array | null;
    exportWav(): Promise<string | null>;
    markClean(): void;
  }

  function soundTab(soundMode: "voice" | "noise"): SoundTab | null {
    if (soundMode === "voice") {
      const v = currentVoice();
      return (
        v && {
          link: v.link,
          fileName: v.fileName,
          woiceType: WoiceType.PTV,
          // Collage へはファイル保存と同じ形で渡す (編集用に補った面や既定エンベロープを持ち込まない)。
          // 全面が無効で保存形にできない音色は、これまでどおり編集中の形のまま渡す
          snapshot: () => snapshotVoiceForSave(v) ?? snapshotVoice(v),
          exportWav: () => exportVoiceWav(v.woice, v.fileName || "untitled"),
          markClean: markVoiceClean,
        }
      );
    }
    const d = currentNoise();
    return (
      d && {
        link: d.link,
        fileName: d.fileName,
        woiceType: WoiceType.PTN,
        snapshot: () => snapshotNoise(d),
        exportWav: () => exportNoiseWav(d.noise, d.fileName || "untitled"),
        markClean: markNoiseClean,
      }
    );
  }

  // 今のモードの音色タブ (collage では null)
  function activeSoundTab(): SoundTab | null {
    return mode.value === "collage" ? null : soundTab(mode.value);
  }

  function onExportSoundWav(): void {
    void activeSoundTab()
      ?.exportWav()
      .then((err) => {
        if (err) void appAlert(err);
      });
  }

  // 編集中の音色を、現在アクティブな Collage タブのファイルへ音色として追加する。
  // pttune (再生専用) ではメニュー側で disabled にしているが、二重防御でここでも弾く
  function onAddSoundToCollage(): void {
    const tab = activeSoundTab();
    const bytes = tab?.snapshot();
    if (!tab || !bytes || isTuneProject()) return;
    void addWoice(bytes, tab.woiceType, tab.fileName || undefined).then((err) => {
      if (err) void appAlert(err);
    });
  }

  // 編集した音色を、元の Collage プロジェクトの音色へ書き戻す。
  // 適用できたらタブの dirty を解除する (タブの link アイコンも通常色に戻る)
  function onApplyLink(): void {
    const tab = activeSoundTab();
    const bytes = tab?.snapshot();
    if (!tab?.link || !bytes) return;
    const err = applyWoiceLink(tab.link, bytes, tab.woiceType);
    if (err) {
      void appAlert(err);
      return;
    }
    tab.markClean();
  }

  // リンク付き (「音色を編集」で開いた) タブの保存は元の Collage へ適用する。
  // 単独ファイルとして保存する場合は「名前を付けて保存」を使う
  function onSaveSound(soundMode: "voice" | "noise"): void {
    const tab = soundTab(soundMode);
    if (tab?.link) onApplyLink();
    else if (soundMode === "voice") runSave(saveVoice(false));
    else runSave(saveNoise(false));
  }

  // 「音色を編集」で開いたタブの書き戻し先 (通常のオープンでは undefined)
  const currentLink = computed(() => activeSoundTab()?.link);

  // ---- モード別メニュー ----

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
      save: () => onSaveSound("voice"),
      saveAs: () => runSave(saveVoice(true)),
      close: onClose,
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
      save: () => onSaveSound("noise"),
      saveAs: () => runSave(saveNoise(true)),
      close: onClose,
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

  return {
    tuneReadOnly,
    currentLink,
    modeOps,
    activeSoundTab,
    onApplyLink,
    onExportPttune,
    onImportMidi,
    onExportSoundWav,
    onAddSoundToCollage,
  };
}
