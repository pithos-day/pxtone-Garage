// 未保存ドキュメントの退避 (クラッシュ復旧)。
// ブラウザのタブを強制終了しても、次回起動時に未保存の編集を復元できるよう
// 未保存 (dirty) のドキュメントだけを IndexedDB へ保存する。
// 読み込みは非同期のため、マウント前に loadDrafts を済ませ、restoreDrafts は同期で復元する。
// undo スタックは容量が大きいため保存しない (復元後は新しい編集履歴から始まる)。
import type { AppMode } from "../lib/modes";
import type { Project, WoiceLink } from "./projects";
import { doc } from "./project";
import { readDraftRecord, writeDraftRecord } from "../lib/draft-store";
import { readStorage, removeStorage } from "../lib/storage";
import { appAlert } from "./dialog";
import { t } from "../i18n";
import {
  applyDraftProjectMeta,
  applyDraftProjectState,
  currentProject,
  currentProjectId,
  linkedWoiceIndex,
  woiceLinkAt,
  openProjectInTab,
  persistCurrentProjectState,
  projectDraftSnapshot,
  projects,
  switchProject,
  type ProjectState,
} from "./projects";
import {
  currentVoice,
  currentVoiceId,
  openVoice,
  snapshotVoice,
  switchVoice,
  voices,
} from "./voice";
import {
  currentNoise,
  currentNoiseId,
  openNoise,
  snapshotNoise,
  switchNoise,
  noises,
} from "./noise";
import { forgetSavedRevision } from "../lib/revision";

// 旧形式 (localStorage + base64) のキー。起動時に IndexedDB へ移行する
const LEGACY_STORAGE_KEY = "pxtone-garage-unsaved-drafts-v1";
const SAVE_DELAY_MS = 600;
// IndexedDB が応答しないときに起動を止めないための上限
const LOAD_TIMEOUT_MS = 3000;

interface DraftEntry {
  docId: number; // 復元時のリンク解決に使う元の ID
  name: string;
  bytes: Uint8Array;
  state?: ProjectState; // collage の UI 状態
  measNum?: number; // ptcop に保存されない小節数
  repeatMeas?: number; // ptcop に保存されない Repeat (UI の 1-based)
  linkProjectId?: number; // voice/noise の書き戻し先
  linkWoiceIndex?: number;
}

interface DraftData {
  version: 2;
  activeMode: AppMode;
  current: {
    collage: number | null;
    voice: number | null;
    noise: number | null;
  };
  projects: DraftEntry[];
  voices: DraftEntry[];
  noises: DraftEntry[];
}

// 旧形式のデータ (bytes が base64、version が 1)
type LegacyEntry = Omit<DraftEntry, "bytes"> & { bytes: string };
type LegacyData = Omit<DraftData, "version" | "projects" | "voices" | "noises"> & {
  version: 1;
  projects?: LegacyEntry[];
  voices?: LegacyEntry[];
  noises?: LegacyEntry[];
};

