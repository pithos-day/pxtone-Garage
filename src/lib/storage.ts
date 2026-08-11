// localStorage ラッパー。プライベートモード・容量超過などで失敗しても
// 黙って無視する (アプリは localStorage なしでも動作するため)
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 無視
  }
}
