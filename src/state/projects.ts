// 複数ファイル (プロジェクト) の管理。
// タブごとに独立した Service / UI 状態 / undo スタックを持ち、
// タブ切替で「現在の doc/service/undo」を差し替える。
import { ref } from "vue";
import { Service, PxtnErr, MemoryIo, PXTN_MAX_EVENT_NUM, Woice, WoiceType } from "pxtone-ts";
import { setService } from "./service";
import { setUndoStacks, undoStack, redoStack, snapshotService, pushUndoToStack, refreshUndoFlags, type UndoEntry } from "./undo";
import { doc, sync, title, comment, ensureInit, pxtnErrorMessage, exportBytes, uiRepeatToFile } from "./project";
import { resetLoaded } from "./player";
import {
  chooseSaveDestination,
  readBlobAndApply,
  sanitizeFileName,
  stripFileExt,
  isTuneFormat,
  supportsSavePicker,
  toArrayBuffer,
  writeSaveDestination,
  type BlobLike,
} from "../engine/io";
import { withProgress } from "./progress";
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
  tool: "pen" | "hand" | "smart";
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
  kind: "ptcop" | "tune"; // ファイル形式 (ptcop=編集可、tune=再生専用)
  tuneBytes: ArrayBuffer | null; // tune 形式の元バイト列 (再生用)
}

// 「音色を編集」で開いた Voice/Noise タブと、元の Collage 音色の対応。
// 適用 (変更を適用) 時にこの情報で書き戻し先を決める
export interface WoiceLink {
  projectId: number; // 元の Collage プロジェクト (Project.id)
  woiceIndex: number; // 元の音色 index
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
    tool: "smart",
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
  doc.readOnly = p.kind === "tune";
  sync();
  doc.rev++;
  resetLoaded();
}

// 現在の doc 状態を現在のプロジェクトへ書き戻す。
// 未保存ドラフトの退避前に呼ぶ (タブ切替時にしか更新されないため)
export function persistCurrentProjectState(): void {
  saveCurrent();
}

// 未保存ドラフト用のスナップショット。
// ptcop の write/read は measNum・repeatMeas を保持しないため、バイト列と一緒に持つ
export function projectDraftSnapshot(p: Project): UndoEntry | null {
  const svc = services.get(p.id);
  return svc ? snapshotService(svc) : null;
}

// ドラフトの measNum / Repeat をエンジンへ戻す (openProjectInTab の直後に呼ぶ)
export function applyDraftProjectMeta(id: number, measNum: number, repeatMeasUi: number): void {
  const svc = services.get(id);
  if (!svc) return;
  if (Number.isFinite(measNum) && measNum > 0) svc.master.setMeasNum(measNum);
  if (Number.isFinite(repeatMeasUi) && repeatMeasUi >= 0) svc.master.setRepeatMeas(uiRepeatToFile(repeatMeasUi));
  if (id === currentProjectId.value) {
    sync();
    doc.rev++;
  }
}

// ドラフトから復元した状態をプロジェクトへ適用する。
// 現在のタブなら doc にも反映し、次回のタブ切替で上書きされないようにする
export function applyDraftProjectState(id: number, state: ProjectState): void {
  const p = projects.value.find((x) => x.id === id);
  if (!p) return;
  p.state = state;
  p.dirty = state.dirty;
  if (id === currentProjectId.value) {
    applyState(state);
    sync();
    doc.rev++;
  }
}

export function switchProject(id: number): void {
  if (id === currentProjectId.value) return;
  saveCurrent();
  const p = projects.value.find((x) => x.id === id);
  if (!p) return;
  currentProjectId.value = id;
  restore(p);
}

// 空のプロジェクトを新規タブに追加して切り替える。
// kind=tune の場合は非編集 Service (init) で作る (beatClock 制限なし・再生専用)
export function newProjectInTab(kind: "ptcop" | "tune" = "ptcop"): Project {
  ensureInit();
  const svc = new Service();
  const err = kind === "tune" ? svc.init() : svc.initCollage(PXTN_MAX_EVENT_NUM);
  if (err !== PxtnErr.OK) throw new Error("engine init failed");
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
    kind,
    tuneBytes: null,
  };
  services.set(p.id, svc);
  projects.value.push(p);
  switchProject(p.id);
  return p;
}

