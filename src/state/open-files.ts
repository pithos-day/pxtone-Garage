// 複数ファイルの一括読み込み (ダイアログ / ドロップの共通入口)。
// プロジェクト / Voice / Noise は 1 ファイル 1 タブ、音色はまとめて 1 undo で追加する。
// 1 ファイルが失敗しても残りは続行し、最後に失敗したファイルをまとめて知らせる
import { readBlobsAndApply, type FileFailure, type OpenedFile } from "../engine/io";
import { addWoices, prepareWoiceFile, type PreparedWoice } from "./project";
import { openProjectInTab } from "./projects";
import { openVoice } from "./voice";
import { openNoise } from "./noise";
import { addRecent, removeRecent, type OpenKind } from "./recent-files";
import { appAlert } from "./dialog";
import { t } from "../i18n";

export type { OpenKind };

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
  const { failures } = await readBlobsAndApply(t("progress.openTitle"), files, (bytes, f) => {
    const err = open(bytes, f.name);
    if (!err && f.handle) void addRecent(kind, f.handle);
    return err;
  });
  reportFailures(failures);
}

// 最近使ったファイルを開き直す。権限の要求にユーザー操作が必要なので、クリック処理から呼ぶこと。
// ファイルが消えていたら一覧から外して知らせる
export async function openRecentFile(kind: OpenKind, handle: FileSystemFileHandle): Promise<void> {
  let file: File;
  try {
    const mode = { mode: "read" } as const;
    if ((await handle.queryPermission(mode)) !== "granted" && (await handle.requestPermission(mode)) !== "granted") return;
    file = await handle.getFile();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") {
      void removeRecent(kind, handle);
      void appAlert(t("error.recentMissing").replace("{name}", handle.name));
    } else {
      void appAlert(`${handle.name}: ${t("error.loadFailed")}`);
    }
    return;
  }
  await openFilesInTabs(kind, [{ name: file.name.replace(OPEN_KINDS[kind].exts, ""), file, handle }]);
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