function base64ToBytes(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// 未保存のドキュメントを集める。1 件も無ければ null (保存キーを消す)
function collectDrafts(activeMode: AppMode): DraftData | null {
  persistCurrentProjectState();

  const projectEntries: DraftEntry[] = [];
  for (const p of projects.value) {
    if (!p.dirty) continue;
    const snapshot = projectDraftSnapshot(p);
    if (!snapshot) continue;
    projectEntries.push({
      docId: p.id,
      name: p.fileName,
      bytes: snapshot.bytes,
      // state は reactive の可能性があり、Proxy のままでは IndexedDB へ保存できない
      state: p.state && (JSON.parse(JSON.stringify(p.state)) as ProjectState),
      measNum: snapshot.measNum,
      repeatMeas: snapshot.repeatMeas,
    });
  }

  const voiceEntries: DraftEntry[] = [];
  for (const v of voices.value) {
    if (!v.dirty) continue;
    const bytes = snapshotVoice(v);
    if (!bytes) continue;
    voiceEntries.push({
      docId: v.id,
      name: v.fileName,
      bytes,
      linkProjectId: v.link?.projectId,
      linkWoiceIndex: v.link && linkedWoiceIndex(v.link),
    });
  }

  const noiseEntries: DraftEntry[] = [];
  for (const n of noises.value) {
    if (!n.dirty) continue;
    const bytes = snapshotNoise(n);
    if (!bytes) continue;
    noiseEntries.push({
      docId: n.id,
      name: n.fileName,
      bytes,
      linkProjectId: n.link?.projectId,
      linkWoiceIndex: n.link && linkedWoiceIndex(n.link),
    });
  }

  if (projectEntries.length === 0 && voiceEntries.length === 0 && noiseEntries.length === 0) return null;

  const project = projects.value.find((p) => p.id === currentProjectId.value);
  const voice = voices.value.find((v) => v.id === currentVoiceId.value);
  const noise = noises.value.find((n) => n.id === currentNoiseId.value);
  return {
    version: 2,
    activeMode,
    current: {
      collage: project?.dirty ? project.id : null,
      voice: voice?.dirty ? voice.id : null,
      noise: noise?.dirty ? noise.id : null,
    },
    projects: projectEntries,
    voices: voiceEntries,
    noises: noiseEntries,
  };
}

// 退避に失敗し続けても、通知は失敗が始まったときの 1 回だけにする
let failureNotified = false;
// 起動時に読めなかったレコードは復元の機会が残るよう、未保存が無くても消さない
let storedRecordUnread = false;

// 初期化の間は退避しない (消したデータを書き戻さず、離脱の確認も出さない)
let draftsSuspended = false;

export function setDraftsSuspended(suspended: boolean): void {
  draftsSuspended = suspended;
  if (suspended) cancelDraftSave();
}

function reportSaveFailure(err: unknown): void {
  console.warn("未保存ドラフトを保存できませんでした", err);
  if (failureNotified) return;
  failureNotified = true;
  void appAlert(t("error.draftSave"));
}

// 未保存ドキュメントを即時退避する。beforeunload / タブ非表示 / 自動保存から呼ぶ。
// 退避に失敗しても編集は続けられるが、復旧できないことをユーザーへ知らせる。
// 退避に失敗したときだけ false に解決する
export function saveDraftsNow(activeMode: AppMode): Promise<boolean> {
  if (draftsSuspended) return Promise.resolve(true);
  const data = collectDrafts(activeMode);
  if (!data && storedRecordUnread) return Promise.resolve(true);
  return writeDraftRecord(data)
    .then(() => {
      failureNotified = false;
      storedRecordUnread = false;
      removeStorage(LEGACY_STORAGE_KEY);
      return true;
    })
    .catch((err: unknown) => {
      reportSaveFailure(err);
      return false;
    });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let latestMode: AppMode = "collage";

// 編集の連続中に毎回シリアライズしないよう、少し待ってから退避する
export function scheduleDraftSave(activeMode: AppMode): void {
  latestMode = activeMode;
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveDraftsNow(latestMode);
  }, SAVE_DELAY_MS);
}

// 直近のモードで今すぐ退避する (モードを知らない経路向け)
export function flushDrafts(): Promise<boolean> {
  cancelDraftSave();
  return saveDraftsNow(latestMode);
}

export function cancelDraftSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export function hasUnsavedDocuments(): boolean {
  if (draftsSuspended) return false;
  // 現在のタブは doc が正本 (p.dirty はタブ切替/退避のときにしか更新されない)
  const isProjectDirty = (p: Project) => (p.id === currentProjectId.value ? doc.dirty : p.dirty);
  return projects.value.some(isProjectDirty) || voices.value.some((v) => v.dirty) || noises.value.some((n) => n.dirty);
}

function isDraftData(value: unknown): value is DraftData {
  return (value as DraftData | null)?.version === 2;
}

