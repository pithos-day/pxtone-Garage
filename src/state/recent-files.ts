// 最近使ったファイルの一覧。ブラウザから開き直すには FileSystemFileHandle が必要なので、
// 中身は保存せずハンドルだけを IndexedDB に保存する (structured clone で保存できる)。
// File System Access API は Chromium 系のみのため、非対応ブラウザではメニューに出さない。
// IndexedDB が使えない / 失敗した場合はこのセッションの間だけ覚える
import { shallowRef } from "vue";
import { dropRecent, pushRecent } from "../lib/recent-list";

// タブで開けるファイルの種別 (種別ごとに別の一覧を持つ)
export type OpenKind = "project" | "voice" | "noise";

type RecentLists = Record<OpenKind, FileSystemFileHandle[]>;

export const RECENT_FILES_DB_NAME = "pxtone-garage";
const STORE = "recent-files";
const OPEN_KIND_NAMES: readonly OpenKind[] = ["project", "voice", "noise"];

// ハンドルは reactive proxy にすると IndexedDB へ保存できないため shallowRef で持つ
export const recentFiles = shallowRef<RecentLists>({ project: [], voice: [], noise: [] });

export function supportsRecentFiles(): boolean {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECENT_FILES_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persist(kind: OpenKind, list: FileSystemFileHandle[]): Promise<void> {
  if (!supportsRecentFiles()) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(list, kind);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  } catch {
    // 保存できなくても一覧はこのセッションの間使える
  }
}

// 一覧の更新を順番に実行する (isSameEntry の待ちの間に別の更新が割り込むと結果を失うため)
let queue: Promise<void> = Promise.resolve();

function update(kind: OpenKind, fn: (list: FileSystemFileHandle[]) => Promise<FileSystemFileHandle[]>): Promise<void> {
  queue = queue.then(async () => {
    try {
      const list = await fn(recentFiles.value[kind]);
      recentFiles.value = { ...recentFiles.value, [kind]: list };
      await persist(kind, list);
    } catch {
      // 一覧の更新に失敗しても本来の操作は止めない
    }
  });
  return queue;
}

export function addRecent(kind: OpenKind, handle: FileSystemFileHandle): Promise<void> {
  return update(kind, (list) => pushRecent(list, handle));
}

export function removeRecent(kind: OpenKind, handle: FileSystemFileHandle): Promise<void> {
  return update(kind, (list) => dropRecent(list, handle));
}

export function clearRecent(kind: OpenKind): Promise<void> {
  return update(kind, async () => []);
}

// 起動時に保存済みの一覧を読み込む
export async function initRecentFiles(): Promise<void> {
  if (!supportsRecentFiles()) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const loaded = await Promise.all(
      OPEN_KIND_NAMES.map(
        (kind) =>
          new Promise<FileSystemFileHandle[]>((resolve, reject) => {
            const req = store.get(kind);
            req.onsuccess = () => resolve((req.result as FileSystemFileHandle[] | undefined) ?? []);
            req.onerror = () => reject(req.error);
          }),
      ),
    );
    db.close();
    recentFiles.value = { project: loaded[0]!, voice: loaded[1]!, noise: loaded[2]! };
  } catch {
    // 読めなければ空の一覧で始める
  }
}
