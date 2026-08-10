// 複数プロジェクト管理のスモークテスト (node で直接実行)
import {
  projects,
  currentProjectId,
  newProjectInTab,
  switchProject,
  closeProject,
  openProjectInTab,
} from "../src/state/projects";
import {
  doc,
  units,
  addUnit,
  setTempo,
  exportBytes,
  ensureInit,
  toggleUnitSolo,
  toggleUnitMute,
  removeUnit,
  addWoice,
  WoiceType,
  copyMeas,
  changeEventValue,
  addUnitWithWoice,
  setUnitNameAndWoice,
  getAllEvents,
  sync,
  setPlayStart,
  setPlayEnd,
} from "../src/state/project";
import * as serviceMod from "../src/state/service";
import { undo, redo, canUndo, canRedo } from "../src/state/undo";
import { player, isPlaying, masterVolume, loop } from "../src/state/player";
import { parseThemeCss, mergeTokens, buildThemeCss } from "../src/lib/themeParse";
import {
  voices,
  currentVoiceId,
  newVoice,
  openVoice,
  closeVoice,
  switchVoice,
  currentVoice,
  editVoice,
  undoVoice,
  redoVoice,
  createDefaultWoice,
} from "../src/state/voice";
import {
  noises,
  currentNoiseId,
  newNoise,
  openNoise,
  closeNoise,
  switchNoise,
  currentNoise,
  editNoise,
  undoNoise,
  redoNoise,
  createDefaultNoise,
} from "../src/state/noise";
import { renderWoice, renderNoise } from "../src/engine/preview";
import { MemoryIo, VoiceType, WaveType, EventKind } from "pxtone-ts";

let failed = 0;
function fail(name: string, detail = ""): void {
  failed++;
  console.log(`FAIL ${name}${detail ? ` ${detail}` : ""}`);
}

// 条件チェック (失敗時は detail を表示)
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`ok   ${name}`);
  else fail(name, detail);
}

