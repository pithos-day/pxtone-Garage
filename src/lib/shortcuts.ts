// キーボードショートカットの一元管理。
// コマンド ID・キー割り当て・動作の説明・実行場所を DEFINITIONS に集約し、
// 判定 (shortcutCommand) と表示 (formatShortcut) はこの表から導出する。
// キーの追加・変更や将来のカスタム割り当ては DEFINITIONS を書き換えるだけでよい。
// state 層に依存しない純関数のみ (node テストから直接呼べる)

// 実行場所。キー入力は実行するコンポーネントごとに受け取る
// (app = MenuBar が 3 タブ共通で実行 / collage = CollageEditor が実行)
export type ShortcutArea = "app" | "collage";

// キー割り当て。key は KeyboardEvent.key を小文字に正規化した値
// (文字キーは "z"、特殊キーは "delete" / "arrowleft" / " " など)
export interface KeyBinding {
  key: string;
  ctrl?: boolean; // Ctrl (macOS は ⌘ も受け付ける)
  shift?: boolean;
  alt?: boolean;
  label?: string; // 表示名 (省略時は key から生成。"←" / "Space" など)
}

// 実行に必要な前提。ctx と突き合わせて開始可否を決める
export interface ShortcutContext {
  readOnly: boolean; // 読み取り専用タブ (pttune): 編集系を実行しない
  clipReady: boolean; // スコープのクリップボードに内容がある
  modalOpen: boolean; // モーダルダイアログ表示中: すべて実行しない
}

export interface ShortcutDef {
  area: ShortcutArea;
  action: string; // 動作の説明 (ヘルプ・将来のカスタム UI 用)
  keys: readonly KeyBinding[]; // 先頭が主割り当て (表示に使う)。2 つ目以降は別名
  edit?: boolean; // 編集系 (readOnly では実行しない)
  clip?: boolean; // クリップボード必須
  repeat?: boolean; // キー長押し (自動リピート) を許可する
}

// コマンド定義 (ここが唯一の定義。並び順が一覧と判定の順になる)
const DEFINITIONS = {
  undo: { area: "app", action: "元に戻す", keys: [{ key: "z", ctrl: true }] },
  redo: { area: "app", action: "やり直す", keys: [{ key: "y", ctrl: true }, { key: "z", ctrl: true, shift: true }] },
  save: { area: "app", action: "保存", keys: [{ key: "s", ctrl: true }] },
  saveAs: { area: "app", action: "名前を付けて保存", keys: [{ key: "s", ctrl: true, shift: true }] },

  scopeAll: { area: "collage", action: "選択範囲を全選択", keys: [{ key: "a", ctrl: true }] },
  selectAllUnits: { area: "collage", action: "ユニットを全選択", keys: [{ key: "a", ctrl: true, shift: true }] },
  scopeCopy: { area: "collage", action: "範囲をコピー", keys: [{ key: "c", ctrl: true }] },
  scopeCut: { area: "collage", action: "範囲を切り取り", keys: [{ key: "x", ctrl: true }], edit: true },
  scopePaste: { area: "collage", action: "範囲を貼り付け", keys: [{ key: "v", ctrl: true }], edit: true, clip: true },
  scopeDelete: { area: "collage", action: "範囲を消去 (前詰め)", keys: [{ key: "delete" }, { key: "backspace" }], edit: true },
  scopeClear: { area: "collage", action: "範囲をクリア", keys: [{ key: "delete", shift: true }, { key: "backspace", shift: true }], edit: true },

  scrollLeft: { area: "collage", action: "左へスクロール (1 拍)", keys: [{ key: "arrowleft", label: "←" }], repeat: true },
  scrollRight: { area: "collage", action: "右へスクロール (1 拍)", keys: [{ key: "arrowright", label: "→" }], repeat: true },
  rowUp: { area: "collage", action: "上へスクロール (1 行)", keys: [{ key: "arrowup", label: "↑" }], repeat: true },
  rowDown: { area: "collage", action: "下へスクロール (1 行)", keys: [{ key: "arrowdown", label: "↓" }], repeat: true },

  playToggle: { area: "collage", action: "再生 / 停止", keys: [{ key: " ", label: "Space" }] },
  seekStart: { area: "collage", action: "先頭へシーク", keys: [{ key: "home" }] },
  seekEnd: { area: "collage", action: "末尾へシーク", keys: [{ key: "end" }] },
  modeW: { area: "collage", action: "音色管理 (W)", keys: [{ key: "f1" }] },
  modeU: { area: "collage", action: "ユニット (U)", keys: [{ key: "f2" }] },
} as const satisfies Record<string, ShortcutDef>;

