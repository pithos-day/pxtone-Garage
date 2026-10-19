// 未保存ドキュメントの退避 (クラッシュ復旧)。
// ブラウザのタブを強制終了しても、次回起動時に未保存の編集を復元できるよう
// 未保存 (dirty) のドキュメントだけを localStorage へ保存する。
// undo スタックは容量が大きいため保存しない (復元後は新しい編集履歴から始まる)。
import type { AppMode } from "../lib/modes";
import type { WoiceLink } from "./projects";
import { readStorage, removeStorage, tryWriteStorage } from "../lib/storage";
import {
  applyDraftProjectMeta,
  applyDraftProjectState,
  currentProject,
  currentProjectId,
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

const STORAGE_KEY = "pxtone-garage-unsaved-drafts-v1";
const SAVE_DELAY_MS = 600;

interface DraftEntry {
  docId: number; // 復元時のリンク解決に使う元の ID
  name: string;
  bytes: string; // base64
  state?: ProjectState; // collage の UI 状態
  measNum?: number; // ptcop に保存されない小節数
  repeatMeas?: number; // ptcop に保存されない Repeat (UI の 1-based)
  linkProjectId?: number; // voice/noise の書き戻し先
  linkWoiceIndex?: number;
}

interface DraftData {
  version: 1;
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
      bytes: bytesToBase64(snapshot.bytes),
      state: p.state,
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
      bytes: bytesToBase64(bytes),
      linkProjectId: v.link?.projectId,
      linkWoiceIndex: v.link?.woiceIndex,
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
      bytes: bytesToBase64(bytes),
      linkProjectId: n.link?.projectId,
      linkWoiceIndex: n.link?.woiceIndex,
    });
  }

  if (projectEntries.length === 0 && voiceEntries.length === 0 && noiseEntries.length === 0) return null;

  const project = projects.value.find((p) => p.id === currentProjectId.value);
  const voice = voices.value.find((v) => v.id === currentVoiceId.value);
  const noise = noises.value.find((n) => n.id === currentNoiseId.value);
  return {
    version: 1,
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

// 未保存ドキュメントを即時退避する。beforeunload / タブ非表示 / 自動保存から呼ぶ
export function saveDraftsNow(activeMode: AppMode): void {
  const data = collectDrafts(activeMode);
  if (!data) {
    removeStorage(STORAGE_KEY);
    return;
  }
  if (!tryWriteStorage(STORAGE_KEY, JSON.stringify(data))) {
    // 容量超過など。復旧できないが、編集中のアプリ自体は続行させる
    console.warn("未保存ドラフトを保存できませんでした (localStorage の容量不足)");
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let latestMode: AppMode = "collage";

// 編集の連続中に毎回シリアライズしないよう、少し待ってから退避する
export function scheduleDraftSave(activeMode: AppMode): void {
  latestMode = activeMode;
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveDraftsNow(latestMode);
  }, SAVE_DELAY_MS);
}

export function cancelDraftSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export function hasUnsavedDocuments(): boolean {
  return projects.value.some((p) => p.dirty) || voices.value.some((v) => v.dirty) || noises.value.some((n) => n.dirty);
}

// 起動時に未保存ドラフトを復元する。復元したアクティブモードを返す (無ければ null)
export function restoreDrafts(): AppMode | null {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return null;

  let data: DraftData;
  try {
    data = JSON.parse(raw) as DraftData;
  } catch {
    removeStorage(STORAGE_KEY);
    return null;
  }
  if (data?.version !== 1) {
    removeStorage(STORAGE_KEY);
    return null;
  }

  // 旧 ID → 新しいタブ ID。voice/noise の書き戻し先 (link) を付け替える
  const projectIdMap = new Map<number, number>();
  const voiceIdMap = new Map<number, number>();
  const noiseIdMap = new Map<number, number>();

  for (const entry of data.projects ?? []) {
    const bytes = base64ToBytes(entry.bytes);
    if (!bytes) continue;
    if (openProjectInTab(bytes, entry.name)) continue;
    const p = currentProject();
    if (!p) continue;
    projectIdMap.set(entry.docId, p.id);
    applyDraftProjectMeta(p.id, entry.measNum ?? 0, entry.state?.repeatMeas ?? entry.repeatMeas ?? 0);
    if (entry.state) applyDraftProjectState(p.id, { ...entry.state, dirty: true });
  }

  for (const entry of data.voices ?? []) {
    const bytes = base64ToBytes(entry.bytes);
    if (!bytes) continue;
    const link = makeLink(entry, projectIdMap);
    if (openVoice(bytes, entry.name, link)) continue;
    const v = currentVoice();
    if (v) {
      v.dirty = true;
      voiceIdMap.set(entry.docId, v.id);
    }
  }

  for (const entry of data.noises ?? []) {
    const bytes = base64ToBytes(entry.bytes);
    if (!bytes) continue;
    const link = makeLink(entry, projectIdMap);
    if (openNoise(bytes, entry.name, link)) continue;
    const n = currentNoise();
    if (n) {
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

  return data.activeMode ?? null;
}

function makeLink(entry: DraftEntry, projectIdMap: Map<number, number>): WoiceLink | undefined {
  if (entry.linkProjectId === undefined) return undefined;
  const projectId = projectIdMap.get(entry.linkProjectId);
  if (projectId === undefined) return undefined;
  return { projectId, woiceIndex: entry.linkWoiceIndex ?? -1 };
}
