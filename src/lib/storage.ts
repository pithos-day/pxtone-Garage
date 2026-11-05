// localStorage ラッパー。プライベートモード・容量超過などで失敗しても
// 黙って無視する (アプリは localStorage なしでも動作するため)
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// 書き込みの成否が必要な用途 (未保存ドラフトの退避など) 向け
export function tryWriteStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function writeStorage(key: string, value: string): void {
  tryWriteStorage(key, value);
}

// 接頭辞が一致するキーをすべて消す
export function removeStorageByPrefix(prefix: string): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) {
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // 無視
  }
}

// IndexedDB のデータベースを削除する。他のタブが使用中で削除できない場合は失敗にする
export function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`${name} は使用中です`));
  });
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 無視
  }
}
