// 同梱サンプル楽曲のカタログと、URL からの読み込み。
// ファイルは public/samples/ に置き、base path は worklet と同じく BASE_URL に従う。
import { openProjectFromBlob } from "./projects";
import { t } from "../i18n";

export interface SampleSong {
  id: string; // ?sample=<id>
  path: string; // public/ からの相対パス
  tabName: string; // タブ表示名 (拡張子なし)
}

export const SAMPLE_SONGS: readonly SampleSong[] = [
  { id: "moldau", path: "samples/Moldau.ptcop", tabName: "Moldau" },
];

// サンプルを fetch して新しいタブで開く。エラーメッセージを返す (成功・キャンセル時 null)
export async function openSampleProject(id: string): Promise<string | null> {
  const song = SAMPLE_SONGS.find((s) => s.id === id);
  if (!song) return t("error.sampleNotFound");

  let blob: Blob;
  try {
    const base = import.meta.env.BASE_URL ?? "/";
    const res = await fetch(new URL(`${base}${song.path}`, window.location.href));
    if (!res.ok) return `${t("error.sampleFetch")} (HTTP ${res.status})`;
    blob = await res.blob();
  } catch {
    return t("error.sampleFetch");
  }
  return openProjectFromBlob(blob, song.tabName);
}
