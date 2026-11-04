// 編集履歴上の状態を識別するリビジョン。編集のたびに新しい番号を振り、undo / redo では
// スナップショットに記録した番号へ戻す。保存時の番号と比べることで、undo で保存時の状態へ
// 戻ったことをバイト列の比較なしで判定できる (スタックの上限で古いエントリが捨てられても崩れない)
export interface RevisionTracker {
  current: number;
  saved: number;
}

// 復元したドラフトのように、対応する保存状態がない場合の saved (どの current とも一致しない)
const NO_SAVED_REVISION = 0;

let nextRevision = NO_SAVED_REVISION + 1;

// 読み込み直後や新規作成の状態を保存済みとして始める
export function newRevisionTracker(): RevisionTracker {
  const revision = nextRevision++;
  return { current: revision, saved: revision };
}

export function touchRevision(tracker: RevisionTracker): void {
  tracker.current = nextRevision++;
}

export function markRevisionSaved(tracker: RevisionTracker): void {
  tracker.saved = tracker.current;
}

export function forgetSavedRevision(tracker: RevisionTracker): void {
  tracker.saved = NO_SAVED_REVISION;
}

export function isRevisionSaved(tracker: RevisionTracker): boolean {
  return tracker.current === tracker.saved;
}
