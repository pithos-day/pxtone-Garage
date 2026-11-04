// 複数ファイルの一括読み込み (ダイアログ / ドロップの共通入口)。
// プロジェクト / Voice / Noise は 1 ファイル 1 タブ、音色はまとめて 1 undo で追加する。
// 1 ファイルが失敗しても残りは続行し、最後に失敗したファイルをまとめて知らせる
import { readBlobsAndApply, type FileFailure, type OpenedFile } from "../engine/io";
import { addWoices, prepareWoiceFile, type PreparedWoice } from "./project";
import { openProjectInTab } from "./projects";
import { openVoice } from "./voice";
import { openNoise } from "./noise";
import { appAlert } from "./dialog";
import { t } from "../i18n";

// タブで開けるファイルの種別
export type OpenKind = "project" | "voice" | "noise";

// 種別ごとのファイル選択条件とタブを開く処理
export const OPEN_KINDS: Record<OpenKind, { accept: string; exts: RegExp; open: (bytes: Uint8Array, name: string) => string | null }> = {
  project: { accept: ".ptcop,.pttune", exts: /\.(ptcop|pttune)$/i, open: openProjectInTab },
  voice: { accept: ".ptvoice", exts: /\.ptvoice$/i, open: openVoice },
  noise: { accept: ".ptnoise", exts: /\.ptnoise$/i, open: openNoise },
};

function reportFailures(failures: FileFailure[]): void {
  if (failures.length === 0) return;
  const lines = failures.map((f) => `${f.name}: ${f.error}`);
  void appAlert(failures.length === 1 ? lines[0]! : `${t("error.filesFailed")}\n${lines.join("\n")}`);
}

// ファイルをそれぞれ新しいタブで開く。キャンセルしても開き終えたタブは残す
export async function openFilesInTabs(kind: OpenKind, files: OpenedFile[]): Promise<void> {
  const { open } = OPEN_KINDS[kind];
  const { failures } = await readBlobsAndApply(t("progress.openTitle"), files, (bytes, f) => open(bytes, f.name));
  reportFailures(failures);
}

// 音色ファイルを現在のプロジェクトへまとめて追加する (全体で 1 undo)。
// 読み込みと変換を先に済ませて最後に一度だけ適用するので、キャンセル時は何も変更しない
export async function addWoiceFiles(files: OpenedFile[]): Promise<void> {
  const prepared: PreparedWoice[] = [];
  const { failures, cancelled } = await readBlobsAndApply(t("progress.woiceTitle"), files, async (bytes, f) => {
    const res = await prepareWoiceFile(bytes, f.name);
    if (typeof res === "string") return res;
    prepared.push(res);
    return null;
  });
  if (!cancelled) failures.push(...addWoices(prepared));
  reportFailures(failures);
}
