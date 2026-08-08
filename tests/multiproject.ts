// 複数プロジェクト管理のスモークテスト (node で直接実行)
import {
  projects,
  currentProjectId,
  newProjectInTab,
  switchProject,
  closeProject,
  openProjectInTab,
} from "../src/state/projects";
import { doc, units, addUnit, setTempo, exportBytes, ensureInit, toggleUnitSolo, toggleUnitMute, removeUnit, addWoice, WoiceType } from "../src/state/project";
import * as serviceMod from "../src/state/service";
import { undo, redo, canUndo, canRedo } from "../src/state/undo";
import { player, isPlaying, masterVolume } from "../src/state/player";
import { parseThemeCss, mergeTokens, buildThemeCss } from "../src/lib/themeParse";

let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name} ${detail}`);
  }
}

// ---- 1. 初期プロジェクト ----
newProjectInTab();
check("初期プロジェクトが1つ", projects.value.length === 1);
check("currentProjectId が最初のタブ", currentProjectId.value === projects.value[0]!.id);
check("doc.ready", doc.ready === true);

// ---- 2. 編集 + タブ間の独立 ----
addUnit("A");
check("ユニット追加で units=1", units.value.length === 1, `len=${units.value.length}`);
setTempo(180);
check("テンポ変更", exportBytes() !== null);
const p1Id = currentProjectId.value;
const savedScroll = 12345;
doc.scrollX = savedScroll;
check("undo が積まれる", canUndo.value === true);

const p2 = newProjectInTab();
check("2タブ目が開く", projects.value.length === 2);
check("2タブ目はユニット0個", units.value.length === 0, `len=${units.value.length}`);
check("2タブ目は undo 空", canUndo.value === false && canRedo.value === false);
check("2タブ目 scrollX リセット", doc.scrollX === 0);

// ---- 3. タブ切替で状態が復元される ----
switchProject(p1Id);
check("1タブ目へ切替: units=1", units.value.length === 1);
check("1タブ目 scrollX 復元", doc.scrollX === savedScroll, `scrollX=${doc.scrollX}`);
check("1タブ目 undo 復元", canUndo.value === true);

// ---- 4. タブごとの undo 独立 ----
undo(); // setTempo を戻す → 1 unit
check("1タブ目 undo#1 → units=1", units.value.length === 1, `len=${units.value.length}`);
undo(); // addUnit を戻す → 0 unit
check("1タブ目 undo#2 → units=0", units.value.length === 0, `len=${units.value.length}`);
check("1タブ目 redo が積まれる", canRedo.value === true);
redo();
check("1タブ目 redo → units=1", units.value.length === 1);
switchProject(p2.id);
check("2タブ目 undo は空のまま", canUndo.value === false, `canUndo=${canUndo.value}`);
switchProject(p1Id);
check("1タブ目 undo/redo 復元", canUndo.value === true && canRedo.value === true);

// ---- 5. タブ1に追加 → タブ2はそのまま ----
addUnit("B");
check("1タブ目 units=2 (A,B)", units.value.length === 2, `len=${units.value.length}`);
const bytes = exportBytes();
check("bytes 取得", bytes !== null);
switchProject(p2.id);
check("2タブ目 units=0 のまま", units.value.length === 0);

// ---- 6. openProjectInTab ----
const p3err = openProjectInTab(bytes!, "my-song");
check("open で新タブ (エラーなし)", p3err === null, `err=${p3err}`);
const p3Id = currentProjectId.value;
check("3タブ目に2ユニット復元", units.value.length === 2, `len=${units.value.length}`);
check("タブ名がファイル名になる", doc.fileName === "my-song", `fileName=${doc.fileName}`);
check(
  "タブ表示用の名前も設定される",
  projects.value.find((p) => p.id === p3Id)?.fileName === "my-song",
);
check("テンポ復元 (120)", serviceMod.service.master.beatTempo === 120, `tempo=${serviceMod.service.master.beatTempo}`);
check("タブ数 3", projects.value.length === 3);

// ---- 7. タブごとの undo 独立 (追加分) ----
switchProject(p1Id);
check("1タブ目 units=2 に戻る", units.value.length === 2, `len=${units.value.length}`);
addUnit("C");
check("1タブ目 units=3 (A,B,C)", units.value.length === 3, `len=${units.value.length}`);
undo();
check("1タブ目 undo → units=2", units.value.length === 2);
switchProject(p2.id);
check("2タブ目 undo は空のまま", canUndo.value === false);
switchProject(p1Id);
check("1タブ目 undo 復元 (true)", canUndo.value === true);

// ---- 8. closeProject ----
closeProject(p3Id);
check("閉じると 2タブ", projects.value.length === 2);
check("非アクティブを閉じても現在タブは p1", currentProjectId.value === p1Id);
check("最後の1つは閉じられない", (() => {
  for (let i = 0; i < 10; i++) closeProject(projects.value[0]!.id);
  return projects.value.length === 1;
})());
check("残ったタブは 1つ (p2)", currentProjectId.value === p2.id);
check("p2 は units=0", units.value.length === 0);

// ---- 9. ソロ ----
addUnit("A");
addUnit("B");
addUnit("C");
check("ソロ前 units=3", units.value.length === 3, `len=${units.value.length}`);
toggleUnitSolo(1);
check("ソロON: soloUnit=1", doc.soloUnit === 1);
check("ソロON: 他2ユニットがミュート", doc.muted.length === 2 && !doc.muted.includes(1));
check("ソロON: 対象ユニットはミュート外", units.value[1]?.soloed === true);
toggleUnitSolo(1);
check("ソロOFF: soloUnit=-1", doc.soloUnit === -1);
check("ソロOFF: ミュート全解除", doc.muted.length === 0);
toggleUnitSolo(0);
check("別ユニットへソロ切替", doc.soloUnit === 0 && doc.muted.includes(1) && doc.muted.includes(2));
// タブ切替でソロも独立
const soloP2 = doc.soloUnit;
newProjectInTab();
check("新タブはソロなし", doc.soloUnit === -1);
switchProject(p2.id);
check("元のタブのソロが復元", doc.soloUnit === soloP2);

// ---- 10. ソロ解除で元のミュート状態を復元 ----
// ユニット0をミュート → ユニット1をソロ → 解除 → ユニット0だけミュートのまま
toggleUnitMute(0);
check("手動ミュート: unit0のみ", doc.muted.length === 1 && doc.muted[0] === 0);
toggleUnitSolo(1);
check("ソロ中: muted は solo 由来", doc.muted.length === 2 && !doc.muted.includes(1));
toggleUnitSolo(1);
check("ソロ解除: unit0 のミュートが復元", doc.muted.length === 1 && doc.muted[0] === 0, `muted=${doc.muted}`);
check("ソロ解除: soloBackup は空", doc.soloBackup.length === 0);
// ソロ中に手動ミュート変更 → ソロ解除 + 変更が反映
toggleUnitSolo(2);
check("再ソロ: soloBackup に unit0 が保存", doc.soloBackup.length === 1 && doc.soloBackup[0] === 0);
toggleUnitMute(0); // ソロ中に unit0 を再生に → ソロ解除、unit0 のみミュート解除
check("ソロ中のミュート変更: ソロ解除", doc.soloUnit === -1);
check("ソロ中のミュート変更: unit0 ミュート解除が反映", !doc.muted.includes(0) && doc.muted.length === 0, `muted=${doc.muted}`);

// ---- 10b. ソロの直接切替では元のバックアップを保持 ----
toggleUnitMute(0);
check("切替前: unit0 のみミュート", doc.muted.length === 1 && doc.muted[0] === 0);
toggleUnitSolo(1);
toggleUnitSolo(2); // ソロ中に直接切替
check("切替中: soloUnit=2", doc.soloUnit === 2);
check("切替中: backup は元のまま", doc.soloBackup.length === 1 && doc.soloBackup[0] === 0);
toggleUnitSolo(2); // 解除
check("切替後解除: unit0 のミュートが復元", doc.muted.length === 1 && doc.muted[0] === 0, `muted=${doc.muted}`);

// ---- 11. ユニット削除・並べ替えでソロ/ミュートが追従 ----
toggleUnitSolo(1);
check("削除前: soloUnit=1", doc.soloUnit === 1);
removeUnit(0); // 削除で index がずれる
check("他ユニット削除: soloUnit が 0 に追従", doc.soloUnit === 0, `soloUnit=${doc.soloUnit}`);
check("他ユニット削除: muted は残りの1ユニットのみ", doc.muted.length === 1 && doc.muted[0] === 1);
toggleUnitSolo(0);
removeUnit(0); // ソロ対象の削除 → ソロ解除 + backup 復元 (空)
check("ソロ対象削除: soloUnit=-1", doc.soloUnit === -1);
check("ソロ対象削除: muted は空", doc.muted.length === 0);

// ---- 12. 再生中のミュート/ソロ変更が worklet に反映される ----
(async () => {
  const mutedCalls: number[][] = [];
  const orig = player.setMutedUnits;
  player.setMutedUnits = (u: number[]) => {
    mutedCalls.push([...u]);
  };
  isPlaying.value = true;
  addUnit("D"); // 2ユニットにしてソロ対象を作る
  toggleUnitMute(0);
  await new Promise((r) => setTimeout(r, 10));
  const callsAfterMute = mutedCalls.length;
  check("再生中のミュート変更が worklet に反映", callsAfterMute >= 1 && mutedCalls.at(-1)?.includes(0), `calls=${mutedCalls.length}`);
  toggleUnitSolo(0);
  await new Promise((r) => setTimeout(r, 10));
  check("再生中のソロ変更が worklet に反映", mutedCalls.length > callsAfterMute && mutedCalls.at(-1)?.length === 1, `calls=${JSON.stringify(mutedCalls)}`);
  isPlaying.value = false;
  player.setMutedUnits = orig;

  // ---- 13. 単音プレビュー停止時にリリースフェードがかかる ----
  {
    // 有効な PCM 音色 (WAV 形式) を手組みして追加する
    const data = new Int16Array(4410);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.sin((i / 4410) * 2 * Math.PI * 100) * 8000);
    const dataSize = data.length * 2;
    const pcm = new Uint8Array(44 + dataSize);
    const dv = new DataView(pcm.buffer);
    pcm.set([82, 73, 70, 70], 0); // "RIFF"
    dv.setUint32(4, 36 + dataSize, true);
    pcm.set([87, 65, 86, 69], 8); // "WAVE"
    pcm.set([102, 109, 116, 32], 12); // "fmt "
    dv.setUint32(16, 16, true); // fmt chunk size
    dv.setUint16(20, 1, true); // formatID (PCM)
    dv.setUint16(22, 1, true); // ch
    dv.setUint32(24, 44100, true); // sps
    dv.setUint32(28, 88200, true); // byteRate
    dv.setUint16(32, 2, true); // blockAlign
    dv.setUint16(34, 16, true); // bps
    pcm.set([100, 97, 116, 97], 36); // "data"
    dv.setUint32(40, dataSize, true);
    new Int16Array(pcm.buffer, 44, data.length).set(data);

    interface RampRec {
      v: number;
      t: number;
    }
    // AudioContext をモックして stopPreview の挙動を検証する
    class MockAudioContext {
      static instances: MockAudioContext[] = [];
      sampleRate = 44100;
      state = "running";
      currentTime = 100;
      destination: unknown = {};
      lastSource: { stopTime?: number; stop: (t?: number) => void } | null = null;
      lastGain: { gain: { value: number; setTargetAtTime: (v: number) => void } } | null = null;
      ramp: RampRec | null = null;
      constructor() {
        MockAudioContext.instances.push(this);
      }
      resume(): void {
        /* noop */
      }
      createBuffer(): { getChannelData: () => Float32Array } {
        return { getChannelData: () => new Float32Array(0) };
      }
      createBufferSource() {
        const s = {
          connect(): void { /* noop */ },
          start(): void { /* noop */ },
          onended: null as (() => void) | null,
          stop: (t?: number) => { s.stopTime = t; },
          stopTime: undefined as number | undefined,
        };
        this.lastSource = s;
        return s;
      }
      createGain() {
        const gain = {
          value: 1,
          setValueAtTime(): void { /* noop */ },
          linearRampToValueAtTime(v: number, t: number): void {
            if (v === 0) this._ctx.ramp = { v, t };
          },
          setTargetAtTime(v: number): void {
            this.value = v;
          },
          cancelScheduledValues(): void { /* noop */ },
          _ctx: this,
        };
        this.lastGain = { gain };
        return { gain, connect(): void { /* noop */ } };
      }
    }

    const addWoiceRes = addWoice(pcm, WoiceType.PCM);
    check("プレビュー用のPCM音色を追加", addWoiceRes === null, `err=${addWoiceRes}`);
    const p = await import("../src/engine/preview");
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;
    // モジュール内の previewCtx キャッシュは初回呼び出しで作られる
    masterVolume.value = 0.5;
    p.previewUnitHold(0, 0x6000, 104);
    const mock = MockAudioContext.instances.at(-1)!;
    check("プレビュー開始で hold ソース作成", mock.lastSource !== null, `instances=${MockAudioContext.instances.length}`);
    check("プレビューの音量にマスター音量が適用", mock.lastGain?.gain.value === 0.5, `value=${mock.lastGain?.gain.value}`);
    masterVolume.value = 0.8;
    await new Promise((r) => setTimeout(r, 10));
    check("音量変更がサステイン中のプレビューに反映", mock.lastGain?.gain.value === 0.8, `value=${mock.lastGain?.gain.value}`);
    masterVolume.value = 1.0;
    p.stopPreview();
    check(
      "停止時: gain を 0 へランプ (リリースフェード)",
      mock.ramp !== null && mock.ramp.v === 0,
      `ramp=${JSON.stringify(mock.ramp)}`,
    );
    check(
      "停止時: ランプ完了後に stop が予約される",
      mock.lastSource?.stopTime !== undefined &&
        mock.ramp !== null &&
        mock.lastSource.stopTime >= mock.ramp.t,
      `stopTime=${mock.lastSource?.stopTime} rampT=${mock.ramp?.t}`,
    );
  }

  // ---- 14. 初期プロジェクトのみのとき、開くで置き換える ----
  {
    while (projects.value.length > 1) closeProject(projects.value[0]!.id);
    const cur = projects.value[0]!;
    cur.initial = true;
    doc.dirty = false;
    doc.fileName = "";
    const bytes = exportBytes();
    check("置き換えテスト用の bytes 取得", bytes !== null);
    const before = projects.value.length;
    const err = openProjectInTab(bytes!, "replaced");
    check("初期プロジェクトのみなら置き換え (タブ数1のまま)", err === null && projects.value.length === before, `len=${projects.value.length} err=${err}`);
    check("置き換え後: ファイル名が付く", doc.fileName === "replaced", `fileName=${doc.fileName}`);
    // 編集済みなら置き換えずタブを追加する
    projects.value[0]!.initial = true;
    addUnit("X"); // dirty にする
    const n = projects.value.length;
    openProjectInTab(bytes!, "second");
    check("編集済みなら置き換えない (タブ追加)", projects.value.length === n + 1, `len=${projects.value.length}`);
    closeProject(currentProjectId.value);
  }

  // ---- 15. themeParse (ジェネレーターCSS → トークンマップ) ----
  {
    // Tailwind ディレクティブ付きの shadcn ジェネレーター出力
    const gen = `@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
