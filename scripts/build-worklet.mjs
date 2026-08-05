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
});
