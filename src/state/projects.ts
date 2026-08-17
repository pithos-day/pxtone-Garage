// 複数ファイル (プロジェクト) の管理。
// タブごとに独立した Service / UI 状態 / undo スタックを持ち、
// タブ切替で「現在の doc/service/undo」を差し替える。
import { ref } from "vue";
import { Service, PxtnErr, MemoryIo, PXTN_MAX_EVENT_NUM } from "pxtone-ts";
import { setService } from "./service";
import { setUndoStacks, undoStack, redoStack, type UndoEntry } from "./undo";
import { doc, sync, title, comment, ensureInit, pxtnErrorMessage } from "./project";
import { resetLoaded } from "./player";
import { downloadProjectFile, supportsSavePicker, stripFileExt } from "../engine/io";
import { t } from "../i18n";

export interface ProjectState {
  fileName: string;
  dirty: boolean;
  focusUnit: number;
  selectedUnits: number[];
  scrollX: number;
  scrollYUnit: number;
  scrollYKey: number;
  zoom: number;
  divi: number;
  scope1: number;
  scope2: number;
  volumeVisible: boolean;
  volumeMode: number;
  tool: "pen" | "hand";
  muted: number[];
  unitVisible: boolean[];
  unitPinned: boolean[];
  soloUnit: number;
  soloBackup: number[];
  playStart: number;
  playEnd: number;
  repeatMeas: number;
}

export interface Project {
  id: number;
  fileName: string;
  dirty: boolean;
  state: ProjectState;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  title: string;
  comment: string;
  initial: boolean; // 起動時に自動生成された初期プロジェクトか
}

// doc ↔ ProjectState で保存/復元するフィールド一覧
// (saveCurrent/restore の両方がこのリストを使う)
// 注意: フィールド追加時は ProjectState 型・doc (project.ts)・defaultState() の
// 3 箇所を同期する。STATE_FIELDS に足し忘れるとタブ切替時に値が静かに失われる
// (snapshotState が defaultState の値を黙って保存するため)
const STATE_FIELDS = [
  "fileName",
  "dirty",
  "focusUnit",
  "selectedUnits",
  "scrollX",
  "scrollYUnit",
  "scrollYKey",
  "zoom",
  "divi",
  "scope1",
  "scope2",
  "volumeVisible",
  "volumeMode",
  "tool",
  "muted",
  "unitVisible",
  "unitPinned",
  "soloUnit",
  "soloBackup",
  "playStart",
  "playEnd",
  "repeatMeas",
] as const;

type StateField = (typeof STATE_FIELDS)[number];

// Service は ref に入れると UnwrapRef が private メンバーを落として型が壊れるため、
// リアクティブ外の Map で管理する (現在の service は state/service.ts の setService で差し替え)
const services = new Map<number, Service>();

export const projects = ref<Project[]>([]);
export const currentProjectId = ref(-1);

let nextId = 1;

function defaultState(): ProjectState {
  return {
    fileName: "",
    dirty: false,
    focusUnit: -1,
    selectedUnits: [],
    scrollX: 0,
    scrollYUnit: 0,
    scrollYKey: 0,
    zoom: 48,
    divi: 4,
    scope1: 0,
    scope2: 0,
    volumeVisible: false,
    volumeMode: 0,
    tool: "pen",
    muted: [],
    unitVisible: [],
    unitPinned: [],
    soloUnit: -1,
    soloBackup: [],
    playStart: -1,
    playEnd: -1,
    repeatMeas: 0,
  };
}

export function currentProject(): Project | null {
  return projects.value.find((p) => p.id === currentProjectId.value) ?? null;
}

// doc の編集状態を ProjectState へスナップショット (配列はコピー)
function snapshotState(): ProjectState {
  const st = defaultState();
  const rec = st as Record<StateField, unknown>;
  for (const f of STATE_FIELDS) {
    const v = doc[f];
    rec[f] = Array.isArray(v) ? [...v] : v;
  }
  return st;
}

// ProjectState を doc へ復元 (配列はコピー)
function applyState(st: ProjectState): void {
  for (const f of STATE_FIELDS) {
    const v = st[f];
    (doc as Record<StateField, unknown>)[f] = Array.isArray(v) ? [...v] : v;
  }
}

// 現在の doc/service/undo をプロジェクトに保存する
function saveCurrent(): void {
  const p = currentProject();
  if (!p) return;
  p.fileName = doc.fileName;
  p.dirty = doc.dirty;
  p.title = title.value;
  p.comment = comment.value;
  p.undoStack = undoStack;
  p.redoStack = redoStack;
  p.state = snapshotState();
}

