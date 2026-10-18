# AGENTS.md

pxtone-garage はピストンコラージュ (ptCollage) 互換の Web DAW。

## コマンド

- `pnpm test` — 自前ハーネス (esbuild バンドル → node 実行)。テストフレームワークなし

## 規約

- 編集の正本は state 層のエンジン Service。`doc` (reactive) は UI 購読用ミラーで、
  undo を伴う編集は単発なら `mutate(fn)`、ドラッグ等は `beginEdit()` + `commitEdit()` で包む
- pttune (再生専用) タブは `doc.readOnly` が true。編集系 API (`mutate` / `beginEdit` /
  `commitEdit` / `replaceUnitRaw` / `addEvent` / `deleteEvents` / `setEventValue`) は
  state 層で no-op になるが、UI 側でも入口 (メニュー / ポインタ操作) を無効化する
- コメントは日本語
- 時間は「クロック」単位 (beatClock=480 基準)、スクロール位置 scrollX は px
- キーボードショートカットは `src/lib/shortcuts.ts` の表 (コマンド / キー / 動作説明 /
  実行担当 `area`) に集約する。判定 (`shortcutCommand`) とメニュー併記 (`formatShortcut`) は
  表から導出し、コンポーネント側に個別のキー判定を書かない (`area` ごとに 1 か所で実行する)

## ドメイン用語・不変条件

- Repeat: UI は 1-based (0=なし)、ファイル/エンジンは 0-based。変換は `fileRepeatToUi` / `uiRepeatToFile`
- 選択範囲 scope は半開区間 [scope1, scope2)
- KEY イベント値 (0x8700 ベース) とピッチ番号 (108 ベース) は別座標系
- ソロ中は「ソロユニット以外を全ミュート」が不変条件
