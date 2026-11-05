// 未保存ドラフトの IndexedDB ストア (1 レコードのみ)。
// localStorage より大きいデータを扱え、バイト列を base64 にせずそのまま保存できる。
// 接続を開いたまま保持し、以降の書き込みは呼び出しと同期でトランザクションを始める
// (beforeunload の中でも書き込みを開始できるようにするため)
export const DRAFT_DB_NAME = "pxtone-garage-drafts";
const STORE = "drafts";
const RECORD_KEY = "current";

let db: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB を利用できません"));
      return;
    }
    const req = indexedDB.open(DRAFT_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const conn = req.result;
      // ブラウザ側から閉じられたら、次の書き込みで開き直す
      conn.onclose = () => {
        db = null;
      };
      conn.onversionchange = () => {
        conn.close();
        db = null;
      };
      db = conn;
      opening = null;
      resolve(conn);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  opening = pending;
  return pending;
}

export async function readDraftRecord(): Promise<unknown> {
  const conn = db ?? (await openDb());
  return new Promise((resolve, reject) => {
    const req = conn.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

// レコードを置き換える (null なら削除)。トランザクションの完了で解決する。
// 同じストアの書き込みトランザクションは開始順に実行されるため、順序は呼び出し順のまま
export async function writeDraftRecord(value: unknown): Promise<void> {
  const conn = db ?? (await openDb());
  await new Promise<void>((resolve, reject) => {
    const tx = conn.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    const store = tx.objectStore(STORE);
    if (value === null) store.delete(RECORD_KEY);
    else store.put(value, RECORD_KEY);
  });
}
