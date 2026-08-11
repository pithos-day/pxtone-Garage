// 編集ジェスチャの undo 管理 (1 ジェスチャ = 1 undo エントリ)。
// markRaw 実体を直接書き換える編集の undo 先頭積み込みを共通化する
import { beginEdit, commitEdit } from "../state/project";

// 一度だけ begin() を実行するガード。reset() で次のジェスチャを受け付ける
// (フォーカス時 undo 1 エントリ: focus 時に editX(() => {}) を積み、blur でリセット)
export function useOnceUndo(begin: () => void): { onBegin: () => void; reset: () => void } {
  let pushed = false;
  return {
    onBegin: () => {
      if (pushed) return;
      pushed = true;
      begin();
    },
    reset: () => {
      pushed = false;
    },
  };
}

// ドラッグ編集の undo 管理。最初の移動時のみ undo を積み、ジェスチャ終了時に commit する
// (クリックのみなら undo を積まない)
export function useDragUndo(): { onFirstMove: () => void; finish: () => boolean } {
  let pushed = false;
  return {
    onFirstMove: () => {
      if (pushed) return;
      pushed = true;
      beginEdit();
    },
    finish: () => {
      const had = pushed;
      pushed = false;
      if (had) commitEdit();
      return had;
    },
  };
}
