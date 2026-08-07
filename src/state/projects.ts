// 複数ファイル (プロジェクト) の管理。
// タブごとに独立した Service / UI 状態 / undo スタックを持ち、
// タブ切替で「現在の doc/service/undo」を差し替える。
import { ref } from "vue";
import { Service, PxtnErr, MemoryIo, PXTN_MAX_EVENT_NUM } from "pxtone-ts";
import { setService } from "./service";
import { setUndoStacks, undoStack, redoStack } from "./undo";
import { doc, sync, title, comment, ensureInit, pxtnErrorMessage } from "./project";
import { resetLoaded } from "./player";
import { saveProject as downloadProject } from "../engine/io";

export interface ProjectState {
  fileName: string;
  dirty: boolean;
  focusUnit: number;
  operated: number[];
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
}

export interface Project {
  id: number;
  fileName: string;
  dirty: boolean;
  state: ProjectState;
  undoStack: Uint8Array[];
  redoStack: Uint8Array[];
  title: string;
  comment: string;
}

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
    operated: [],
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
  };
}

export function currentProject(): Project | null {
  return projects.value.find((p) => p.id === currentProjectId.value) ?? null;
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
  p.state = {
    fileName: doc.fileName,
    dirty: doc.dirty,
    focusUnit: doc.focusUnit,
    operated: [...doc.operated],
    scrollX: doc.scrollX,
    scrollYUnit: doc.scrollYUnit,
    scrollYKey: doc.scrollYKey,
    zoom: doc.zoom,
    divi: doc.divi,
    scope1: doc.scope1,
    scope2: doc.scope2,
    volumeVisible: doc.volumeVisible,
    volumeMode: doc.volumeMode,
    tool: doc.tool,
    muted: [...doc.muted],
    unitVisible: [...doc.unitVisible],
    unitPinned: [...doc.unitPinned],
  };
}

// プロジェクトの状態を doc/service/undo に復元する
function restore(p: Project): void {
  setService(services.get(p.id)!);
  setUndoStacks(p.undoStack, p.redoStack);
  const st = p.state;
  doc.fileName = st.fileName;
  doc.dirty = st.dirty;
  doc.focusUnit = st.focusUnit;
  doc.operated = [...st.operated];
  doc.scrollX = st.scrollX;
  doc.scrollYUnit = st.scrollYUnit;
  doc.scrollYKey = st.scrollYKey;
  doc.zoom = st.zoom;
  doc.divi = st.divi;
  doc.scope1 = st.scope1;
  doc.scope2 = st.scope2;
  doc.volumeVisible = st.volumeVisible;
  doc.volumeMode = st.volumeMode;
  doc.tool = st.tool;
  doc.muted = [...st.muted];
  doc.unitVisible = [...st.unitVisible];
  doc.unitPinned = [...st.unitPinned];
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

// バイト列を新しいタブで開く。エラーメッセージを返す (成功時 null)
export function openProjectInTab(bytes: Uint8Array): string | null {
  const p = newProjectInTab();
  const svc = services.get(p.id)!;
  const res = svc.read(new MemoryIo(bytes));
  if (res !== PxtnErr.OK) {
    closeProject(p.id);
    return pxtnErrorMessage(res);
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

// 現在のプロジェクトを ptcop として保存 (asNew でファイル名入力を促す)
export function saveProjectFile(asNew: boolean): boolean {
  const p = currentProject();
  if (!p) return false;
  let name = doc.fileName || "untitled";
  if (asNew) {
    const input = window.prompt("ファイル名を入力してください", name);
    if (input === null) return false;
    name = input.trim() || "untitled";
  }
  if (!downloadProject(name)) return false;
  doc.fileName = name;
  p.fileName = name;
  doc.dirty = false;
  p.dirty = false;
  return true;
}

// アプリ起動時に1つ目のプロジェクトを作る (doc.ready 済みなら何もしない)
export function ensureInitialProject(): void {
  if (projects.value.length === 0) {
    ensureInit();
    newProjectInTab();
  }
}