// 現在のプロジェクトの内容を UI に再同期する (読み込み後の反映などに使う)
export function refreshCurrent(): void {
  const p = currentProject();
  if (!p) return;
  doc.readOnly = p.kind === "tune";
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
  const isTune = isTuneFormat(bytes);
  // tune は非編集 Service でタブを作る (initCollage 済み Service への init() 再呼び出しは不可のため)
  const p = newProjectInTab(isTune ? "tune" : "ptcop");
  const svc = services.get(p.id)!;

  // pttune は beatClock≠480 でも DENY にならない
  const res = svc.read(new MemoryIo(bytes));
  if (res !== PxtnErr.OK) {
    closeProject(p.id);
    return pxtnErrorMessage(res);
  }
  // tune は再シリアライズできないため、元バイト列を保持して再生に使う
  if (isTune) p.tuneBytes = toArrayBuffer(bytes);

  if (name) {
    p.fileName = name;
    doc.fileName = name;
  }
  // 読み込んだ内容を doc に反映
  refreshCurrent();
  return null;
}

// ファイル (Blob) から読み込んでタブで開く (進捗つき・キャンセル可)。
// 読み込みはバイト数の実進捗、解析は不定表示。
// 解析の直前にキャンセルを確認するため、中断時に半端なタブは残らない。
// 戻り値はエラーメッセージ (キャンセル・成功時 null)
export async function openProjectFromBlob(file: BlobLike, name: string): Promise<string | null> {
  return readBlobAndApply(t("progress.openTitle"), file, (bytes) => openProjectInTab(bytes, name));
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

// 現在のプロジェクトが pttune 形式 (再生専用) か
export function isTuneProject(): boolean {
  return currentProject()?.kind === "tune";
}

// 「変更を適用」: リンク付き Voice/Noise タブの編集内容を、元の Collage プロジェクトの
// 音色 index へ書き戻す。適用先は現在のタブとは限らないため、対象プロジェクトの
// Service / undo スタックを直接操作する。エラーメッセージを返す (成功時 null)。
// 音色名は元のまま (エディタは名前を編集しないため)
export function applyWoiceLink(link: WoiceLink, bytes: Uint8Array, type: WoiceType): string | null {
  const p = projects.value.find((x) => x.id === link.projectId);
  const svc = p ? services.get(p.id) : undefined;
  if (!p || !svc) return t("error.applyNoProject");
  // pttune (再生専用) は書き換え対象にできない
  if (p.kind === "tune") return t("error.applyReadOnly");
  if (link.woiceIndex < 0 || link.woiceIndex >= svc.woiceNum) return t("error.applyNoWoice");
  // woiceRead は読み込み失敗時に既存音色を削除するため、先にバイト列を検証する
  const probe = new Woice();
  if (probe.read(new MemoryIo(bytes), type) !== PxtnErr.OK) return t("error.format");
  // undo は適用先プロジェクトのスタックへ積む (現在のタブのスタックではない)
  const snap = snapshotService(svc);
  if (snap) pushUndoToStack(p.undoStack, p.redoStack, snap);
  const res = svc.woiceRead(link.woiceIndex, new MemoryIo(bytes), type);
  if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
  p.dirty = true;
  // 適用先が現在のタブなら、UI ミラー (W トレイ等) と undo 表示も更新する
  if (p.id === currentProjectId.value) {
    refreshUndoFlags();
    doc.dirty = true;
    sync();
    doc.rev++;
  }
  return null;
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
  // tune 再生専用タブは保存不可 (非編集 Service の再シリアライズは壊れた ptcop になるため)
  if (p.kind === "tune") return false;
  // 生成より先に保存先を決める (ピッカーはユーザー操作が必要なため)
  const dest = await chooseSaveDestination(sanitizeFileName(name, ".ptcop"), "application/octet-stream", options.usePicker);
  if (!dest) return false; // ピッカーを閉じた
  const saved = await withProgress(t("progress.saveTitle"), async (task) => {
    task.step(t("progress.serializing"));
    const bytes = exportBytes();
    if (!bytes) return null;
    task.range(0.2, 1, t("progress.writing"));
    await writeSaveDestination(dest, bytes, { task });
    return dest.name;
  });
  if (!saved) return false; // キャンセル
  // ピッカーで名前を変更された場合は、実際に保存されたファイル名を反映する
  // (タブ表示は拡張子なしのため、拡張子を除いて記録する)
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