// 旧形式の文字列を現在の形式へ変換する。壊れていれば null
function parseLegacyDrafts(raw: string): DraftData | null {
  let legacy: LegacyData;
  try {
    legacy = JSON.parse(raw) as LegacyData;
  } catch {
    return null;
  }
  if (legacy?.version !== 1) return null;
  const convert = (entries: LegacyEntry[] = []): DraftEntry[] =>
    entries.flatMap((entry) => {
      const bytes = base64ToBytes(entry.bytes);
      return bytes ? [{ ...entry, bytes }] : [];
    });
  return {
    ...legacy,
    version: 2,
    projects: convert(legacy.projects),
    voices: convert(legacy.voices),
    noises: convert(legacy.noises),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

let loadedDrafts: DraftData | null = null;

// 保存済みドラフトを読み込む。マウント前に 1 回呼ぶ (失敗しても起動は止めない)
export async function loadDrafts(): Promise<void> {
  storedRecordUnread = false;
  let stored: unknown = null;
  try {
    stored = await withTimeout(readDraftRecord(), LOAD_TIMEOUT_MS);
  } catch (err) {
    storedRecordUnread = true;
    console.warn("未保存ドラフトを読み込めませんでした", err);
  }
  const legacyRaw = readStorage(LEGACY_STORAGE_KEY);
  if (isDraftData(stored)) {
    loadedDrafts = stored;
    // 移行後に旧キーの削除だけ失敗した場合の残骸
    if (legacyRaw) removeStorage(LEGACY_STORAGE_KEY);
    return;
  }
  if (!legacyRaw) return;
  const legacy = parseLegacyDrafts(legacyRaw);
  if (!legacy) {
    removeStorage(LEGACY_STORAGE_KEY);
    return;
  }
  loadedDrafts = legacy;
  // 移行先へ書けたときだけ旧キーを消す (失敗時は次回も旧キーから復元できる)
  try {
    await withTimeout(writeDraftRecord(legacy), LOAD_TIMEOUT_MS);
    removeStorage(LEGACY_STORAGE_KEY);
  } catch (err) {
    console.warn("未保存ドラフトを移行できませんでした", err);
  }
}

// 起動時に未保存ドラフトを復元する。復元したアクティブモードを返す (無ければ null)
export function restoreDrafts(): AppMode | null {
  const data = loadedDrafts;
  loadedDrafts = null;
  if (!data) return null;

  // 旧 ID → 新しいタブ ID。voice/noise の書き戻し先 (link) を付け替える
  const projectIdMap = new Map<number, number>();
  const voiceIdMap = new Map<number, number>();
  const noiseIdMap = new Map<number, number>();

  for (const entry of data.projects ?? []) {
    if (openProjectInTab(entry.bytes, entry.name)) continue;
    const p = currentProject();
    if (!p) continue;
    projectIdMap.set(entry.docId, p.id);
    applyDraftProjectMeta(p.id, entry.measNum ?? 0, entry.state?.repeatMeas ?? entry.repeatMeas ?? 0);
    if (entry.state) applyDraftProjectState(p.id, { ...entry.state, dirty: true });
  }

  for (const entry of data.voices ?? []) {
    const link = makeLink(entry, projectIdMap);
    if (openVoice(entry.bytes, entry.name, link)) continue;
    const v = currentVoice();
    if (v) {
      forgetSavedRevision(v.revisions);
      v.dirty = true;
      voiceIdMap.set(entry.docId, v.id);
    }
  }

  for (const entry of data.noises ?? []) {
    const link = makeLink(entry, projectIdMap);
    if (openNoise(entry.bytes, entry.name, link)) continue;
    const n = currentNoise();
    if (n) {
      forgetSavedRevision(n.revisions);
      n.dirty = true;
      noiseIdMap.set(entry.docId, n.id);
    }
  }

  // 保存時のアクティブタブへ戻す (見つからない場合はそのまま)
  const projectId = data.current?.collage != null ? projectIdMap.get(data.current.collage) : undefined;
  if (projectId !== undefined) switchProject(projectId);

  const voiceId = data.current?.voice != null ? voiceIdMap.get(data.current.voice) : undefined;
  if (voiceId !== undefined) switchVoice(voiceId);

  const noiseId = data.current?.noise != null ? noiseIdMap.get(data.current.noise) : undefined;
  if (noiseId !== undefined) switchNoise(noiseId);

  latestMode = data.activeMode ?? latestMode;
  return data.activeMode ?? null;
}

function makeLink(entry: DraftEntry, projectIdMap: Map<number, number>): WoiceLink | undefined {
  if (entry.linkProjectId === undefined) return undefined;
  const projectId = projectIdMap.get(entry.linkProjectId);
  if (projectId === undefined) return undefined;
  return woiceLinkAt(projectId, entry.linkWoiceIndex ?? -1);
}
