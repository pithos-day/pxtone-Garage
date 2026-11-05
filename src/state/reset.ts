// Help > 初期化。ブラウザに保存したこのアプリのデータをすべて消して再読み込みする。
// 消去の途中や再読み込み時に未保存の編集が退避し直されないよう、ドラフトの退避を止めてから消す
import { deleteIndexedDb, removeStorageByPrefix } from "../lib/storage";
import { DRAFT_DB_NAME } from "../lib/draft-store";
import { setDraftsSuspended } from "./drafts";
import { RECENT_FILES_DB_NAME } from "./recent-files";
import { appAlert, appConfirm } from "./dialog";
import { t } from "../i18n";

// localStorage のキーはすべてこの接頭辞で始まる
const STORAGE_PREFIX = "pxtone-garage-";

export async function resetApp(): Promise<void> {
  if (!(await appConfirm(t("confirm.reset")))) return;
  setDraftsSuspended(true);
  try {
    await deleteIndexedDb(DRAFT_DB_NAME);
    await deleteIndexedDb(RECENT_FILES_DB_NAME);
  } catch (err) {
    console.warn("データを初期化できませんでした", err);
    setDraftsSuspended(false);
    void appAlert(t("error.reset"));
    return;
  }
  removeStorageByPrefix(STORAGE_PREFIX);
  location.reload();
}
