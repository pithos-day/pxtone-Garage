# pxtone Garage

[ピストンコラージュ](https://pxtone.org/) 互換の Web DAW アプリケーション。
ページ内のタブで ptCollage(DAW) / ptVoice(PTV音源エディタ) / ptNoise(PTNノイズエディタ) を切り替えて制作する。

再生エンジンは TypeScript 移植版の [pxtone-ts](https://codeberg.org/pithos/pxtone-ts) を使用。

## 機能

- **コラージュ (DAW)**
  - ptcop ファイルの読み込み・保存、pttune / WAV 書き出し
  - 複数ファイルの一括読み込み (ダイアログ / ドロップ)、最近使ったファイル (File System Access API 対応ブラウザのみ)
  - W(音色管理) / U(イベント編集) モード切替 (F1/F2) + ピアノロール (K モード)
  - ユニットトレイ (フォーカス / operated / 並べ替え / ミュート / ソロ)
  - イベントレーン: 左ドラッグで音符生成、右ドラッグで削除
  - ピアノロール: スマート / ペン(音符) / ハンド(キーのみ)、鍵盤クリックで試聴
  - ノートの複数選択 (スマートツール): Shift+ドラッグで矩形選択、Ctrl+クリックで切り替え、選択中のノートを掴んで一括移動
  - クオンタイズ (選択中のノート / 選択範囲 / ユニット全体)
  - 音色のドラッグ並べ替え
  - オートメーション (Velocity / Pan_Volume / Pan_Time / Volume / Portament / VoiceNo / GroupNo / Tuning)
  - 再生範囲マーカー (Repeat / Last)、選択範囲 (Scope)
  - Delay / OverDrive エフェクト編集
  - スナップショット型 undo/redo (Ctrl+Z / Ctrl+Y)
  - AudioWorklet によるリアルタイム再生、単音プレビュー
  - メトロノーム (音は ptnoise で生成。WAV 書き出しには入らない)
  - IO 中の進捗ダイアログ (パーセント + バー、ESC / キャンセルボタンで中断)。
    WAV 書き出しはチャンク分割して UI を止めず、真の進捗とキャンセルを提供する
- **ボイス (ptVoice)** — 座標波形 / 倍音の編集、エンベロープ、ピアノロールでの試聴、WAV 書き出し、Collage への追加
- **ノイズ (ptNoise)** — レイヤーとオシレータの編集、エンベロープ、波形プレビュー、History、WAV 書き出し、Collage への追加

## キーボードショートカット

割り当ては `src/lib/shortcuts.ts` の表に集約している (キー判定・メニュー右側の併記とも同じ表から導出)。
将来のカスタム割り当てはこの表を差し替えるだけでよい。

| キー | 動作 |
| --- | --- |
| Ctrl+Z / Ctrl+Y | 元に戻す / やり直す (3 タブ共通) |
| Ctrl+S / Ctrl+Shift+S | 保存 / 名前を付けて保存 |
| Ctrl+A / Ctrl+Shift+A | 範囲の全選択 / ユニットの全選択 |
| Ctrl+C / Ctrl+X / Ctrl+V | 範囲のコピー / 切り取り / 貼り付け |
| Delete / Shift+Delete | 範囲の消去 (前詰め) / 範囲のクリア (Backspace も同じ) |
| Esc | ノートの選択を解除 |
| ← → | 1 拍スクロール |
| ↑ ↓ | 1 行スクロール |
| Space | 再生 / 停止 |
| Home / End | 先頭 / 末尾へシーク |
| F1 / F2 | 音色管理 (W) / ユニット (U) |

- Ctrl+A は本家 ptCollage と同じく「範囲の全選択」。ユニットの全選択は Ctrl+Shift+A
- ノートを選択中は、コピー / 切り取り / 消去 / クリアの対象が選択中のノートになる。コピーしたノートは選択範囲の先頭、選択範囲がなければ再生位置へ貼り付ける
- 読み取り専用タブ (pttune) では編集系 (切り取り / 貼り付け / 消去 / クリア) を実行しない (コピー / 選択は可)
- モーダルダイアログ表示中はすべて無効

## 開発

```bash
pnpm install
pnpm dev        # worklet をバンドルして vite 起動 (http://localhost:5173)
pnpm build      # worklet + vue-tsc + vite build
pnpm worklet    # AudioWorklet のみバンドル (public/worklet/player-worklet.js)
```

## 構成

```
src/
├── engine/     # AudioWorklet プレイヤー / 単音プレビュー / ファイルIO
├── state/      # プロジェクト状態 (Serviceのミラー) / 再生 / undo / パネル
├── lib/        # テーマ・クロック変換・描画ヘルパ
├── composables/# canvas セットアップ
└── components/
    ├── shell/  # タブバー・ツールバー
    ├── collage/# ptCollage 相当の編集 UI
    ├── voice/  # ptVoice
    └── noise/  # ptNoise
```

## 検証

コアロジックのスモークテスト (node で直接実行):

- 複数プロジェクト (タブ) 管理・タブごとの状態/undo 独立性
- ソロ/ミュート・ユニット削除/並べ替えの状態追従
- 単音プレビューのリリースフェード (AudioContext モック)
- テーマ CSS パース / 小節コピー / イベント音量 / 再生範囲 (Start/End)
- 進捗ダイアログ (進捗の写像・表示遅延・キャンセル) と IO のチャンク分割/中断

```
pnpm test   # tests/multiproject.ts を esbuild でバンドルして実行
```

## ライセンス

ピストンコラージュは zlib ライセンス (C) 2005-2025 Daisuke Amaya (開発室Pixel)。
本アプリはその互換実装であり、pxtone-ts の移植元は [pxtone-source-code 220910a](https://pxtone.org/developer/)。
