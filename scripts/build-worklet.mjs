// AudioWorklet はクロスチャンク import ができないため、
// エンジン (pxtone-ts) ごと単一ファイルにバンドルして public/ に出力する。
// dev / build の直前に実行される (package.json の scripts)。
import { build } from "esbuild";

await build({
  entryPoints: ["src/engine/player-worklet.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "public/worklet/player-worklet.js",
  logLevel: "info",
  // OGGV デコーダ (@wasm-audio-decoders) は評価時に Worker を参照するため、
  // Worker の無い AudioWorklet には読み込めない。worklet はデコード済み PCM のみ
  // 扱うので、スタブ (src/engine/oggv-worklet-stub.ts) に置き換える
  alias: {
    "@wasm-audio-decoders/ogg-vorbis": "./src/engine/oggv-worklet-stub.ts",
  },
});
