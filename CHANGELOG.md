# Changelog

## [1.0.0](https://github.com/pithos-day/pxtone-garage/releases/tag/v1.0.0) - 2026-11-05

最初のリリースです。ptCollage / ptVoice / ptNoise をアプリ内のタブで切り替えて制作できます。

### Collage

- ptcop の読み込み / 保存、pttune の読み込み (再生専用) / 書き出し、MIDI の読み込み
- ピアノロールとイベントレーンでのノート / イベント編集
- 範囲のコピー / 貼り付け / 移調 / クオンタイズなどの一括編集
- ptvoice / ptnoise / WAV / OGG の音色の追加と、Voice / Noise タブでの編集
- Delay / OverDrive、メトロノーム、出力レベルメーター
- WAV 書き出し (ユニット別の ZIP 書き出しにも対応)

### Voice / Noise

- Voice: 座標波形 / 倍音、エンベロープの編集
- Noise: レイヤーとオシレータ、エンベロープの編集
- WAV 書き出し、Collage への追加

### 共通

- タブごとの undo / redo、未保存の編集の自動復元
- テーマ (インポート / エクスポート可)、フォント、キー割り当ての変更
- 日本語 / English

### 動作環境

- PC のブラウザ (一度開いた後はネットワークなしで使えます)
- Windows / macOS / Linux 向けのスタンドアロン版

スタンドアロン版はコード署名をしていないため、初回起動時に警告が出ます。起動方法は [README](./README.md#動作環境) を参照してください。
