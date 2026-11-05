// AudioWorklet はクロスチャンク import ができないため、
// エンジン (pxtone-ts) ごと単一ファイルにバンドルして public/ に出力する。
// dev / build の直前に実行される (package.json の scripts)。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { build } from "esbuild";

// THIRD_PARTY_NOTICES.txt の生成 (scripts/third-party-notices.ts) が参照する。
// WORKLET_METAFILE と同じパスにする
const METAFILE = "node_modules/.cache/pxtone-garage/worklet-meta.json";

const result = await build({
  entryPoints: ["src/engine/player-worklet.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "public/worklet/player-worklet.js",
  logLevel: "info",
  metafile: true,
});

mkdirSync(dirname(METAFILE), { recursive: true });
writeFileSync(METAFILE, JSON.stringify(result.metafile));
