// 配布物に含まれる依存ライブラリのライセンス本文とクレジットを集約し、
// ビルド時に dist/THIRD_PARTY_NOTICES.txt として出力する Vite プラグイン。
//
// package.json の dependencies ではなく実際のモジュールグラフから集めるので、
// ビルド時にしか使わない推移的依存 (@vue/compiler-sfc 等) は載らない。
// AudioWorklet は別バンドルのため、scripts/build-worklet.mjs の metafile も合わせて見る。
//
// ライセンス本文を取得できないパッケージがあるとビルドを失敗させる。
// その場合は本文を scripts/third-party-licenses/ に置き、PACKAGE_SUPPLEMENTS に登録する。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import type { Plugin } from "vite";

export const NOTICES_FILE_NAME = "THIRD_PARTY_NOTICES.txt";
export const WORKLET_METAFILE = "node_modules/.cache/pxtone-garage/worklet-meta.json";
const SUPPLEMENT_DIR = "scripts/third-party-licenses";

const LICENSE_FILE = /^(licen[cs]es?|copying|notice)(\.(txt|md))?$/i;

// npm パッケージの同梱ファイルだけでは足りない分の本文
const PACKAGE_SUPPLEMENTS: Record<string, string[]> = {
  // npm パッケージにもリポジトリにも LICENSE が無い。package.json の MIT 宣言と
  // dist の著作権表示から MIT の定型文を起こしている
  "@wasm-audio-decoders/common": ["wasm-audio-decoders-MIT.txt"],
  "@wasm-audio-decoders/ogg-vorbis": ["wasm-audio-decoders-MIT.txt"],
  // LGPLv3 は GPLv3 の全文も添付する必要がある
  "codec-parser": ["gpl-3.0.txt"],
};

// npm パッケージとしては現れないが、パッケージに組み込まれているソフトウェア
const EMBEDDED_SOFTWARE: EmbeddedSoftware[] = [
  {
    name: "libvorbis",
    license: "BSD-3-Clause",
    url: "https://github.com/xiph/vorbis",
    embeddedIn: "@wasm-audio-decoders/ogg-vorbis",
    textFile: "libvorbis-COPYING.txt",
  },
  {
    name: "libogg",
    license: "BSD-3-Clause",
    url: "https://github.com/xiph/ogg",
    embeddedIn: "@wasm-audio-decoders/ogg-vorbis",
    textFile: "libogg-COPYING.txt",
  },
  {
    name: "pxtone-source-code 220910a",
    license: "pxtone source code terms",
    url: "https://pxtone.org/developer/",
    embeddedIn: "pxtone-ts",
    textFile: "pxtone-source-code-terms.txt",
  },
];

// 本アプリが互換対象として参考にしたソフトウェア。モジュールグラフによらず常に載せる
const REFERENCED_SOFTWARE: ReferencedSoftware[] = [
  {
    name: "pxtone Collage",
    license: "Zlib",
    url: "https://github.com/uxtone/ptCollage",
    textFile: "ptcollage-LICENSE.txt",
  },
];

interface ReferencedSoftware {
  name: string;
  license: string;
  url: string;
  textFile: string;
}

interface EmbeddedSoftware extends ReferencedSoftware {
  embeddedIn: string;
}

export interface NoticeEntry {
  /** 見出し (例: "vue 3.5.40") */
  title: string;
  license: string;
  url?: string;
  /** ライセンス本文 (同じ本文のエントリは 1 つの節にまとめる) */
  texts: string[];
}

/** モジュール ID から所属パッケージのディレクトリを求める。node_modules 外なら null */
export function packageDirOfModule(moduleId: string): string | null {
  // Windows では Vite の ID は / 区切り、resolve した Worklet の入力は \ 区切りなので揃える
  const path = normalize(moduleId.replace(/^\0/, "").split("?")[0]);
  const boundary = path.lastIndexOf(`${sep}node_modules${sep}`);
  if (boundary < 0) return null;
  const stop = path.slice(0, boundary + `${sep}node_modules`.length);
  // dist/esm/package.json のように name を持たない階層は読み飛ばす
  for (let dir = dirname(path); dir.length > stop.length; dir = dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name) return dir;
  }
  return null;
}

function repositoryUrl(repository: unknown): string | undefined {
  const raw = typeof repository === "string" ? repository : (repository as { url?: string } | undefined)?.url;
  return raw?.replace(/^git\+/, "").replace(/\.git$/, "");
}

