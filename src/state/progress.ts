// 進捗ダイアログの状態と、時間のかかる IO を包む withProgress。
// - 実行中は state/ui のモーダルカウンタを立ててショートカットを止める
// - ダイアログ本体は showDelayMs 後に表示する (一瞬で終わる処理でちらつかないように)。
//   入力ブロック用のオーバーレイは開始直後から出して、処理中の編集を防ぐ
// - キャンセルは協調式。長いループの各チャンクで throwIfCancelled() を呼ぶこと
//   (同期 1 発の処理はその区切りまで中断できない)
// - state 層だが Vue の reactive 以外に依存しない (node テストから直接呼べる)
import { reactive } from "vue";
import { popModal, pushModal } from "./ui";

// ダイアログを表示するまでの猶予 (これより速く終わる処理では出さない)
export const PROGRESS_SHOW_DELAY_MS = 300;

export const progress = reactive({
  active: false, // 処理中 (オーバーレイを表示して入力を止める)
  open: false, // ダイアログ本体を表示 (遅延後)
  cancelling: false, // キャンセル要求済み (処理側の区切り待ち)
  cancellable: true, // キャンセルできる処理か
  title: "", // 操作名 ("WAV を書き出し中" など)
  label: "", // 現在の段階 ("レンダリング中" など)
  value: 0, // 全体進捗 0..1
  indeterminate: false, // 現在の段階の進捗が測れない (バーは不定表示)
});

// キャンセルによる中断。withProgress が捕まえて null を返す
export class ProgressCancelled extends Error {
  constructor() {
    super("進捗処理がキャンセルされました");
    this.name = "ProgressCancelled";
  }
}

export interface ProgressTask {
  readonly signal: AbortSignal;
  // 全体進捗の [start, end] 区間と段階名を設定する (区間内の set がここへ写像される)
  range(start: number, end: number, label: string): void;
  // 現在区間内の進捗 0..1 を報告する
  set(value: number): void;
  // 進捗が測れない段階へ移る (数字は据え置き・バーは不定表示)
  step(label: string): void;
  // キャンセル済みなら ProgressCancelled を投げる (チャンクの区切りで呼ぶ)
  throwIfCancelled(): void;
}

export interface ProgressOptions {
  cancellable?: boolean;
  showDelayMs?: number;
}

// 実行中の処理 (キャンセル用)。同時に 1 つだけ
let current: { controller: AbortController; cancellable: boolean } | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;

// 実行中の処理があるか (進捗なしで走らせているネスト実行では false にならない)
export function isProgressRunning(): boolean {
  return current !== null;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function beginTask(title: string, cancellable: boolean, showDelayMs: number): void {
  progress.active = true;
  progress.open = showDelayMs <= 0;
  progress.cancelling = false;
  progress.cancellable = cancellable;
  progress.title = title;
  progress.label = "";
  progress.value = 0;
  progress.indeterminate = false;
  // 進捗中はショートカットを止める (state/ui のモーダルカウンタ)
  pushModal();
  if (!progress.open) {
    showTimer = setTimeout(() => {
      showTimer = null;
      progress.open = true;
    }, showDelayMs);
  }
}

function endTask(): void {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  progress.active = false;
  progress.open = false;
  progress.cancelling = false;
  progress.cancellable = true;
  progress.title = "";
  progress.label = "";
  progress.value = 0;
  progress.indeterminate = false;
  popModal();
}

// キャンセルを要求する (ESC / キャンセルボタン)。
// 実際の中断は処理側が throwIfCancelled() を呼んだ時点で起きる
export function cancelProgress(): void {
  if (!current || !current.cancellable || current.controller.signal.aborted) return;
  progress.cancelling = true;
  current.controller.abort();
}

// 進捗なしのタスク (二重起動時に使う)
const NOOP_TASK: ProgressTask = {
  signal: new AbortController().signal,
  range: () => {},
  set: () => {},
  step: () => {},
  throwIfCancelled: () => {},
};

// 時間のかかる処理を進捗つきで実行する。戻り値 null はキャンセル。
// 処理中の例外はそのまま呼び出し側へ伝わる
export async function withProgress<T>(
  title: string,
  fn: (task: ProgressTask) => Promise<T>,
  options: ProgressOptions = {},
): Promise<T | null> {
  if (current) {
    // 同時実行は想定外 (呼び出し側のバグ)。落とさず進捗表示なしで実行する
    console.warn(`withProgress: 既に実行中のため進捗表示なしで実行します (${title})`);
    return fn(NOOP_TASK);
  }
  const controller = new AbortController();
  const cancellable = options.cancellable ?? true;
  let start = 0;
  let end = 1;
  const task: ProgressTask = {
    signal: controller.signal,
    range(s, e, label) {
      start = clamp01(s);
      end = clamp01(e);
      progress.value = start;
      progress.indeterminate = false;
      progress.label = label;
    },
    set(value) {
      progress.value = start + (end - start) * clamp01(value);
    },
    step(label) {
      progress.indeterminate = true;
      progress.label = label;
    },
    throwIfCancelled() {
      if (controller.signal.aborted) throw new ProgressCancelled();
    },
  };
  beginTask(title, cancellable, options.showDelayMs ?? PROGRESS_SHOW_DELAY_MS);
  current = { controller, cancellable };
  try {
    return await fn(task);
  } catch (e) {
    if (e instanceof ProgressCancelled) return null;
    throw e;
  } finally {
    current = null;
    endTask();
  }
}
