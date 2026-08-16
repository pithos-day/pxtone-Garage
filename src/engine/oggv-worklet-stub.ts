// AudioWorklet バンドル専用の OGGV デコーダスタブ。
// @wasm-audio-decoders/ogg-vorbis はモジュール評価時に Worker を参照するため、
// Worker が存在しない AudioWorkletGlobalScope では読み込めない。
// デコードはメインスレッド (convertOggvToPcm) で済ませ、worklet はデコード済み
// PCM のみ扱うため、スタブに置き換えても問題ない。
export class OggVorbisDecoder {}