:root {
  --background: oklch(1 0 0);
  --primary: oklch(0.514 0.222 16.935);
  --radius: 0.625rem;
  --font-sans: "Inter", sans-serif;
  --shadow-sm: 0px 1px 2px hsl(0 0% 0% / 0.1);
}
.dark {
  --background: oklch(0.148 0 0);
  --primary: oklch(0.702 0.2 45);
  --radius: 0.5rem;
  --font-sans: "Inter", sans-serif;
}
@theme inline {
  --color-background: var(--background);
}
@layer base {
  * { @apply border-border; }
}`;
    const t = parseThemeCss(gen);
    check("ジェネレーターCSSをパース", t !== null);
    check("light トークン抽出", t?.light["--background"] === "oklch(1 0 0)" && t?.light["--primary"] === "oklch(0.514 0.222 16.935)");
    check("dark トークン抽出", t?.dark["--background"] === "oklch(0.148 0 0)");
    check("--font-* は除外", !("--font-sans" in (t?.light ?? {})) && !("--font-sans" in (t?.dark ?? {})));
    check("@theme/@layer の変数は除外", !("--color-background" in (t?.light ?? {})));
    check("shadow 等の関数値は保持", t?.light["--shadow-sm"]?.startsWith("0px 1px 2px"));

    // 素の :root/.dark (rose 形式)
    const plain = parseThemeCss(":root { --background: oklch(1 0 0); }\n.dark { --background: oklch(0.5 0 0); }");
    check("素の :root/.dark をパース", plain?.light["--background"] === "oklch(1 0 0)" && plain?.dark["--background"] === "oklch(0.5 0 0)");

    // サニタイズ: インジェクション拒否
    const evil = parseThemeCss(`:root { --background: oklch(1 0 0); --x: url("https://evil/"); --y: red; --z: }bad; }`);
    check("url() を拒否", evil !== null && !("--x" in evil.light));
    check("不正構造を拒否", !("--z" in (evil?.light ?? {})));

    // マージ (未定義トークンはベースから継承)
    const base = parseThemeCss(":root { --background: oklch(0 0 0); --btn-bg: red; }\n.dark { --background: oklch(1 0 0); }")!;
    const merged = mergeTokens(base, t!);
    check("マージ: テーマ側が優先", merged.light["--background"] === "oklch(1 0 0)");
    check("マージ: 未定義はベースから継承", merged.light["--btn-bg"] === "red");
    check("マージ: dark も適用", merged.dark["--background"] === "oklch(0.148 0 0)");
    check("マージ: dark の未定義は空", merged.dark["--btn-bg"] === undefined);

    // スコープ付き CSS 生成
    const css = buildThemeCss("test-x", merged);
    check("注入CSS: ライトスコープ", css.includes(':root[data-theme="test-x"]') && css.includes("--background: oklch(1 0 0);"));
    check("注入CSS: ダークスコープ", css.includes('.dark[data-theme="test-x"]') && css.includes("--background: oklch(0.148 0 0);"));
  }

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})();
