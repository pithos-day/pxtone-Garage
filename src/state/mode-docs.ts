// アプリのモード (collage / voice / noise) ごとのタブ操作を 1 つの表にまとめる。
// モードで分岐する処理はここを経由し、呼び出し側に分岐を書かない
import type { AppMode } from "../lib/modes";
import { t } from "../i18n";
import { doc } from "./project";
import {
  closeAllProjects,
  closeProject,
  currentProjectId,
  newProjectInTab,
  projects,
  saveProject,
  switchProject,
} from "./projects";
import { closeAllVoices, closeVoice, currentVoiceId, newVoice, saveVoice, switchVoice, voices } from "./voice";
import { closeAllNoises, closeNoise, currentNoiseId, newNoise, noises, saveNoise, switchNoise } from "./noise";
import type { OpenKind } from "./recent-files";

export interface ModeTab {
  id: number;
  title: string;
  dirty: boolean;
  linked: boolean; // 「音色を編集」で開いたタブ (元の Collage 音色と対応)
  readonly: boolean; // pttune 再生専用タブ
}

export interface ModeDocs {
  openKind: OpenKind;
  currentId(): number;
  tabs(): ModeTab[];
  create(): void;
  switchTo(id: number): void;
  close(id: number): void;
  closeAll(): void;
  save(): Promise<boolean>; // 現在のタブを保存する (キャンセル時は false)
}

export const MODE_DOCS: Record<AppMode, ModeDocs> = {
  collage: {
    openKind: "project",
    currentId: () => currentProjectId.value,
    tabs: () =>
      projects.value.map((p) => ({
        id: p.id,
        title: p.fileName || t("common.untitled"),
        // 現在のタブは doc が正本 (p.dirty はタブ切替/退避のときにしか更新されない)
        dirty: p.id === currentProjectId.value ? doc.dirty : p.dirty,
        linked: false,
        readonly: p.kind === "tune",
      })),
    create: () => void newProjectInTab(),
    switchTo: switchProject,
    close: closeProject,
    closeAll: closeAllProjects,
    save: saveProject,
  },
  voice: {
    openKind: "voice",
    currentId: () => currentVoiceId.value,
    tabs: () =>
      voices.value.map((v) => ({
        id: v.id,
        title: v.fileName || t("common.untitled"),
        dirty: v.dirty,
        linked: v.link !== undefined,
        readonly: false,
      })),
    create: () => void newVoice(),
    switchTo: switchVoice,
    close: closeVoice,
    closeAll: closeAllVoices,
    save: () => saveVoice(false),
  },
  noise: {
    openKind: "noise",
    currentId: () => currentNoiseId.value,
    tabs: () =>
      noises.value.map((n) => ({
        id: n.id,
        title: n.fileName || t("common.untitled"),
        dirty: n.dirty,
        linked: n.link !== undefined,
        readonly: false,
      })),
    create: () => void newNoise(),
    switchTo: switchNoise,
    close: closeNoise,
    closeAll: closeAllNoises,
    save: () => saveNoise(false),
  },
};