/** パッケージのディレクトリからエントリを作る。ライセンス情報が欠けていれば例外 */
export function readPackageEntry(dir: string, supplementDir: string): NoticeEntry & { name: string } {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const label = `${pkg.name}@${pkg.version}`;
  if (typeof pkg.license !== "string") throw new Error(`${label}: package.json に license がありません`);

  const bundled = readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"));
  const supplements = (PACKAGE_SUPPLEMENTS[pkg.name] ?? []).map((f) => readFileSync(join(supplementDir, f), "utf8"));
  const texts = [...bundled, ...supplements];
  if (texts.length === 0) {
    throw new Error(`${label}: ライセンス本文がありません。${SUPPLEMENT_DIR} に置いて PACKAGE_SUPPLEMENTS に登録してください`);
  }
  return {
    name: pkg.name,
    title: `${pkg.name} ${pkg.version}`,
    license: pkg.license,
    url: repositoryUrl(pkg.repository) ?? pkg.homepage,
    texts,
  };
}

function normalizeText(text: string): string {
  // 字下げされた Apache-2.0 の表題などを崩さないよう、先頭は空行だけ落とす
  return text.replace(/\r\n?/g, "\n").replace(/^(\s*\n)+/, "").trimEnd();
}

/** 通知ファイルの本文を組み立てる。同じ本文のエントリは 1 つの節にまとめ、順序は入力に依存させない */
export function renderNotices(entries: NoticeEntry[]): string {
  const groups = new Map<string, NoticeEntry[]>();
  const sorted = [...entries].sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  for (const entry of sorted) {
    const key = entry.texts.map(normalizeText).join("\n\n");
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const rule = "=".repeat(80);
  const sections = [...groups].map(([text, members]) => {
    const heads = members.map((m) => `${m.title} (${m.license})${m.url ? `\n  ${m.url}` : ""}`);
    return `${rule}\n${heads.join("\n")}\n${rule}\n\n${text}`;
  });
  const header =
    "pxtone Garage は以下のサードパーティソフトウェアを含みます。\n" +
    "This application includes the following third-party software.";
  // 配信元が charset を付けるとは限らない (Electron の独自プロトコルは text/plain のみ) ので、
  // BOM で UTF-8 と判定させる
  return `\uFEFF${[header, ...sections].join("\n\n\n")}\n`;
}

function supplementEntry(software: ReferencedSoftware, supplementDir: string): NoticeEntry {
  return {
    title: software.name,
    license: software.license,
    url: software.url,
    texts: [readFileSync(join(supplementDir, software.textFile), "utf8")],
  };
}

/** 通知対象のパッケージと、それらに組み込まれたソフトウェアのエントリを集める */
export function collectEntries(moduleIds: Iterable<string>, root: string): NoticeEntry[] {
  const supplementDir = resolve(root, SUPPLEMENT_DIR);
  const dirs = new Set<string>();
  for (const id of moduleIds) {
    const dir = packageDirOfModule(id);
    if (dir) dirs.add(dir);
  }
  const packages = [...dirs].map((dir) => readPackageEntry(dir, supplementDir));
  const names = new Set(packages.map((p) => p.name));
  const embedded = EMBEDDED_SOFTWARE.filter((s) => names.has(s.embeddedIn)).map((s) => supplementEntry(s, supplementDir));
  return [...packages, ...embedded];
}

/** 互換対象として参考にしたソフトウェアのエントリを集める */
export function referencedEntries(root: string): NoticeEntry[] {
  const supplementDir = resolve(root, SUPPLEMENT_DIR);
  return REFERENCED_SOFTWARE.map((s) => supplementEntry(s, supplementDir));
}

function workletModuleIds(root: string): string[] {
  const path = resolve(root, WORKLET_METAFILE);
  if (!existsSync(path)) throw new Error(`${WORKLET_METAFILE} がありません。先に pnpm worklet を実行してください`);
  const meta = JSON.parse(readFileSync(path, "utf8")) as { inputs: Record<string, unknown> };
  return Object.keys(meta.inputs).map((input) => resolve(root, input));
}

export function thirdPartyNotices(): Plugin {
  let root = process.cwd();
  return {
    name: "third-party-notices",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle() {
      const moduleIds = [...this.getModuleIds(), ...workletModuleIds(root)];
      this.emitFile({
        type: "asset",
        fileName: NOTICES_FILE_NAME,
        source: renderNotices([...collectEntries(moduleIds, root), ...referencedEntries(root)]),
      });
    },
  };
}