export type ShortcutCommand = keyof typeof DEFINITIONS;

export interface ShortcutEntry extends ShortcutDef {
  command: ShortcutCommand;
}

// 実行時のキー割り当て (コマンド → 割り当て一覧。先頭が表示用の主割り当て)
export type ShortcutBindings = Record<ShortcutCommand, KeyBinding[]>;

// 既定の割り当て。DEFINITIONS から複製する (キー設定のリセット・未保存時の復元に使う)
export const DEFAULT_BINDINGS: ShortcutBindings = (Object.keys(DEFINITIONS) as ShortcutCommand[]).reduce(
  (acc, command) => {
    acc[command] = DEFINITIONS[command].keys.map((b) => ({ ...b }));
    return acc;
  },
  {} as ShortcutBindings,
);

// 定義順の一覧 (判定ループ・ヘルプ・将来のカスタム UI の並び順)
export const SHORTCUTS: readonly ShortcutEntry[] = (Object.keys(DEFINITIONS) as ShortcutCommand[]).map((command) => ({
  command,
  ...DEFINITIONS[command],
}));

const BY_COMMAND = new Map<ShortcutCommand, ShortcutEntry>(SHORTCUTS.map((s) => [s.command, s]));

export function shortcutEntry(command: ShortcutCommand): ShortcutEntry {
  // 表は DEFINITIONS から生成するので必ず見つかる
  return BY_COMMAND.get(command)!;
}

export function shortcutAreaOf(command: ShortcutCommand): ShortcutArea {
  return shortcutEntry(command).area;
}

// KeyboardEvent の必要最小限 (テストから素のオブジェクトを渡せるようにする)
export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

// キー入力 → コマンド ID。前提 (ctx) を満たさない場合は null。
// 修飾キーは完全一致で判定する (Ctrl+Delete など別物にマッチさせない)。
// bindings を省略すると既定の割り当てを使う (キー設定の上書きは state/keybindings が渡す)
export function shortcutCommand(
  e: ShortcutEvent,
  ctx: ShortcutContext,
  bindings: ShortcutBindings = DEFAULT_BINDINGS,
): ShortcutCommand | null {
  if (ctx.modalOpen) return null;
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  for (const entry of SHORTCUTS) {
    if (e.repeat && !entry.repeat) continue;
    if (entry.edit && ctx.readOnly) continue;
    if (entry.clip && !ctx.clipReady) continue;
    const keys = bindings[entry.command] ?? [];
    if (keys.some((b) => bindingMatches(b, key, ctrl, e.shiftKey, e.altKey))) return entry.command;
  }
  return null;
}

function bindingMatches(b: KeyBinding, key: string, ctrl: boolean, shift: boolean, alt: boolean): boolean {
  return b.key === key && !!b.ctrl === ctrl && !!b.shift === shift && !!b.alt === alt;
}

// 2 つの割り当てが同じキー (修飾キー込み) か
export function bindingEquals(a: KeyBinding, b: KeyBinding): boolean {
  return a.key === b.key && !!a.ctrl === !!b.ctrl && !!a.shift === !!b.shift && !!a.alt === !!b.alt;
}

