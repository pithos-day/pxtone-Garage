// 自前ハーネスのテストを順に実行する (esbuild でバンドルして node で実行し、最初の失敗で止める)
import { spawnSync } from "node:child_process";
import { buildSync } from "esbuild";

const SUITES = ["multiproject", "preview-sim", "worklet-sim"];

for (const suite of SUITES) {
  const outfile = `tests/.${suite}.cjs`;
  buildSync({ entryPoints: [`tests/${suite}.ts`], bundle: true, platform: "node", format: "cjs", outfile, logLevel: "error" });
  const { status } = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
}