// 値の等価チェック (失敗時に期待値と実測値を必ず表示する)
function checkEq<T>(actual: T, expected: T, name: string): void {
  if (actual === expected) console.log(`ok   ${name}`);
  else fail(name, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

// 有効な PCM 音色 (WAV 形式) を手組みして生成する
function buildPcmWav(): Uint8Array {
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
  return pcm;
}

// ---- 1. 初期プロジェクト ----
newProjectInTab();
checkEq(projects.value.length, 1, "初期プロジェクトが1つ");
checkEq(currentProjectId.value, projects.value[0]!.id, "currentProjectId が最初のタブ");
checkEq(doc.ready, true, "doc.ready");

// ---- 2. 編集 + タブ間の独立 ----
addUnit("A");
checkEq(units.value.length, 1, "ユニット追加で units=1");
setTempo(180);
check("テンポ変更", exportBytes() !== null);
const p1Id = currentProjectId.value;
const savedScroll = 12345;
doc.scrollX = savedScroll;
checkEq(canUndo.value, true, "undo が積まれる");

const p2 = newProjectInTab();
checkEq(projects.value.length, 2, "2タブ目が開く");
checkEq(units.value.length, 0, "2タブ目はユニット0個");
checkEq(canUndo.value, false, "2タブ目は undo 空");
checkEq(canRedo.value, false, "2タブ目は redo 空");
checkEq(doc.scrollX, 0, "2タブ目 scrollX リセット");

// ---- 3. タブ切替で状態が復元される ----
switchProject(p1Id);
checkEq(units.value.length, 1, "1タブ目へ切替: units=1");
checkEq(doc.scrollX, savedScroll, "1タブ目 scrollX 復元");
checkEq(canUndo.value, true, "1タブ目 undo 復元");

// ---- 4. タブごとの undo 独立 ----
undo(); // setTempo を戻す → 1 unit
checkEq(units.value.length, 1, "1タブ目 undo#1 → units=1");
undo(); // addUnit を戻す → 0 unit
checkEq(units.value.length, 0, "1タブ目 undo#2 → units=0");
checkEq(canRedo.value, true, "1タブ目 redo が積まれる");
redo();
checkEq(units.value.length, 1, "1タブ目 redo → units=1");
switchProject(p2.id);
checkEq(canUndo.value, false, "2タブ目 undo は空のまま");
switchProject(p1Id);
checkEq(canUndo.value, true, "1タブ目 undo 復元");
checkEq(canRedo.value, true, "1タブ目 redo 復元");

// ---- 5. タブ1に追加 → タブ2はそのまま ----
addUnit("B");
checkEq(units.value.length, 2, "1タブ目 units=2 (A,B)");
const bytes = exportBytes();
check("bytes 取得", bytes !== null);
switchProject(p2.id);
checkEq(units.value.length, 0, "2タブ目 units=0 のまま");

// ---- 6. openProjectInTab ----
const p3err = openProjectInTab(bytes!, "my-song");
checkEq(p3err, null, "open で新タブ (エラーなし)");
const p3Id = currentProjectId.value;
checkEq(units.value.length, 2, "3タブ目に2ユニット復元");
checkEq(doc.fileName, "my-song", "タブ名がファイル名になる");
checkEq(
  projects.value.find((p) => p.id === p3Id)?.fileName,
  "my-song",
  "タブ表示用の名前も設定される",
);
checkEq(serviceMod.service.master.beatTempo, 120, "テンポ復元 (120)");
checkEq(projects.value.length, 3, "タブ数 3");

// ---- 7. タブごとの undo 独立 (追加分) ----
switchProject(p1Id);
checkEq(units.value.length, 2, "1タブ目 units=2 に戻る");
addUnit("C");
checkEq(units.value.length, 3, "1タブ目 units=3 (A,B,C)");
undo();
checkEq(units.value.length, 2, "1タブ目 undo → units=2");
switchProject(p2.id);
checkEq(canUndo.value, false, "2タブ目 undo は空のまま");
switchProject(p1Id);
checkEq(canUndo.value, true, "1タブ目 undo 復元 (true)");

// ---- 8. closeProject ----
closeProject(p3Id);
checkEq(projects.value.length, 2, "閉じると 2タブ");
checkEq(currentProjectId.value, p1Id, "非アクティブを閉じても現在タブは p1");
check("最後の1つは閉じられない", (() => {
  for (let i = 0; i < 10; i++) closeProject(projects.value[0]!.id);
  return projects.value.length === 1;
})());
checkEq(currentProjectId.value, p2.id, "残ったタブは 1つ (p2)");
checkEq(units.value.length, 0, "p2 は units=0");

// ---- 9. ソロ ----
addUnit("A");
addUnit("B");
addUnit("C");
checkEq(units.value.length, 3, "ソロ前 units=3");
toggleUnitSolo(1);
checkEq(doc.soloUnit, 1, "ソロON: soloUnit=1");
checkEq(doc.muted.length, 2, "ソロON: 他2ユニットがミュート");
check("ソロON: 対象ユニットはミュート外", !doc.muted.includes(1), `muted=${doc.muted}`);
checkEq(units.value[1]?.soloed, true, "ソロON: ソロ対象のフラグ");
toggleUnitSolo(1);
checkEq(doc.soloUnit, -1, "ソロOFF: soloUnit=-1");
checkEq(doc.muted.length, 0, "ソロOFF: ミュート全解除");
toggleUnitSolo(0);
checkEq(doc.soloUnit, 0, "別ユニットへソロ切替");
check("別ユニットへソロ切替: unit1 がミュート", doc.muted.includes(1), `muted=${doc.muted}`);
check("別ユニットへソロ切替: unit2 がミュート", doc.muted.includes(2), `muted=${doc.muted}`);
// タブ切替でソロも独立
const soloP2 = doc.soloUnit;
newProjectInTab();
checkEq(doc.soloUnit, -1, "新タブはソロなし");
switchProject(p2.id);
checkEq(doc.soloUnit, soloP2, "元のタブのソロが復元");

// ---- 10. ソロ解除で元のミュート状態を復元 ----
// ユニット0をミュート → ユニット1をソロ → 解除 → ユニット0だけミュートのまま
toggleUnitMute(0);
checkEq(doc.muted.length, 1, "手動ミュート: unit0のみ");
checkEq(doc.muted[0], 0, "手動ミュート: 対象は unit0");
toggleUnitSolo(1);
checkEq(doc.muted.length, 2, "ソロ中: muted は solo 由来");
check("ソロ中: 対象ユニットはミュート外", !doc.muted.includes(1), `muted=${doc.muted}`);
toggleUnitSolo(1);
checkEq(doc.muted.length, 1, "ソロ解除: unit0 のミュートが復元");
checkEq(doc.muted[0], 0, "ソロ解除: 残るのは unit0");
checkEq(doc.soloBackup.length, 0, "ソロ解除: soloBackup は空");
// ソロ中に手動ミュート変更 → ソロ解除 + 変更が反映
toggleUnitSolo(2);
checkEq(doc.soloBackup.length, 1, "再ソロ: soloBackup に unit0 が保存");
checkEq(doc.soloBackup[0], 0, "再ソロ: バックアップ対象は unit0");
toggleUnitMute(0); // ソロ中に unit0 を再生に → ソロ解除、unit0 のみミュート解除
checkEq(doc.soloUnit, -1, "ソロ中のミュート変更: ソロ解除");
checkEq(doc.muted.length, 0, "ソロ中のミュート変更: unit0 ミュート解除が反映");

// ---- 10b. ソロの直接切替では元のバックアップを保持 ----
toggleUnitMute(0);
checkEq(doc.muted.length, 1, "切替前: unit0 のみミュート");
checkEq(doc.muted[0], 0, "切替前: 対象は unit0");
toggleUnitSolo(1);
toggleUnitSolo(2); // ソロ中に直接切替
checkEq(doc.soloUnit, 2, "切替中: soloUnit=2");
checkEq(doc.soloBackup.length, 1, "切替中: backup は元のまま");
checkEq(doc.soloBackup[0], 0, "切替中: backup 対象は unit0");
toggleUnitSolo(2); // 解除
checkEq(doc.muted.length, 1, "切替後解除: unit0 のミュートが復元");
checkEq(doc.muted[0], 0, "切替後解除: 残るのは unit0");

// ---- 11. ユニット削除・並べ替えでソロ/ミュートが追従 ----
toggleUnitSolo(1);
checkEq(doc.soloUnit, 1, "削除前: soloUnit=1");
removeUnit(0); // 削除で index がずれる
checkEq(doc.soloUnit, 0, "他ユニット削除: soloUnit が 0 に追従");
checkEq(doc.muted.length, 1, "他ユニット削除: muted は残りの1ユニットのみ");
checkEq(doc.muted[0], 1, "他ユニット削除: 残るのは unit1");
toggleUnitSolo(0);
removeUnit(0); // ソロ対象の削除 → ソロ解除 + backup 復元 (空)
checkEq(doc.soloUnit, -1, "ソロ対象削除: soloUnit=-1");
checkEq(doc.muted.length, 0, "ソロ対象削除: muted は空");

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
    const pcm = buildPcmWav();

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
    checkEq(addWoiceRes, null, "プレビュー用のPCM音色を追加");
    const p = await import("../src/engine/preview");
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;
    // モジュール内の previewCtx キャッシュは初回呼び出しで作られる
    masterVolume.value = 0.5;
    p.previewUnitHold(0, 0x6000, 104);
    const mock = MockAudioContext.instances.at(-1)!;
    check("プレビュー開始で hold ソース作成", mock.lastSource !== null, `instances=${MockAudioContext.instances.length}`);
    checkEq(mock.lastGain?.gain.value, 0.5, "プレビューの音量にマスター音量が適用");
    masterVolume.value = 0.8;
    await new Promise((r) => setTimeout(r, 10));
    checkEq(mock.lastGain?.gain.value, 0.8, "音量変更がサステイン中のプレビューに反映");
    masterVolume.value = 1.0;
    p.stopPreview();
    check("停止時: gain を 0 へランプ (リリースフェード)", mock.ramp !== null && mock.ramp.v === 0, `ramp=${JSON.stringify(mock.ramp)}`);
    check("停止時: stop が予約される", mock.lastSource?.stopTime !== undefined, `stopTime=${mock.lastSource?.stopTime}`);
    check(
      "停止時: ランプ完了後に stop が予約される",
      mock.ramp !== null && mock.lastSource?.stopTime !== undefined && mock.lastSource.stopTime >= mock.ramp.t,
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
    checkEq(err, null, "初期プロジェクトのみなら置き換え (エラーなし)");
    checkEq(projects.value.length, before, "初期プロジェクトのみなら置き換え (タブ数1のまま)");
    checkEq(doc.fileName, "replaced", "置き換え後: ファイル名が付く");
    // 編集済みなら置き換えずタブを追加する
    projects.value[0]!.initial = true;
    addUnit("X"); // dirty にする
    const n = projects.value.length;
    openProjectInTab(bytes!, "second");
    checkEq(projects.value.length, n + 1, "編集済みなら置き換えない (タブ追加)");
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
    checkEq(t?.light["--background"], "oklch(1 0 0)", "light トークン抽出: --background");
    checkEq(t?.light["--primary"], "oklch(0.514 0.222 16.935)", "light トークン抽出: --primary");
    checkEq(t?.dark["--background"], "oklch(0.148 0 0)", "dark トークン抽出");
    check("--font-* は除外 (light)", !("--font-sans" in (t?.light ?? {})));
    check("--font-* は除外 (dark)", !("--font-sans" in (t?.dark ?? {})));
    check("@theme/@layer の変数は除外", !("--color-background" in (t?.light ?? {})));
    check("--shadow* は拒否 (ベースから継承)", !("--shadow-sm" in (t?.light ?? {})) && !("--shadow" in (t?.light ?? {})));

    // 素の :root/.dark (rose 形式)
    const plain = parseThemeCss(":root { --background: oklch(1 0 0); }\n.dark { --background: oklch(0.5 0 0); }");
    checkEq(plain?.light["--background"], "oklch(1 0 0)", "素の :root/.dark をパース (light)");
    checkEq(plain?.dark["--background"], "oklch(0.5 0 0)", "素の :root/.dark をパース (dark)");

    // サニタイズ: インジェクション拒否
    const evil = parseThemeCss(`:root { --background: oklch(1 0 0); --x: url("https://evil/"); --y: red; --z: }bad; }`);
    check("url() を拒否", evil !== null && !("--x" in evil.light));
    check("不正構造を拒否", !("--z" in (evil?.light ?? {})));

    // マージ (未定義トークンはベースから継承)
    const base = parseThemeCss(":root { --background: oklch(0 0 0); --btn-bg: red; }\n.dark { --background: oklch(1 0 0); }")!;
    const merged = mergeTokens(base, t!);
    checkEq(merged.light["--background"], "oklch(1 0 0)", "マージ: テーマ側が優先");
    checkEq(merged.light["--btn-bg"], "red", "マージ: 未定義はベースから継承");
    checkEq(merged.dark["--background"], "oklch(0.148 0 0)", "マージ: dark も適用");
    checkEq(merged.dark["--btn-bg"], undefined, "マージ: dark の未定義は空");

    // スコープ付き CSS 生成
    const css = buildThemeCss("test-x", merged);
    check("注入CSS: ライトスコープ", css.includes(':root[data-theme="test-x"]') && css.includes("--background: oklch(1 0 0);"));
    check("注入CSS: ダークスコープ", css.includes('.dark[data-theme="test-x"]') && css.includes("--background: oklch(0.148 0 0);"));
  }

  // ---- 16. 小節コピー / イベント音量 / ユニット追加 ----
  {
    const s = serviceMod.service;
    // イベントを用意 (unit0 に clock 0 で KEY+VELOCITY+ON, unit1 に clock 240 で VELOCITY)
    doc.selectedUnits = [];
    doc.focusUnit = -1;
    s.evels.clear();
    s.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    s.evels.recordAddI(0, 0, EventKind.VELOCITY, 64);
    s.evels.recordAddI(0, 0, EventKind.ON, 480);
    s.evels.recordAddI(240, 1, EventKind.VELOCITY, 80);
    doc.selectedUnits = [0, 1];

    // 小節コピー: [0, 480) を clock 960 に 2 回
    copyMeas(0, 480, 960, 2, [EventKind.ON, EventKind.VELOCITY]);
    const events = getAllEvents();
    const at = (clock: number, unitNo: number, kind: EventKind): boolean =>
      events.some((e) => e.clock === clock && e.unitNo === unitNo && e.kind === kind);
    check("コピー: 対象ユニットのイベントがコピーされる", at(960, 0, EventKind.VELOCITY));
    check("コピー: 種類フィルタ (KEY はコピーされない)", !at(960, 0, EventKind.KEY));
    check("コピー: 1回分ペースト (clock 960)", at(960, 0, EventKind.ON));
    check("コピー: 2回分ペースト (clock 1440)", at(1440, 0, EventKind.ON));
    check("コピー: 対象外ユニットはコピーされない", !at(960, 1, EventKind.VELOCITY));

    // イベント音量 (加算 + クランプ)
    changeEventValue(0, 960, EventKind.VELOCITY, 100);
    const vel = getAllEvents().find((e) => e.clock === 0 && e.kind === EventKind.VELOCITY);
    checkEq(vel?.value, 128, "音量加算: 64+100 が 128 にクランプ");

    // ユニット追加 (名前 + 音色)。音色変更の検証用に音色を 2 個以上にしておく
    while (serviceMod.service.woiceNum < 2) addWoice(buildPcmWav(), WoiceType.PCM);
    const wIdx = serviceMod.service.woiceNum - 1;
    const added = addUnitWithWoice("u-テスト", wIdx);
    checkEq(added, true, "addUnitWithWoice: 追加される");
    const last = serviceMod.service.unitGet(serviceMod.service.unitNum - 1);
    checkEq(last?.name, "u-テスト", "addUnitWithWoice: 名前が付く");
    checkEq(last?.woice, serviceMod.service.woiceGet(wIdx), "addUnitWithWoice: 音色が割り当てられる");
    // 再生は VOICENO イベントから音色を決定するため、clock 0 に割当が書かれる
    const vnOf = (u: number) => getAllEvents().filter((e) => e.unitNo === u && e.kind === EventKind.VOICENO);
    checkEq(vnOf(serviceMod.service.unitNum - 1).at(-1)?.value, wIdx, "addUnitWithWoice: clock 0 に VOICENO が書かれる");

    // ユニット名と音色の変更 (まとめて 1 undo エントリ)
    const ui2 = serviceMod.service.unitNum - 1;
    const wIdx2 = wIdx - 1;
    setUnitNameAndWoice(ui2, "u-変更", wIdx2);
    const changed = serviceMod.service.unitGet(ui2);
    checkEq(changed?.name, "u-変更", "setUnitNameAndWoice: 名前が変わる");
    checkEq(changed?.woice, serviceMod.service.woiceGet(wIdx2), "setUnitNameAndWoice: 音色が変わる");
    checkEq(vnOf(ui2).at(-1)?.value, wIdx2, "setUnitNameAndWoice: 最後の VOICENO が新音色になる");
    // 空文字の名前では名前を変更しない
    const prevName = changed?.name;
    setUnitNameAndWoice(ui2, "  ", wIdx2);
    checkEq(serviceMod.service.unitGet(ui2)?.name, prevName, "setUnitNameAndWoice: 空名前は変更しない");
    // 既存の VOICENO はすべて新音色に書き換わる
    serviceMod.service.evels.recordAddI(240, ui2, EventKind.VOICENO, wIdx);
    serviceMod.service.evels.recordAddI(960, ui2, EventKind.VOICENO, wIdx);
    setUnitNameAndWoice(ui2, "", wIdx2);
    const vns = vnOf(ui2);
    check(
      "setUnitNameAndWoice: 全 VOICENO が新音色に書き換わる",
      vns.length >= 3 && vns.every((e) => e.value === wIdx2),
      `values=${JSON.stringify(vns.map((e) => e.value))}`,
    );
  }

  // ---- 17. VOICENO イベントからの音色解決 / Start-End 状態 ----
  {
    // 音色を割り当てず VOICENO イベントだけのユニット (開いた直後相当)
    const wIdx = serviceMod.service.woiceNum - 1;
    addUnit("VoiceNoOnly");
    const ui = serviceMod.service.unitNum - 1;
    serviceMod.service.evels.recordAddI(0, ui, EventKind.VOICENO, wIdx);
    sync();
    checkEq(units.value.at(-1)?.woiceIndex, wIdx, "VOICENO から音色が解決される");
    // 範囲外の VOICENO は -1 になる
    serviceMod.service.evels.recordAddI(0, ui, EventKind.VOICENO, 999);
    sync();
    checkEq(units.value.at(-1)?.woiceIndex, -1, "範囲外 VOICENO は -1");

    // Start/End 状態
    checkEq(doc.playStart, -1, "playStart 初期値 -1");
    checkEq(doc.playEnd, -1, "playEnd 初期値 -1");
    serviceMod.service.master.setMeasNum(16); // クランプ検証のため小節数を拡大
    setPlayStart(2);
    setPlayEnd(5);
    checkEq(doc.playStart, 2, "setPlayStart");
    checkEq(doc.playEnd, 5, "setPlayEnd");
    setPlayStart(2); // 同値で解除
    checkEq(doc.playStart, -1, "setPlayStart 同値で解除");
    setPlayEnd(3);
    setPlayStart(4); // end(3) が start(4) 以下 → end を start+1 (5) に調整
    checkEq(doc.playEnd, 5, "setPlayStart: end が start 以下なら調整");
    setPlayEnd(2); // start(4) より下 → start+1 にクランプ
    checkEq(doc.playEnd, 5, "setPlayEnd: start 以下はクランプ");
    setPlayStart(-1); // カット
    setPlayEnd(-1);
    checkEq(doc.playStart, -1, "setPlayStart カット");
    checkEq(doc.playEnd, -1, "setPlayEnd カット");
    setPlayStart(4);
    setPlayEnd(8);
    setPlayStart(4); // 同値で解除
    checkEq(doc.playStart, -1, "setPlayStart 同値で解除 (2回目)");
    checkEq(loop.value, true, "REPEAT がデフォルトで ON");
  }

  // ---- 18. 音声 (ptVoice) ドキュメント管理 ----
  {
    const pCount = projects.value.length;
    newVoice();
    checkEq(voices.value.length, 1, "voice: 新規タブが1つ");
    check(voices.value[0]!.id === currentVoiceId.value, "voice: currentVoiceId が新規タブ");
    const w = currentVoice()!.woice;
    checkEq(w.voiceNum, 2, "voice: A/B の2面");
    checkEq(w.getVoice(0)!.volume, 64, "voice: A面ボリューム 64");
    checkEq(w.getVoice(1)!.volume, 0, "voice: B面ボリューム 0");
    checkEq(w.getVoice(0)!.type, VoiceType.Coodinate, "voice: 初期波形は座標指定");
    checkEq(w.getVoice(0)!.wave.reso, 256, "voice: 座標分解能 256");
    checkEq(w.getVoice(0)!.envelope.fps, 1000, "voice: エンベロープ fps 1000");
    checkEq(projects.value.length, pCount, "voice: コラージュのタブ数は変わらない");

    editVoice(() => {
      w.getVoice(0)!.volume = 100;
    });
    const doc1 = currentVoice()!;
    checkEq(doc1.dirty, true, "voice: 編集で dirty");
    checkEq(doc1.undoStack.length, 1, "voice: undo スタックに1エントリ");
    checkEq(w.getVoice(0)!.volume, 100, "voice: 編集が反映される");

    checkEq(undoVoice(), true, "voice: undo 成功");
    checkEq(w.getVoice(0)!.volume, 64, "voice: undo で巻き戻る");
    checkEq(redoVoice(), true, "voice: redo 成功");
    checkEq(w.getVoice(0)!.volume, 100, "voice: redo で復元");

    // .ptvoice ラウンドトリップ
    const io = new MemoryIo();
    check(w.ptvWrite(io) > 0, "voice: ptvWrite 成功");
    const err = openVoice(io.toUint8Array(), "test");
    checkEq(err, null, "voice: openVoice 成功 (エラーなし)");
    checkEq(voices.value.length, 2, "voice: 2タブ目が開く");
    checkEq(currentVoice()!.fileName, "test", "voice: ファイル名が付く");
    checkEq(currentVoice()!.dirty, false, "voice: 開いた直後はクリーン");
    checkEq(currentVoice()!.woice.getVoice(0)!.volume, 100, "voice: ラウンドトリップで値が保持");

    // タブ切替で各タブの状態が独立していること
    editVoice(() => {
      currentVoice()!.woice.getVoice(0)!.volume = 55;
    });
    switchVoice(voices.value[0]!.id);
    checkEq(currentVoice()!.woice.getVoice(0)!.volume, 100, "voice: タブ切替で独立 (doc0 は 100)");
    switchVoice(voices.value[1]!.id);
    checkEq(currentVoice()!.woice.getVoice(0)!.volume, 55, "voice: タブ切替で独立 (doc1 は 55)");
    closeVoice(currentVoiceId.value);
    checkEq(voices.value.length, 1, "voice: タブを閉じる");

    // レンダリング (オフライン) がパイプラインで通ること
    const pcm = renderWoice(createDefaultWoice(), 0x6000, 100, 0.5, 44100);
    check(pcm !== null && pcm.length > 0, "voice: renderWoice が PCM を返す", `len=${pcm?.length}`);
  }

  // ---- 19. ノイズ (ptNoise) ドキュメント管理 ----
  {
    newNoise();
    checkEq(noises.value.length, 1, "noise: 新規タブが1つ");
    const n = currentNoise()!.noise;
    checkEq(n.unitNum, 4, "noise: 4ユニット");
    checkEq(n.smpNum44k, 44100, "noise: 1秒 (44100サンプル)");
    checkEq(n.getUnit(0)!.bEnable, true, "noise: 1番目ユニットのみ有効");
    checkEq(n.getUnit(1)!.bEnable, false, "noise: 2番目ユニットは無効");
    checkEq(n.getUnit(0)!.main.type, WaveType.Sine, "noise: main は Sine");
    checkEq(n.getUnit(0)!.main.freq, 440, "noise: main 周波数 440");
    checkEq(n.getUnit(0)!.volu.type, WaveType.None, "noise: volu は None");
    checkEq(n.getUnit(0)!.enveNum, 2, "noise: エンベロープ点 2");

    editNoise(() => {
      n.getUnit(0)!.main.freq = 880;
    });
    const nd = currentNoise()!;
    checkEq(nd.dirty, true, "noise: 編集で dirty");
    checkEq(nd.undoStack.length, 1, "noise: undo スタックに1エントリ");

    checkEq(undoNoise(), true, "noise: undo 成功");
    checkEq(n.getUnit(0)!.main.freq, 440, "noise: undo で巻き戻る");
    checkEq(redoNoise(), true, "noise: redo 成功");
    checkEq(n.getUnit(0)!.main.freq, 880, "noise: redo で復元");

    // .ptnoise ラウンドトリップ
    const io = new MemoryIo();
    check(n.write(io), "noise: write 成功");
    const err = openNoise(io.toUint8Array(), "n1");
    checkEq(err, null, "noise: openNoise 成功 (エラーなし)");
    checkEq(noises.value.length, 2, "noise: 2タブ目が開く");
    checkEq(currentNoise()!.noise.getUnit(0)!.main.freq, 880, "noise: ラウンドトリップで値が保持");
    // 無効ユニットはファイルに書かれない (read 後のユニット数)
    checkEq(currentNoise()!.noise.unitNum, 1, "noise: 無効ユニットは保存されない");

    // タブ切替で各タブの状態が独立していること
    editNoise(() => {
      currentNoise()!.noise.getUnit(0)!.main.freq = 330;
    });
    switchNoise(noises.value[0]!.id);
    checkEq(currentNoise()!.noise.getUnit(0)!.main.freq, 880, "noise: タブ切替で独立 (doc0 は 880)");
    switchNoise(noises.value[1]!.id);
    checkEq(currentNoise()!.noise.getUnit(0)!.main.freq, 330, "noise: タブ切替で独立 (doc1 は 330)");
    closeNoise(currentNoiseId.value);
    checkEq(noises.value.length, 1, "noise: タブを閉じる");

    // ビルド (波形生成) が通ること
    const pcm = renderNoise(currentNoise()!.noise, 44100);
    check(pcm !== null && pcm.length === 44100 * 2, "noise: renderNoise が1秒ステレオ PCM を返す", `len=${pcm?.length}`);
  }

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})();