// KeyboardEvent から割り当てを作る。修飾キー単独・判別不能キーは null。
// Ctrl は macOS の ⌘ (metaKey) も含める (判定側の bindingMatches と同じ扱い)
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function bindingFromEvent(e: ShortcutKeyEvent): KeyBinding | null {
  if (isModifierKey(e.key)) return null;
  const key = e.key.toLowerCase();
  if (!key || key === "dead" || key === "unidentified") return null;
  const binding: KeyBinding = { key };
  if (e.ctrlKey || e.metaKey) binding.ctrl = true;
  if (e.shiftKey) binding.shift = true;
  if (e.altKey) binding.alt = true;
  return binding;
}

// command 以外のコマンドが同じ割り当てを使っていたら、そのコマンドを返す (競合検出)
export function bindingConflict(
  bindings: ShortcutBindings,
  command: ShortcutCommand,
  binding: KeyBinding,
): ShortcutCommand | null {
  for (const entry of SHORTCUTS) {
    if (entry.command === command) continue;
    if ((bindings[entry.command] ?? []).some((b) => bindingEquals(b, binding))) return entry.command;
  }
  return null;
}

// 主割り当ての表示 ("Ctrl+Shift+A" / "F1" / "←")。メニューやツールチップへの併記に使う。
// isMac は ⌘ 表示の切替 (省略時は環境から判定)
export function formatShortcut(
  command: ShortcutCommand,
  isMac = detectMac(),
  bindings: ShortcutBindings = DEFAULT_BINDINGS,
): string {
  const keys = bindings[command] ?? [];
  return keys.length > 0 ? bindingLabel(keys[0]!, isMac) : "";
}

// リアクティブな割り当てを渡す版 (state/keybindings のラッパー用)
export function formatShortcutWithBindings(
  command: ShortcutCommand,
  bindings: ShortcutBindings,
  isMac = detectMac(),
): string {
  const keys = bindings[command] ?? [];
  return keys.length > 0 ? bindingLabel(keys[0]!, isMac) : "";
}

export function bindingLabel(b: KeyBinding, isMac = detectMac()): string {
  const key = b.label ?? defaultKeyLabel(b.key);
  if (isMac) {
    // macOS 流の表記 (⇧⌘S のように記号を連結する)
    return `${b.shift ? "⇧" : ""}${b.ctrl ? "⌘" : ""}${b.alt ? "⌥" : ""}${key}`;
  }
  const parts: string[] = [];
  if (b.ctrl) parts.push("Ctrl");
  if (b.shift) parts.push("Shift");
  if (b.alt) parts.push("Alt");
  parts.push(key);
  return parts.join("+");
}

// 特殊キーの表示名 (文字キーは大文字 1 文字)
const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  escape: "Esc",
  enter: "Enter",
  delete: "Delete",
  backspace: "Backspace",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  tab: "Tab",
  insert: "Insert",
};

function defaultKeyLabel(key: string): string {
  const mapped = KEY_LABELS[key];
  if (mapped) return mapped;
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// 修飾キー単独の押下か (メニューを閉じる判定などに使う)
export function isModifierKey(key: string): boolean {
  return key === "Control" || key === "Shift" || key === "Alt" || key === "Meta";
}

// macOS 判定 (表示の ⌘ 切替用)。判定できない環境 (node) は Ctrl 表示
function detectMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent ?? "");
}

// ←/→ のスクロール位置 (本家 g_ScrlEventH の cursor_move = 1 拍 = zoom px)。
// 0 未満はクランプする (上限はホイールと同じくコンテンツ側で補正する)
export function arrowScrollX(scrollX: number, zoom: number, dir: -1 | 1): number {
  return Math.max(0, scrollX + dir * zoom);
}

// ↑/↓ のスクロール行 (本家 g_ScrlKeyV の cursor_move = 1 行 = KEY_HEIGHT)
export function arrowScrollRow(scrollYKey: number, dir: -1 | 1, totalRows: number): number {
  return Math.max(0, Math.min(Math.max(0, totalRows - 1), scrollYKey + dir));
}