// プロジェクトの状態を doc/service/undo に復元する
function restore(p: Project): void {
  setService(services.get(p.id)!);
  setUndoStacks(p.undoStack, p.redoStack);
  applyState(p.state);
  title.value = p.title;
  comment.value = p.comment;
  sync();
  doc.rev++;
  resetLoaded();
}

export function switchProject(id: number): void {
  if (id === currentProjectId.value) return;
  saveCurrent();
  const p = projects.value.find((x) => x.id === id);
  if (!p) return;
  currentProjectId.value = id;
  restore(p);
}

// 空のプロジェクトを新規タブに追加して切り替える
export function newProjectInTab(): Project {
  ensureInit();
  const svc = new Service();
  if (svc.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) throw new Error("engine init failed");
  const p: Project = {
    id: nextId++,
    fileName: "",
    dirty: false,
    state: defaultState(),
    undoStack: [],
    redoStack: [],
    title: "",
    comment: "",
    initial: false,
  };
  services.set(p.id, svc);
  projects.value.push(p);
  switchProject(p.id);
  return p;
}

// 現在のプロジェクトの内容を UI に再同期する (読み込み後の反映などに使う)
export function refreshCurrent(): void {
  if (!currentProject()) return;
  sync();
  doc.rev++;
  resetLoaded();
}

// 起動時に自動生成された初期プロジェクト (未編集・無題) だけが存在する場合は、
// タブを増やさずそのプロジェクトを置き換えて開く
function replaceInitialProjectIfPossible(): void {
  const cur = currentProject();
  if (projects.value.length === 1 && cur?.initial && !doc.dirty && !doc.fileName) {
    projects.value = [];
    services.delete(cur.id);
    currentProjectId.value = -1;
  }
}

// バイト列を新しいタブで開く。エラーメッセージを返す (成功時 null)。
// name はタブ表示用のファイル名 (拡張子なし) で、空の場合は無題のまま
export function openProjectInTab(bytes: Uint8Array, name?: string): string | null {
  replaceInitialProjectIfPossible();
  const p = newProjectInTab();
  const svc = services.get(p.id)!;
  const res = svc.read(new MemoryIo(bytes));
  if (res !== PxtnErr.OK) {
    closeProject(p.id);
    return pxtnErrorMessage(res);
  }
  if (name) {
    p.fileName = name;
    doc.fileName = name;
  }
  // 読み込んだ内容を doc に反映
  refreshCurrent();
  return null;
}

// タブを閉じる (最後の1つは閉じない)
export function closeProject(id: number): void {
  if (projects.value.length <= 1) return;
  const idx = projects.value.findIndex((p) => p.id === id);
  if (idx < 0) return;
  saveCurrent();
  projects.value.splice(idx, 1);
  services.delete(id);
  if (currentProjectId.value === id) {
    const next = projects.value[Math.min(idx, projects.value.length - 1)]!;
    currentProjectId.value = next.id;
    restore(next);
  }
}

// 通常保存: ダイアログを開かず従来どおりダウンロードを発火する
export async function saveProject(): Promise<boolean> {
  return saveProjectFile(doc.fileName || "untitled", { usePicker: false });
}

// 名前を付けて保存。
// 対応ブラウザではピッカー側でファイル名を決めるため、事前の名前入力 (prompt) は行わない。
// 非対応ブラウザでは従来どおりファイル名入力を促す
export async function saveProjectAs(): Promise<boolean> {
  if (supportsSavePicker()) {
    return saveProjectFile(doc.fileName || "untitled", { usePicker: true });
  }
  const input = window.prompt(t("prompt.fileName"), doc.fileName || "untitled");
  if (input === null) return false;
  return saveProjectFile(input.trim() || "untitled", { usePicker: false });
}

async function saveProjectFile(name: string, options: { usePicker: boolean }): Promise<boolean> {
  const p = currentProject();
  if (!p) return false;
  // ピッカーで名前を変更された場合は、実際に保存されたファイル名を反映する
  // (タブ表示は拡張子なしのため、拡張子を除いて記録する)
  const saved = await downloadProjectFile(name, options);
  if (!saved) return false;
  const displayName = stripFileExt(saved);
  doc.fileName = displayName;
  p.fileName = displayName;
  doc.dirty = false;
  p.dirty = false;
  return true;
}

// アプリ起動時に1つ目のプロジェクトを作る (doc.ready 済みなら何もしない)
export function ensureInitialProject(): void {
  if (projects.value.length === 0) {
    ensureInit();
    const p = newProjectInTab();
    p.initial = true;
  }
}

