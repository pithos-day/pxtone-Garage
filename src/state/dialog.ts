// アプリ固有のメッセージダイアログ (alert / confirm / prompt 相当) の要求キュー。
// ブラウザ標準のダイアログはテーマが効かず処理も止めるため、Promise で結果を返す。
// 表示は AppDialogHost が担当し、同時に要求されたら順番に 1 つずつ出す
import { computed, shallowRef } from "vue";

export type AppDialogRequest =
  | { id: number; kind: "alert"; message: string; resolve: (v: void) => void }
  | { id: number; kind: "confirm"; message: string; resolve: (v: boolean) => void }
  | { id: number; kind: "prompt"; message: string; defaultValue: string; resolve: (v: string | null) => void };

// 分配条件型で kind ごとに id / resolve を除いた要求を表す
type NewRequest<R> = R extends AppDialogRequest ? Omit<R, "id"> : never;

const queue = shallowRef<AppDialogRequest[]>([]);
let nextId = 1;

export const currentAppDialog = computed<AppDialogRequest | null>(() => queue.value[0] ?? null);

function enqueue(req: NewRequest<AppDialogRequest>): void {
  queue.value = [...queue.value, { ...req, id: nextId++ } as AppDialogRequest];
}

// メッセージを表示し、閉じられたら解決する
export function appAlert(message: string): Promise<void> {
  return new Promise((resolve) => enqueue({ kind: "alert", message, resolve }));
}

// OK で true、キャンセルで false に解決する
export function appConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => enqueue({ kind: "confirm", message, resolve }));
}

// OK で入力文字列、キャンセルで null に解決する
export function appPrompt(message: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => enqueue({ kind: "prompt", message, defaultValue, resolve }));
}

function finish(fn: (req: AppDialogRequest) => void): void {
  const req = queue.value[0];
  if (!req) return;
  queue.value = queue.value.slice(1);
  fn(req);
}

// OK 押下。prompt は入力文字列を渡す
export function acceptAppDialog(input = ""): void {
  finish((req) => {
    if (req.kind === "alert") req.resolve();
    else if (req.kind === "confirm") req.resolve(true);
    else req.resolve(input);
  });
}

// キャンセル (Esc / オーバーレイクリックを含む)。alert は閉じるだけ
export function dismissAppDialog(): void {
  finish((req) => {
    if (req.kind === "alert") req.resolve();
    else if (req.kind === "confirm") req.resolve(false);
    else req.resolve(null);
  });
}
