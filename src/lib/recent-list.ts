// 「最近使ったファイル」の一覧操作 (state 層に依存しない純関数)
export const RECENT_MAX = 10;

// FileSystemFileHandle のうち一覧操作に必要な部分 (テストから素のオブジェクトを渡せるように)
export interface RecentHandle<H> {
  name: string;
  isSameEntry(other: H): Promise<boolean>;
}

// handle を先頭へ置いた一覧を返す。同じファイルがあれば取り除き、上限を超えた分は捨てる
export async function pushRecent<H extends RecentHandle<H>>(list: readonly H[], handle: H, max = RECENT_MAX): Promise<H[]> {
  const out: H[] = [handle];
  for (const h of list) {
    if (await h.isSameEntry(handle)) continue;
    out.push(h);
  }
  return out.slice(0, max);
}

// handle と同じファイルを取り除いた一覧を返す
export async function dropRecent<H extends RecentHandle<H>>(list: readonly H[], handle: H): Promise<H[]> {
  const out: H[] = [];
  for (const h of list) {
    if (!(await h.isSameEntry(handle))) out.push(h);
  }
  return out;
}
