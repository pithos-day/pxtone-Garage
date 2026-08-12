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
  setRepeatMeas,
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
  clampWavePointX,
  insertWavePoint,
  enveDisplayPoints,
  enveInsertPoint,
  enveDeletePoint,
  enveSetHeadPointX,
  applyWavePreset,
  copyVoiceSide,
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
import { formatTime, measStartClock } from "../src/lib/clock";
import { scaleToWoice, scaleToGroup, VOLUME_EDIT_KIND } from "../src/lib/volume";
import { writeNote, writeNoteLength, eraseNote, writeVolumeEvent, type EventWriteOps } from "../src/lib/editing";
import { nearestPoint } from "../src/lib/voice-geometry";
import { visibleClockWindow, iterVisibleRecords } from "../src/lib/records";
import { woiceSummary } from "../src/lib/woice";
import { MemoryIo, VoiceType, WaveType, EventKind, type EveRecord } from "pxtone-ts";

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
    check("voice: currentVoiceId が新規タブ", voices.value[0]!.id === currentVoiceId.value);
    const w = currentVoice()!.woice;
    checkEq(w.voiceNum, 2, "voice: A/B の2面");
    checkEq(w.getVoice(0)!.volume, 64, "voice: A面ボリューム 64");
    checkEq(w.getVoice(1)!.volume, 64, "voice: B面ボリューム 64 (本家データは 0 だが UI 都合で 64)");
    checkEq(w.getVoice(0)!.basicKey, 0x2d00, "voice: 基本キーは本家 data_reset 準拠の 0x2d00");
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
    check("voice: ptvWrite 成功", w.ptvWrite(io) > 0);
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
    check("voice: renderWoice が PCM を返す", pcm !== null && pcm.length > 0, `len=${pcm?.length}`);
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
    check("noise: write 成功", n.write(io));
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
    check("noise: renderNoise が1秒ステレオ PCM を返す", pcm !== null && pcm.length === 44100 * 2, `len=${pcm?.length}`);
  }

  // ---- 20. Coordinate 波形の編集ルール (本家 ptuiWave 準拠) ----
  {
    const pts = [
      { x: 0, y: 0 },
      { x: 64, y: 64 },
      { x: 192, y: -64 },
    ];
    // 点0 は固定 (x=0)
    checkEq(clampWavePointX(pts, 0, 50, 256), 0, "coord: 点0 は x=0 固定");
    // 前後の点を越えられない (点1 の前は x=0、後ろは 192)
    checkEq(clampWavePointX(pts, 1, 100, 256), 100, "coord: 点1 は隣接点の範囲内 (0..192) で自由");
    checkEq(clampWavePointX(pts, 1, 300, 256), 192, "coord: 点1 は後ろの点 (192) を越えられない");
    checkEq(clampWavePointX(pts, 2, 10, 256), 64, "coord: 点2 は前の点 (64) より左へ行けない");
    checkEq(clampWavePointX(pts, 2, 64, 256), 64, "coord: 点2 は前の点と同 x まで");
    checkEq(clampWavePointX(pts, 2, 300, 256), 256, "coord: 末尾の点は reso (256) まで");
    // 点追加: x でソートされた位置に挿入
    const pts2 = [
      { x: 0, y: 0 },
      { x: 64, y: 64 },
    ];
    checkEq(insertWavePoint(pts2, 32, 100, 31), true, "coord: 追加成功");
    checkEq(pts2[1]!.x, 32, "coord: ソート位置に挿入される");
    checkEq(pts2[2]!.x, 64, "coord: 既存点は後ろへずれる");
    checkEq(insertWavePoint(pts2, 64, 55, 31), true, "coord: 同一 x は y を更新");
    checkEq(pts2[2]!.y, 55, "coord: 同一 x で y 更新");
    checkEq(insertWavePoint(pts2, 0, 100, 31), false, "coord: x=0 は追加不可 (点0 が占有)");
    // 最大31点
    const pts3 = [{ x: 0, y: 0 }];
    for (let i = 1; i <= 30; i++) pts3.push({ x: i * 10, y: 0 });
    checkEq(insertWavePoint(pts3, 305, 0, 31), false, "coord: 31点を超えて追加不可");
  }

  // ---- 21. エンベロープ (本家 ptuiEnvelope 準拠: 区間長 x + 累積描画) ----
  {
    // デフォルト: points[0]={0,96}, points[31]={1,0} (リリース)
    const pts = Array.from({ length: 32 }, () => ({ x: 0, y: 0 }));
    pts[0] = { x: 0, y: 96 };
    pts[31] = { x: 1, y: 0 };

    // 累積表示点 (ゼロ点スキップ)
    let disp = enveDisplayPoints(pts, 31);
    checkEq(disp.length, 1, "enve: ヘッド表示点は points[0] のみ");
    checkEq(disp[0]!.x, 0, "enve: 累積 x = 0");
    checkEq(disp[0]!.y, 96, "enve: y = 96");

    // 追加: 累積 x=50 に挿入 → 空きスロット points[1] に区間長 50
    checkEq(enveInsertPoint(pts, 31, 50, 80), true, "enve: 追加成功");
    checkEq(pts[1]!.x, 50, "enve: points[1].x = 50 (区間長)");
    checkEq(pts[1]!.y, 80, "enve: points[1].y = 80");
    disp = enveDisplayPoints(pts, 31);
    checkEq(disp.length, 2, "enve: 表示点が2つに");
    checkEq(disp[1]!.x, 50, "enve: 累積 x = 50");

    // 追加: 累積 x=30 → points[1] (x=50) の前に挿入、後続区間を短縮
    checkEq(enveInsertPoint(pts, 31, 30, 70), true, "enve: 途中挿入成功");
    checkEq(pts[1]!.x, 30, "enve: 挿入点の区間長 30");
    checkEq(pts[2]!.x, 20, "enve: 後続区間が 50→20 に短縮");
    disp = enveDisplayPoints(pts, 31);
    checkEq(disp[1]!.x, 30, "enve: 挿入後の累積 30");
    checkEq(disp[2]!.x, 50, "enve: 元の点の累積は 50 のまま");

    // 同一累積 x → y 更新
    checkEq(enveInsertPoint(pts, 31, 30, 66), true, "enve: 同一 x は y 更新");
    checkEq(pts[1]!.y, 66, "enve: y が 66 に更新");

    // ドラッグ: 前後の累積 (0, 50) を越えられない
    enveSetHeadPointX(pts, 31, 1, 100); // 後ろ (累積50) より右へは行けない
    checkEq(pts[1]!.x, 49, "enve: 点1 は後ろの点 (累積50) を越えられない");
    enveSetHeadPointX(pts, 31, 1, 0); // 前 (累積0) より左へは行けない
    checkEq(pts[1]!.x, 1, "enve: 点1 は前の点 (累積0) を越えられない");

    // 削除: 後続の区間を延長してシフト
    checkEq(enveDeletePoint(pts, 31, 1), true, "enve: 削除成功");
    checkEq(pts[1]!.x, 21, "enve: 削除で後続区間が 20+1=21 に延長");
    disp = enveDisplayPoints(pts, 31);
    checkEq(disp.length, 2, "enve: 削除後の表示点 2つ");
    checkEq(disp[1]!.x, 21, "enve: 削除後の累積 21");

    // 末尾の有効点は右へ自由に動かせる (配列の後ろがゼロ点でも accs[idx+1] で
    // クランプされないこと — ドラッグが右に動かない不具合の回帰テスト)
    enveSetHeadPointX(pts, 31, 1, 300);
    checkEq(pts[1]!.x, 300, "enve: 末尾の有効点は右へ自由に動かせる");
    // 左へは前の有効点 (累積0) を越えられない
    enveSetHeadPointX(pts, 31, 1, -10);
    checkEq(pts[1]!.x, 1, "enve: 末尾の有効点も前の点を越えられない");

    // 有効点が1つのみなら削除不可
    const pts2 = Array.from({ length: 32 }, () => ({ x: 0, y: 0 }));
    pts2[0] = { x: 0, y: 96 };
    checkEq(enveDeletePoint(pts2, 31, 1), false, "enve: 有効点1つなら削除不可");
  }

  // ---- 22. プレビューの音程 (本家 ptVoice 準拠: 中央キー 441 Hz) ----
  {
    const w = createDefaultWoice();
    // 倍音1のみの正弦波に置き換えて基本周波数をゼロ交差で計測する
    const vc = w.getVoice(0)!;
    vc.type = VoiceType.Overtone;
    vc.wave.num = 1;
    vc.wave.points = [{ x: 1, y: 128 }];
    const pcm = renderWoice(w, 0x6000, 104, 0.5, 44100); // コード69 = 中央キー
    check("pitch: renderWoice が PCM を返す", pcm !== null && pcm.length > 0, `len=${pcm?.length}`);
    if (pcm) {
      // ゼロ交差 (正→負/負→正) の回数 ÷ 2 = サイクル数。0.5秒なので ×2 で Hz
      let crossings = 0;
      let prev = pcm[0]!;
      for (let i = 1; i < pcm.length; i++) {
        const v = pcm[i]!;
        if ((prev < 0 && v >= 0) || (prev >= 0 && v < 0)) crossings++;
        prev = v;
      }
      const hz = (crossings / 2) * 2; // 0.5秒 → 1秒換算
      checkEq(Math.round(hz / 10) * 10, Math.round(441 / 10) * 10, `pitch: 中央キーが約 441 Hz (本家準拠) 実際=${Math.round(hz)}Hz`);
    }
  }

  // ---- 23. 波形プリセット (本家 ptuiWavePreset 準拠) ----
  {
    const w = createDefaultWoice();
    const vc = w.getVoice(0)!;

    // Overtone: Sine
    vc.type = VoiceType.Overtone;
    applyWavePreset(vc, 0);
    checkEq(vc.volume, 32, "preset: Sine (倍音) volume 32");
    checkEq(vc.wave.num, 31, "preset: Sine (倍音) 31点");
    checkEq(vc.wave.points[0]!.y, 128, "preset: Sine (倍音) 倍音1=128");
    checkEq(vc.wave.points[1]!.y, 0, "preset: Sine (倍音) 倍音2=0");
    checkEq(vc.wave.points[0]!.x, 1, "preset: Sine (倍音) 倍音1の x=1");

    // Overtone: Triangle (奇数倍音を交互 ±・3 で減衰)
    applyWavePreset(vc, 1);
    checkEq(vc.volume, 28, "preset: Triangle (倍音) volume 28");
    checkEq(vc.wave.points[0]!.y, 128, "preset: Triangle 倍音1=128");
    checkEq(vc.wave.points[1]!.y, 0, "preset: Triangle 倍音2=0");
    checkEq(vc.wave.points[2]!.y, -42, "preset: Triangle 倍音3=-42 (128/3)");
    checkEq(vc.wave.points[4]!.y, 14, "preset: Triangle 倍音5=14 (42/3)");

    // Overtone: Saw / Rectangle
    applyWavePreset(vc, 2);
    checkEq(vc.volume, 16, "preset: Saw volume 16");
    checkEq(vc.wave.points[5]!.y, 128, "preset: Saw 全倍音 128");
    applyWavePreset(vc, 3);
    checkEq(vc.volume, 24, "preset: Rectangle volume 24");
    checkEq(vc.wave.points[0]!.y, 128, "preset: Rectangle 奇数倍音=128");
    checkEq(vc.wave.points[1]!.y, 0, "preset: Rectangle 偶数倍音=0");

    // Coodinate: Triangle
    vc.type = VoiceType.Coodinate;
    applyWavePreset(vc, 1);
    checkEq(vc.volume, 64, "preset: Triangle (座標) volume 64");
    checkEq(vc.wave.num, 3, "preset: Triangle (座標) 3点");
    checkEq(vc.wave.points[0]!.x, 0, "preset: Triangle 点0 x=0");
    checkEq(vc.wave.points[1]!.x, 64, "preset: Triangle 点1 x=64");
    checkEq(vc.wave.points[1]!.y, 64, "preset: Triangle 点1 y=64");
    checkEq(vc.wave.points[2]!.y, -64, "preset: Triangle 点2 y=-64");

    // Coodinate: Sine (14点 + 点0 = 15点)
    applyWavePreset(vc, 0);
    checkEq(vc.wave.num, 15, "preset: Sine (座標) 15点");
    checkEq(vc.wave.points[1]!.x, 16, "preset: Sine (座標) 点1 x=16");
    checkEq(vc.wave.points[14]!.y, -33, "preset: Sine (座標) 点14 y=-33");

    // Coodinate: Saw / Rectangle
    applyWavePreset(vc, 2);
    checkEq(vc.wave.num, 3, "preset: Saw (座標) 3点");
    checkEq(vc.wave.points[2]!.x, 255, "preset: Saw (座標) 点2 x=255");
    applyWavePreset(vc, 3);
    checkEq(vc.wave.num, 5, "preset: Rectangle (座標) 5点");

    // Reverse: y 反転
    applyWavePreset(vc, 1); // Triangle に戻す
    applyWavePreset(vc, 5);
    checkEq(vc.wave.points[1]!.y, -64, "preset: Reverse で y 反転");
    checkEq(vc.wave.points[2]!.y, 64, "preset: Reverse で y 反転 (2)");

    // Random (倍音): 有効倍音 1..30・振幅 ±128
    vc.type = VoiceType.Overtone;
    applyWavePreset(vc, 4);
    checkEq(vc.volume, 28, "preset: Random (倍音) volume 28");
    checkEq(vc.wave.num, 31, "preset: Random (倍音) 31点");
    const rnd = vc.wave.points.filter((p) => p.y !== 0);
    check(rnd.length >= 1 && rnd.length <= 30, "preset: Random の有効倍音は 1..30", `n=${rnd.length}`);
    check(rnd.every((p) => p.y >= -128 && p.y <= 128), "preset: Random の振幅は ±128");

    // Random (座標): 点は x でソートされている
    vc.type = VoiceType.Coodinate;
    applyWavePreset(vc, 4);
    checkEq(vc.volume, 64, "preset: Random (座標) volume 64");
    check(vc.wave.num >= 1 && vc.wave.num <= 31, "preset: Random (座標) 点数 1..31", `n=${vc.wave.num}`);
    let sorted = true;
    for (let i = 2; i < vc.wave.num; i++) {
      if (vc.wave.points[i]!.x < vc.wave.points[i - 1]!.x) sorted = false;
    }
    check(sorted, "preset: Random (座標) は x でソート");
  }

  // ---- 24. A/B 面コピー (本家 copy_ptv_voice 準拠) ----
  {
    newVoice();
    editVoice(() => {
      const v = currentVoice()!.woice;
      v.getVoice(0)!.volume = 10;
      v.getVoice(0)!.wave.points[1]!.y = 77;
      v.getVoice(0)!.envelope.points[0]!.y = 50;
    });
    copyVoiceSide(0, 1);
    const w = currentVoice()!.woice;
    checkEq(w.getVoice(1)!.volume, 10, "copy: A→B volume コピー");
    checkEq(w.getVoice(1)!.wave.points[1]!.y, 77, "copy: A→B 波形コピー");
    checkEq(w.getVoice(1)!.envelope.points[0]!.y, 50, "copy: A→B エンベロープコピー");
    checkEq(w.getVoice(1)!.basicKey, w.getVoice(0)!.basicKey, "copy: A→B basicKey コピー");
    checkEq(w.getVoice(1)!.pan, w.getVoice(0)!.pan, "copy: A→B pan コピー");
    checkEq(w.getVoice(1)!.tuning, w.getVoice(0)!.tuning, "copy: A→B tuning コピー");
    // ディープコピー: B を編集しても A に影響しない
    editVoice(() => {
      w.getVoice(1)!.wave.points[1]!.y = 99;
      w.getVoice(1)!.volume = 5;
    });
    checkEq(w.getVoice(0)!.wave.points[1]!.y, 77, "copy: B 編集は A に影響しない (波形)");
    checkEq(w.getVoice(0)!.volume, 10, "copy: B 編集は A に影響しない (volume)");
    // B→A も動作する
    copyVoiceSide(1, 0);
    checkEq(w.getVoice(0)!.volume, 5, "copy: B→A で volume コピー");
    checkEq(w.getVoice(0)!.wave.points[1]!.y, 99, "copy: B→A で波形コピー");
  }

  // ---- 25. Repeat の undo で表示値 (1-based) がエンジンと一致する ----
  {
    // sync() がエンジン値から 1-based 表示へ変換する (undo/redo 後の不整合の回帰テスト)
    const m = serviceMod.service.master;
    setRepeatMeas(3);
    checkEq(doc.repeatMeas, 3, "repeat: setRepeatMeas(3) で表示は 1-based 3");
    checkEq(m.repeatMeas, 2, "repeat: エンジンは 0-based 2");
    undo();
    checkEq(m.repeatMeas, 0, "repeat: undo でエンジンが 0 に戻る");
    checkEq(doc.repeatMeas, 0, "repeat: undo で表示値も 0 に戻る (変換欠落の回帰)");
    setRepeatMeas(5);
    undo();
    checkEq(doc.repeatMeas, 0, "repeat: undo#2 でも表示値が戻る");
    redo();
    checkEq(m.repeatMeas, 4, "repeat: redo でエンジンが 4 に戻る");
    checkEq(doc.repeatMeas, 5, "repeat: redo で表示値も 5 に戻る");
    setRepeatMeas(0); // 後続テストのためにクリア
    undo();
    checkEq(doc.repeatMeas, 5, "repeat: クリアの undo で表示値が 5 に戻る");
  }

  // ---- 26. 抽出 lib の純関数 (リファクタ後の回帰テスト) ----
  {
    // lib/clock: formatTime (mm:ss) / measStartClock
    checkEq(formatTime(0), "0:00", "lib: formatTime(0)");
    checkEq(formatTime(65), "1:05", "lib: formatTime(65)");
    checkEq(formatTime(3599.9), "59:59", "lib: formatTime(3599.9)");
    const cv = { beatClock: 480, beatNum: 4, zoom: 48 };
    checkEq(measStartClock(cv, 2), 3840, "lib: measStartClock(小節2) = 3840 クロック");

    // lib/volume: スケール換算と編集方式
    checkEq(scaleToWoice(64, 4), 2, "lib: scaleToWoice 64/4音色 → 2 (1.5 を丸め)");
    checkEq(scaleToWoice(128, 4), 3, "lib: scaleToWoice 128/4音色 → 3");
    checkEq(scaleToWoice(128, 1), 0, "lib: scaleToWoice 音色1個 → 0");
    checkEq(scaleToGroup(64), 4, "lib: scaleToGroup 64 → 4 (3.5 を丸め)");
    checkEq(scaleToGroup(128), 7, "lib: scaleToGroup 128 → 7");
    checkEq(VOLUME_EDIT_KIND[0], "setValue", "lib: モード0 は setValue");
    checkEq(VOLUME_EDIT_KIND[4], "length", "lib: モード4 は length");
    checkEq(VOLUME_EDIT_KIND[7], undefined, "lib: モード7 (Tuning) は対象外");

    // lib/voice-geometry: 最近傍点探索
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ];
    checkEq(nearestPoint(pts, 105, 2), 1, "lib: nearestPoint 中間の点");
    checkEq(nearestPoint(pts, 500, 500), -1, "lib: nearestPoint 範囲外は -1");
    checkEq(nearestPoint(pts, 0, 0, 1), 0, "lib: nearestPoint 閾値内の最近傍");

    // lib/records: 可視範囲ウィンドウ (w と scrollX は px。zoom=48 で 1 拍 = 480 クロック)
    const win = visibleClockWindow(cv, 0, 48);
    checkEq(win.startClock, 0, "lib: 可視ウィンドウ start");
    checkEq(win.endClock, 480, "lib: 可視ウィンドウ end (1 拍分)");
    const win2 = visibleClockWindow(cv, 48, 48, 24);
    checkEq(win2.startClock, 456, "lib: 可視ウィンドウ margin 付き start");
    checkEq(win2.endClock, 960, "lib: 可視ウィンドウ margin 付き end");

    // lib/editing: イベント書き換えの choreography (書き込み操作を記録するスパイ)
    const kindName = (k: EventKind) => EventKind[k] ?? String(k);
    const log: string[] = [];
    const ops: EventWriteOps = {
      deleteEvents: (c1, c2, unit, kind) => log.push(`del ${c1}-${c2} u${unit} ${kindName(kind)}`),
      addEvent: (clock, unit, kind, value) => log.push(`add ${clock} u${unit} ${kindName(kind)} ${value}`),
      setEventValue: (c1, c2, unit, kind, value) => log.push(`set ${c1}-${c2} u${unit} ${kindName(kind)} ${value}`),
    };
    writeNote(ops, 0, 480, 1, 0x6000, 90);
    checkEq(
      log.join(";"),
      "del 0-480 u1 KEY;add 0 u1 KEY 24576;del 0-480 u1 VELOCITY;add 0 u1 VELOCITY 90;del 0-480 u1 ON;add 0 u1 ON 480",
      "lib: writeNote は KEY+VELOCITY+ON を範囲書換",
    );
    log.length = 0;
    writeNoteLength(ops, 0, 480, 1, 90);
    checkEq(
      log.join(";"),
      "del 0-480 u1 ON;del 0-480 u1 VELOCITY;add 0 u1 ON 480;add 0 u1 VELOCITY 90",
      "lib: writeNoteLength は ON+VELOCITY のみ書換 (KEY 不変)",
    );
    log.length = 0;
    eraseNote(ops, 0, 480, 1, { key: true, onVel: true });
    checkEq(log.join(";"), "del 0-480 u1 KEY;del 0-480 u1 ON;del 0-480 u1 VELOCITY", "lib: eraseNote は KEY+ON+VELOCITY 削除");
    log.length = 0;
    eraseNote(ops, 0, 480, 1, { key: true, onVel: false });
    checkEq(log.join(";"), "del 0-480 u1 KEY", "lib: eraseNote は手ツール時 KEY のみ削除");
    log.length = 0;
    writeVolumeEvent(ops, 0, 480, 1, EventKind.PORTAMENT, "length", 100, 4);
    checkEq(
      log.join(";"),
      "del 0-480 u1 PORTAMENT;add 0 u1 PORTAMENT 480",
      "lib: writeVolumeEvent length は長さを書き込み",
    );
    log.length = 0;
    writeVolumeEvent(ops, 0, 480, 1, EventKind.VOICENO, "scaleWoice", 64, 4);
    checkEq(
      log.join(";"),
      "del 0-480 u1 VOICENO;add 0 u1 VOICENO 2",
      "lib: writeVolumeEvent scaleWoice は音色番号へ換算",
    );
    log.length = 0;
    writeVolumeEvent(ops, 0, 480, 1, EventKind.VOLUME, "replace", 80, 4);
    checkEq(
      log.join(";"),
      "del 0-480 u1 VOLUME;add 0 u1 VOLUME 80;set 0-480 u1 VOLUME 80",
      "lib: writeVolumeEvent replace は delete+add+set",
    );
    log.length = 0;
    writeVolumeEvent(ops, 0, 480, 1, EventKind.VELOCITY, "setValue", 80, 4);
    checkEq(log.join(";"), "set 0-480 u1 VELOCITY 80", "lib: writeVolumeEvent setValue は値の書換のみ");

    // lib/records: iterVisibleRecords (範囲フィルタ・ON 長さ考慮・break)
    const recs: EveRecord[] = [
      { unitNo: 0, clock: 0, kind: EventKind.KEY, value: 0x6000 },
      { unitNo: 0, clock: 100, kind: EventKind.ON, value: 500 },
      { unitNo: 0, clock: 200, kind: EventKind.NULL, value: 0 },
      { unitNo: 0, clock: 900, kind: EventKind.KEY, value: 0x6000 },
    ];
    const seen = [...iterVisibleRecords(recs, { startClock: 0, endClock: 480 })];
    checkEq(seen.length, 2, "lib: iterVisibleRecords は範囲内のみ (NULL 除外)");
    checkEq(seen[0]!.kind, EventKind.KEY, "lib: iterVisibleRecords は時系列順");
    const seen2 = [...iterVisibleRecords(recs, { startClock: 480, endClock: 600 })];
    checkEq(seen2.length, 1, "lib: iterVisibleRecords は ON を長さ込みで判定");
    checkEq(seen2[0]!.clock, 100, "lib: iterVisibleRecords 対象は clock 100 の ON");
    const seen3 = [...iterVisibleRecords(recs, { startClock: 0, endClock: 150 })];
    checkEq(seen3.length, 2, "lib: iterVisibleRecords は endClock 超過で break (900 の KEY は見ない)");

    // lib/woice: 音色サマリ
    const sum = woiceSummary(createDefaultWoice());
    check(sum.startsWith("座標波形"), "lib: woiceSummary は座標波形サマリ", sum);
  }

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})();