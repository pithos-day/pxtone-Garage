# pxtone-garage

[ピストンコラージュ](https://pxtone.org/) 互換の Web DAW アプリケーション。
ページ内のタブで ptCollage(DAW) / ptVoice(PTV音源エディタ) / ptNoise(PTNノイズエディタ) を切り替えて制作する。

再生エンジンは TypeScript 移植版の [pxtone-ts](https://codeberg.org/pithos/pxtone-ts) を使用。

## 機能

- **コラージュ (DAW)**
  - ptcop ファイルの読み込み・保存、pttune / WAV 書き出し
  - W(音色管理) / U(イベント編集) / K(ピアノロール) モード切替 (F1/F2/F3)
  - ユニットトレイ (フォーカス / operated / 並べ替え / ミュート / ソロ)
  - イベントレーン: 左ドラッグで音符生成、右ドラッグで削除
  - ピアノロール: ペン(音符) / ハンド(キーのみ)、鍵盤クリックで試聴
  - オートメーション (Velocity / Pan_Volume / Pan_Time / Volume / Portament / VoiceNo / GroupNo / Tuning)
  - 再生範囲マーカー (Repeat / Last)、選択範囲 (Scope)
  - Delay / OverDrive エフェクト編集
  - スナップショット型 undo/redo (Ctrl+Z / Ctrl+Y)
  - AudioWorklet によるリアルタイム再生、単音プレビュー
- **ボイス / ノイズ** — 開発予定 (フェーズ2/3)

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
    ├── voice/  # ptVoice (フェーズ2)
    └── noise/  # ptNoise (フェーズ3)
```

## 検証

ヘッドレス Chromium (CDP) によるスモークテスト:

- サンプル ptcop の読み込み → 編集 → undo/redo → 再生
- マウスドラッグでの音符生成・削除 (U/K モード)

```
# dev サーバ起動中に:
node /tmp/opencode/smoke-test.mjs   # エンジン統合テスト
node /tmp/opencode/e2e-drag.mjs     # マウス操作テスト
```

## ライセンス

ピストンコラージュは zlib ライセンス (C) 2005-2025 Daisuke Amaya (開発室Pixel)。
本アプリはその互換実装であり、pxtone-ts の移植元は [pxtone-source-code 220910a](https://pxtone.org/developer/)。
