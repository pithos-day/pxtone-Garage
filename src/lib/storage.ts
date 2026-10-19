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

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 無視
  }
}
