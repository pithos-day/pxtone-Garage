// 複数プロジェクト管理のスモークテスト (node で直接実行)
import {
  projects,
  currentProjectId,
  currentProject,
  newProjectInTab,
  switchProject,
  closeProject,
  openProjectInTab,
  isTuneProject,
  applyWoiceLink,
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
  detectWoiceType,
  WoiceType,
  woiceName,
  woiceNameRaw,
  copyMeas,
  changeEventValue,
  addUnitWithWoice,
  setUnitNameAndWoice,
  setWoiceProperties,
  getAllEvents,
  addEvent,
  deleteEvents,
  setEventValue,
  sync,
  setPlayStart,
  setPlayEnd,
  setPlayRange,
  setRepeatMeas,
  scopeCopy,
  scopeCut,
  scopeClear,
  scopeDelete,
  scopePaste,
  scopeInsert,
  scopeClipReady,
} from "../src/state/project";
import * as serviceMod from "../src/state/service";
import { undo, redo, canUndo, canRedo } from "../src/state/undo";
import { player, isPlaying, masterVolume, loop, initMasterVolume, setMasterVolume } from "../src/state/player";
import { parseThemeCss, mergeTokens, buildThemeCss, buildStandaloneThemeCss } from "../src/lib/themeParse";
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
  snapshotVoice,
  openWoiceAsVoice,
  markVoiceClean,
  ensureInitialVoice,
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
  snapshotNoise,
  openPtnAsNoise,
  markNoiseClean,
  pushNoiseHistory,
  NOISE_UNIT_NUM,
  NOISE_ENVE_NUM,
  ensureInitialNoise,
} from "../src/state/noise";
import { renderWoice, renderNoise } from "../src/engine/preview";
import { parseMidi, convertMidiToPtcop } from "../src/engine/midi";
import { formatTime, measStartClock } from "../src/lib/clock";
import { scaleToWoice, scaleToGroup, VOLUME_EDIT_KIND } from "../src/lib/volume";
import { writeNote, writeNoteLength, eraseNote, writeVolumeEvent, type EventWriteOps } from "../src/lib/editing";
import { MENU_LABELS, menuNamesFor, buildFileMenu } from "../src/lib/menuItems";
import { t } from "../src/i18n";
import { secToEnveX, pctToEnveY, pushHistoryEntry } from "../src/lib/noise";
import { nearestPoint } from "../src/lib/voice-geometry";
import { visibleClockWindow, iterVisibleRecords, iterNoteDraws, type NoteDraw } from "../src/lib/records";
import { woiceSummary } from "../src/lib/woice";
import { stripFileExt, renderWav, WAV_EXPORT_DEFAULTS } from "../src/engine/io";
import { MemoryIo, VoiceType, WaveType, EventKind, type EveRecord } from "pxtone-ts";
import { Service, PxtnErr, PXTN_MAX_EVENT_NUM, Woice, Noise, pxtnServiceMooCalcSampleNum } from "pxtone-ts";
import { defaultOggvDecoder } from "pxtone-ts";
import { decodeProjectBytes } from "../src/engine/oggv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// バイト列の等価チェック (失敗時は長さか最初の相違位置を表示する)
function checkBytes(actual: Uint8Array, expected: Uint8Array, name: string): void {
  if (actual.length !== expected.length) {
    fail(name, `length expected=${expected.length} actual=${actual.length}`);
    return;
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      fail(name, `differs at ${i} expected=${expected[i]} actual=${actual[i]}`);
      return;
    }
  }
  console.log(`ok   ${name}`);
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

// ---- 6b. pttune は再生専用タブとして開く (DENY_BEATCLOCK にならない) ----
const tuneSvc = new Service();
checkEq(tuneSvc.init(), PxtnErr.OK, "tune: 非編集 Service 初期化");
checkEq(tuneSvc.read(new MemoryIo(bytes!)), PxtnErr.OK, "tune: ptcop 読み込み");
const tuneIo = new MemoryIo();
checkEq(tuneSvc.write(tuneIo, true, serviceMod.EXE_VER), PxtnErr.OK, "tune: pttune 書き出し");
const tuneErr = openProjectInTab(tuneIo.toUint8Array(), "my-tune");
checkEq(tuneErr, null, "tune: open でエラーなし");
checkEq(currentProject()?.kind, "tune", "tune: kind が tune");
checkEq(doc.readOnly, true, "tune: doc.readOnly が立つ");
checkEq(isTuneProject(), true, "tune: isTuneProject が真");
const tuneUnits = units.value.length;
checkEq(addUnit("X"), false, "tune: 編集は無効 (addUnit が false)");
checkEq(units.value.length, tuneUnits, "tune: ユニット数は変わらない");
// 直接書き込み API も無効 (ドラッグ経路の二重防御)
const tuneEveCount = serviceMod.service.evels.count;
addEvent(0, 0, EventKind.KEY, 0x6000);
deleteEvents(0, 480, 0);
setEventValue(0, 480, 0, EventKind.VELOCITY, 100);
checkEq(serviceMod.service.evels.count, tuneEveCount, "tune: 直接書き込みでイベント数は変わらない");
const tuneId = currentProjectId.value;
closeProject(tuneId);
checkEq(projects.value.length, 3, "tune: タブを閉じると元に戻る");
switchProject(p3Id);
checkEq(doc.readOnly, false, "tune: ptcop タブに戻すと readOnly 解除");
checkEq(isTuneProject(), false, "tune: ptcop タブでは isTuneProject が偽");

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

    const addWoiceRes = await addWoice(pcm, WoiceType.PCM);
    checkEq(addWoiceRes, null, "プレビュー用のPCM音色を追加");
    const p = await import("../src/engine/preview");
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;
    // モジュール内の previewCtx キャッシュは初回呼び出しで作られる
    masterVolume.value = 0.5;
    await p.previewUnitHold(0, 0x6000, 104);
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

    // エクスポート CSS 生成 (単体 :root/.dark) → 再インポートの往復
    const standalone = buildStandaloneThemeCss("My Theme", merged);
    check("エクスポートCSS: テーマ名コメント", standalone.includes("/* pxtone-garage theme: My Theme */"));
    const reimported = parseThemeCss(standalone);
    check(
      "エクスポートCSS: 再インポートで light トークン一致",
      reimported !== null &&
        JSON.stringify(reimported.light) === JSON.stringify(merged.light),
    );
    check(
      "エクスポートCSS: 再インポートで dark トークン一致",
      reimported !== null &&
        JSON.stringify(reimported.dark) === JSON.stringify(merged.dark),
    );
    // 名前中の "*/" はコメントを壊さないよう除去される
    const evilName = buildStandaloneThemeCss("a*/ :root { --x: red; } /*", merged);
    checkEq(parseThemeCss(evilName)?.light["--background"], "oklch(1 0 0)", "エクスポートCSS: 名前の */ を除去");

    // 片側が空ならブロックごと省略される
    const lightOnly = buildStandaloneThemeCss("Light", { light: { "--background": "red" }, dark: {} });
    check("エクスポートCSS: dark が空ならブロック省略", !lightOnly.includes(".dark"));
    check("エクスポートCSS: light が空ならブロック省略", !buildStandaloneThemeCss("Dark", { light: {}, dark: { "--background": "black" } }).includes(":root"));
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
    while (serviceMod.service.woiceNum < 2) await addWoice(buildPcmWav(), WoiceType.PCM);
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

    // ドラッグ操作用の一括設定 (setPlayRange / normalizePlayRange)
    setPlayRange(6, 3); // 逆順は入れ替え
    checkEq(doc.playStart, 3, "setPlayRange: 逆順は開始側に正規化");
    checkEq(doc.playEnd, 6, "setPlayRange: 逆順は終了側に正規化");
    setPlayRange(3, 3); // 同値でも解除せず、1小節分を確保
    checkEq(doc.playStart, 3, "setPlayRange: 同値でも解除しない");
    checkEq(doc.playEnd, 4, "setPlayRange: 同値は start+1 に");
    setPlayRange(20, 20); // measNum=16 → 開始は measNum-1 にクランプ
    checkEq(doc.playStart, 15, "setPlayRange: 開始は measNum-1 にクランプ");
    checkEq(doc.playEnd, 16, "setPlayRange: 終了は measNum まで");
    setPlayRange(5, 99);
    checkEq(doc.playEnd, 16, "setPlayRange: 終了は measNum にクランプ");
    setPlayRange(-5, 2);
    checkEq(doc.playStart, 0, "setPlayRange: 開始は 0 にクランプ");
    checkEq(doc.playEnd, 2, "setPlayRange: 正規化後の終了");
    setPlayStart(-1);
    setPlayEnd(-1);
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
    const roundBytes = io.toUint8Array();
    const err = openNoise(roundBytes, "n1");
    checkEq(err, null, "noise: openNoise 成功 (エラーなし)");
    checkEq(noises.value.length, 2, "noise: 2タブ目が開く");
    checkEq(currentNoise()!.noise.getUnit(0)!.main.freq, 880, "noise: ラウンドトリップで値が保持");
    // 無効ユニットはファイルに書かれない (ファイル上のユニット数)
    // 読込後のタブは 4 レイヤー表示のため無効ユニットを足して保持する (35 節)
    const raw = new Noise();
    checkEq(raw.read(new MemoryIo(roundBytes)), PxtnErr.OK, "noise: 書き出したバイト列を読める");
    checkEq(raw.unitNum, 1, "noise: 無効ユニットは保存されない");

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
    writeNote(ops, 0, 480, 1, 96, 90);
    checkEq(
      log.join(";"),
      "del 0-480 u1 KEY;add 0 u1 KEY 96;del 0-480 u1 VELOCITY;add 0 u1 VELOCITY 90;del 0-480 u1 ON;add 0 u1 ON 480",
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

    // lib/menuItems: トップメニュー定義
    checkEq(MENU_LABELS.file, "File", "lib: MENU_LABELS file");
    checkEq(menuNamesFor("collage").join(","), "file,edit,view", "lib: menuNamesFor collage は File/Edit/View");
    checkEq(menuNamesFor("voice").join(","), "file,edit", "lib: menuNamesFor voice は File/Edit");
    checkEq(menuNamesFor("noise").join(","), "file,edit", "lib: menuNamesFor noise は File/Edit");

    // lib/noise: エンベロープ変換と履歴追加
    checkEq(secToEnveX("1.5"), 1500, "lib: secToEnveX は秒を 1/1000 へ変換");
    checkEq(secToEnveX("12"), 10000, "lib: secToEnveX は上限 10000 でクランプ");
    checkEq(secToEnveX("abc"), null, "lib: secToEnveX は無効値で null");
    checkEq(pctToEnveY("50"), 50, "lib: pctToEnveY は % をそのまま");
    checkEq(pctToEnveY("150"), 100, "lib: pctToEnveY は上限 100 でクランプ");
    checkEq(pctToEnveY("x"), null, "lib: pctToEnveY は無効値で null");
    const hist: number[] = [];
    const t0 = pushHistoryEntry(hist, 0, 1000, 1);
    checkEq(hist.join(","), "1", "lib: pushHistoryEntry は最初のエントリを追加");
    pushHistoryEntry(hist, t0, 1500, 2);
    checkEq(hist.join(","), "2", "lib: pushHistoryEntry は 2 秒以内なら置き換え");
    pushHistoryEntry(hist, 1500, 4000, 3);
    checkEq(hist.join(","), "3,2", "lib: pushHistoryEntry は 2 秒超なら先頭に追加");
    const many: number[] = [];
    for (let i = 0; i < 40; i++) many.unshift(i);
    pushHistoryEntry(many, 0, 5000, -1);
    checkEq(many.length, 30, "lib: pushHistoryEntry は 30 件で打ち切り");

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

    // lib/records: iterNoteDraws (KEY/ON → ノート描画レコード変換)
    const noteRecs: EveRecord[] = [
      { unitNo: 0, clock: 0, kind: EventKind.KEY, value: 0x6000 },
      { unitNo: 0, clock: 100, kind: EventKind.ON, value: 500 },
      { unitNo: 0, clock: 200, kind: EventKind.KEY, value: 0x7000 },
      { unitNo: 0, clock: 300, kind: EventKind.ON, value: 100 },
    ];
    const fmt = (d: NoteDraw[]) =>
      d.map((x) => (x.kind === "key" ? `key@${x.clock}` : `${x.kind}@${x.clock}+${x.len}`)).join(",");
    checkEq(
      fmt([...iterNoteDraws(noteRecs, 0, { startClock: 0, endClock: 480 }, 0x5000)]),
      "key@0,off@0+100,on@100+500,key@200,off@200+100,on@300+100,off@400+80",
      "lib: iterNoteDraws は running key で off/on/key を出力",
    );
    checkEq(
      fmt([...iterNoteDraws(noteRecs, 1, { startClock: 0, endClock: 480 }, 0x5000)]),
      "off@0+480",
      "lib: iterNoteDraws は対象ユニット外を無視し末尾 off を出力",
    );
    checkEq(
      fmt([...iterNoteDraws(noteRecs, 0, { startClock: 150, endClock: 250 }, 0x5000)]),
      "on@100+500,key@200,off@200+50",
      "lib: iterNoteDraws は ON を長さ込みで可視判定",
    );

    // lib/woice: 音色サマリ
    const sum = woiceSummary(createDefaultWoice());
    check(sum.startsWith("座標波形"), "lib: woiceSummary は座標波形サマリ", sum);
  }

  // ---- 25. MIDI (SMF) → ptcop 変換 ----
  {
    // SMF 組み立てヘルパー
    const vlq = (v: number): number[] => {
      const out = [v & 0x7f];
      v >>= 7;
      while (v > 0) {
        out.unshift((v & 0x7f) | 0x80);
        v >>= 7;
      }
      return out;
    };
    const ev = (delta: number, status: number, ...data: number[]): number[] => [...vlq(delta), status, ...data];
    const meta = (delta: number, type: number, data: number[]): number[] => [...vlq(delta), 0xff, type, ...vlq(data.length), ...data];

    const buildMidi = (ppq: number, tracks: number[][]): Uint8Array => {
      const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, tracks.length >> 8, tracks.length & 0xff, ppq >> 8, ppq & 0xff];
      for (const trk of tracks) {
        out.push(0x4d, 0x54, 0x72, 0x6b, (trk.length >> 24) & 0xff, (trk.length >> 16) & 0xff, (trk.length >> 8) & 0xff, trk.length & 0xff);
        out.push(...trk);
      }
      return new Uint8Array(out);
    };

    // PPQ=480: テンポ120・4/4。ch0: ノート60 (0..480, vel100) / ノート64 (480..960, vel90)。
    // ch1: ノート72 (0..960, vel80)。ch2: ノート無し (CCのみ) → ユニット化されない
    const midi = buildMidi(480, [
      [
        ...meta(0, 0x51, [0x07, 0xa1, 0x20]), // 120 BPM (500000µs)
        ...meta(0, 0x58, [4, 2, 24, 8]), // 4/4
        ...ev(0, 0x90, 60, 100), // note on ch0
        ...ev(480, 0x80, 60, 0), // note off
        ...ev(0, 0x90, 64, 90), // ランニングステータス (ステータス省略)
        ...ev(480, 0x80, 64, 0),
        ...ev(0, 0xb2, 7, 100), // ch2 の CC のみ (ノート無し)
        ...meta(0, 0x2f, []),
      ],
      [
        ...ev(0, 0x91, 72, 80), // ch1 (ステータス 0x91)
        ...ev(960, 0x80, 72, 0),
        ...meta(0, 0x51, [0x03, 0x0d, 0x40]), // 途中テンポ変更 (無視される)
        ...meta(0, 0x2f, []),
      ],
    ]);

    // パース結果
    const song = parseMidi(midi);
    check("midi: パース成功", song !== null);
    if (song) {
      checkEq(song.tempo, 120, "midi: テンポ 120");
      checkEq(song.beatNum, 4, "midi: 拍子 4/4");
      checkEq(song.notes.length, 3, "midi: ノート3つ (ch2 の CC は無視)");
      checkEq(song.notes[0]!.channel, 0, "midi: ch0 のノート");
      checkEq(song.notes[0]!.clock, 0, "midi: ノートオン位置 0");
      checkEq(song.notes[0]!.key, 0x1b00 + 60 * 0x100, "midi: KEY = 0x1B00 + note*0x100");
      checkEq(song.notes[0]!.velocity, 100, "midi: ベロシティ 100");
      checkEq(song.notes[0]!.length, 480, "midi: 長さ 480 クロック");
      checkEq(song.notes[1]!.clock, 480, "midi: 2音目の位置 480");
      checkEq(song.notes[1]!.velocity, 90, "midi: ランニングステータスでもベロシティ取得");
      checkEq(song.notes[2]!.channel, 1, "midi: ch1 のノート");

      // ptcop 変換
      const bytes = convertMidiToPtcop(midi);
      check(bytes !== null, "midi: ptcop 変換成功");
      if (bytes) {
        const svc = new Service();
        checkEq(svc.initCollage(PXTN_MAX_EVENT_NUM), PxtnErr.OK, "midi: Service init");
        checkEq(svc.read(new MemoryIo(bytes)), PxtnErr.OK, "midi: ptcop として読み込み成功");
        checkEq(svc.master.beatTempo, 120, "midi: ptcop テンポ 120");
        checkEq(svc.master.beatNum, 4, "midi: ptcop 拍子 4");
        checkEq(svc.master.beatClock, 480, "midi: ptcop beatClock 480");
        checkEq(svc.unitNum, 2, "midi: ユニットはノートのあるチャンネル数のみ");
        checkEq(svc.woiceNum, 2, "midi: チャンネルごとに音色が作成される");
        const notes = svc.evels.records.filter((e) => e.kind === EventKind.ON);
        checkEq(notes.length, 3, "midi: ON イベント3つ");
        const keys = svc.evels.records.filter((e) => e.kind === EventKind.KEY);
        check(keys.some((e) => e.value === 0x1b00 + 60 * 0x100), "midi: KEY 60 が存在");
        check(keys.some((e) => e.value === 0x1b00 + 72 * 0x100), "midi: KEY 72 (ch1) が存在");
        checkEq(svc.master.measNum >= 1, true, "midi: 小節数が調整される");
      }
    }

    // PPQ=96 (非480) のクロック変換: tick 480 → 480*480/96 = 2400
    const midi96 = buildMidi(96, [[...ev(0, 0x90, 60, 100), ...ev(480, 0x80, 60, 0), ...meta(0, 0x2f, [])]]);
    const song96 = parseMidi(midi96);
    check("midi: PPQ=96 でクロック変換 (tick 480 → 2400)", song96 !== null && song96.notes.length === 1 && song96.notes[0]!.length === 2400, `length=${song96?.notes[0]?.length}`);

    // 重なりノート (同じ note をオフ前に再オン) → 先のノートは新しい位置で閉じる
    const midiOv = buildMidi(480, [[...ev(0, 0x90, 60, 100), ...ev(240, 0x90, 60, 90), ...ev(480, 0x80, 60, 0), ...meta(0, 0x2f, [])]]);
    const songOv = parseMidi(midiOv);
    check("midi: 重なりノートは2つに分割", songOv !== null && songOv.notes.length === 2, `n=${songOv?.notes.length}`);
    if (songOv) {
      checkEq(songOv.notes[0]!.length, 240, "midi: 重なり1つ目は 240 クロック");
      checkEq(songOv.notes[1]!.clock, 240, "midi: 重なり2つ目は 240 から");
    }

    // ノートオフの無いノートは曲末で閉じられる
    const midiOpen = buildMidi(480, [[...ev(0, 0x90, 60, 100), ...ev(480, 0x90, 64, 80), ...meta(0, 0x2f, [])]]);
    const songOpen = parseMidi(midiOpen);
    check("midi: 未閉じノートも曲末で閉じる", songOpen !== null && songOpen.notes.length === 2, `n=${songOpen?.notes.length}`);

    // 不正なヘッダは失敗
    checkEq(parseMidi(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0])), null, "midi: 不正ヘッダは null");

    // ---- 和音分割 (splitOverlap) ----
    {
      // ch0 に同時3ノート (クロック0〜480) + 後続1ノート (960〜): 同時3音 → 3ユニット
      const chord = buildMidi(480, [
        [
          ...ev(0, 0x90, 60, 100),
          ...ev(0, 0x90, 64, 90), // 同時
          ...ev(0, 0x90, 67, 80), // 同時
          ...ev(480, 0x80, 60, 0),
          ...ev(0, 0x80, 64, 0),
          ...ev(0, 0x80, 67, 0),
          ...ev(960, 0x90, 72, 90), // 和音終了後の順次ノート → スロット0を再利用
          ...ev(960, 0x80, 72, 0),
          ...meta(0, 0x2f, []),
        ],
      ]);
      const bytes = convertMidiToPtcop(chord, { splitOverlap: true });
      check(bytes !== null, "split: 変換成功");
      if (bytes) {
        const svc = new Service();
        svc.initCollage(PXTN_MAX_EVENT_NUM);
        checkEq(svc.read(new MemoryIo(bytes)), PxtnErr.OK, "split: ptcop 読み込み成功");
        checkEq(svc.unitNum, 3, "split: 同時3音 → 3ユニット");
        checkEq(svc.unitGet(0)?.name, "channel-0-0", "split: ユニット名 channel-0-0");
        checkEq(svc.unitGet(1)?.name, "channel-0-1", "split: ユニット名 channel-0-1");
        checkEq(svc.unitGet(2)?.name, "channel-0-2", "split: ユニット名 channel-0-2");
        const ons = svc.evels.records.filter((e) => e.kind === EventKind.ON);
        checkEq(ons.length, 4, "split: ON 4つ (統合されない)");
        checkEq(ons.filter((e) => e.clock === 0).length, 3, "split: クロック0に ON 3つ");
        const seq = ons.find((e) => e.clock === 960);
        check(seq !== undefined && seq.unitNo === 0, "split: 順次ノートは unit0 を再利用", `unit=${seq?.unitNo}`);
      }
    }

    // ---- 分割なし: ユニット名は channel-{ch} ----
    {
      const m = buildMidi(480, [
        [...ev(0, 0x90, 60, 100), ...ev(480, 0x80, 60, 0), ...meta(0, 0x2f, [])],
        [...ev(0, 0x91, 64, 90), ...ev(480, 0x80, 64, 0), ...meta(0, 0x2f, [])],
      ]);
      const bytes = convertMidiToPtcop(m);
      check(bytes !== null, "name: 変換成功");
      if (bytes) {
        const svc = new Service();
        svc.initCollage(PXTN_MAX_EVENT_NUM);
        svc.read(new MemoryIo(bytes));
        checkEq(svc.unitGet(0)?.name, "channel-0", "name: ユニット名 channel-0");
        checkEq(svc.unitGet(1)?.name, "channel-1", "name: ユニット名 channel-1");
      }
    }

    // ---- 50ユニット上限クランプ ----
    {
      // 51音同時 (全ノートオンを tick 0 に置く) → ユニット数は 50 にクランプされる
      const events: number[] = [];
      for (let i = 0; i < 51; i++) events.push(...ev(0, 0x90, 21 + i, 100));
      for (let i = 0; i < 51; i++) events.push(...ev(480, 0x80, 21 + i, 0));
      events.push(...meta(0, 0x2f, []));
      const m = buildMidi(480, [events]);
      const bytes = convertMidiToPtcop(m, { splitOverlap: true });
      check(bytes !== null, "limit: 変換成功");
      if (bytes) {
        const svc = new Service();
        svc.initCollage(PXTN_MAX_EVENT_NUM);
        checkEq(svc.read(new MemoryIo(bytes)), PxtnErr.OK, "limit: ptcop 読み込み成功");
        checkEq(svc.unitNum, 50, "limit: ユニットは50にクランプ");
      }
    }
  }

  // ---- 27. OGGV 音色 ----
  {
    // pxtone-ts のテスト用 OGG フィクスチャ (2ch/44100Hz/1秒)
    const ogg = new Uint8Array(readFileSync(join(__dirname, "fixtures", "test-tone.ogg")));
    checkEq(String.fromCharCode(...ogg.subarray(0, 4)), "OggS", "oggv: フィクスチャのヘッダは OggS");

    // 音色追加 (未デコードのまま保持される)
    const addRes = await addWoice(ogg, WoiceType.OGGV);
    checkEq(addRes, null, "oggv: addWoice 成功");
    const svc = serviceMod.service;
    const w = svc.woiceGet(svc.woiceNum - 1)!;
    checkEq(w.type, WoiceType.OGGV, "oggv: タイプは OGGV");
    checkEq(w.isOggvDecoded(), false, "oggv: 追加直後は未デコード");
    const vc = w.getVoice(0)!;
    checkEq(vc.oggv?.ch, 2, "oggv: チャンネル 2");
    checkEq(vc.oggv?.sps, 44100, "oggv: サンプリングレート 44100");
    checkEq(vc.oggv?.smpNum, 44100, "oggv: サンプル数 44100");
    checkEq(vc.oggv?.data.length, ogg.length, "oggv: OGG データが保持される");

    // 保存: 未デコードのまま mateOGGV チャンクで書かれる (本家準拠)
    const bytes = exportBytes();
    check("oggv: exportBytes 成功", bytes !== null);
    if (bytes) {
      const ascii = new TextDecoder().decode(bytes);
      check("oggv: 保存は mateOGGV チャンク", ascii.includes("mateOGGV"));
    }

    // decodeProjectBytes (アプリの実動): デコード済みバイト列は PCM チャンクになり、
    // 書き出し ptcop のヘッダにエディタバージョン EXE_VER が記録される
    const decoded = bytes ? await decodeProjectBytes(bytes, serviceMod.EXE_VER) : null;
    check("oggv: decodeProjectBytes 成功", decoded !== null);
    if (decoded) {
      const ascii = new TextDecoder().decode(decoded);
      check("oggv: デコード後は mateOGGV が無い", !ascii.includes("mateOGGV"));
      check("oggv: デコード後は PCM チャンクになる", ascii.includes("matePCM"));
      // ヘッダ: 先頭 16 バイトの形式コード ("PTCOLLAGE-071119") の直後に exeVer が U16LE で続く
      const exeVer = decoded[16] | (decoded[17] << 8);
      checkEq(exeVer, serviceMod.EXE_VER, "oggv: デコード後 ptcop の exeVer は EXE_VER");
      checkEq(
        String.fromCharCode(...decoded.subarray(0, 16)),
        "PTCOLLAGE-071119",
        "oggv: デコード後 ptcop の形式コード",
      );
    }

    // exeVer 未指定なら従来どおり 0 (後方互換)
    const decodedDefault = bytes ? await decodeProjectBytes(bytes) : null;
    check("oggv: decodeProjectBytes (exeVer 未指定) 成功", decodedDefault !== null);
    if (decodedDefault) {
      checkEq(decodedDefault[16] | (decodedDefault[17] << 8), 0, "oggv: 未指定なら exeVer 0");
    }

    // デコード済み ptcop は再生準備 (tonesReady) が通る
    if (decoded) {
      const s2 = new Service();
      s2.initCollage(PXTN_MAX_EVENT_NUM);
      checkEq(s2.read(new MemoryIo(decoded)), PxtnErr.OK, "oggv: デコード後 ptcop 読み込み成功");
      checkEq(s2.tonesReady(), PxtnErr.OK, "oggv: デコード後 tonesReady 成功");
    }

    // Woice.decodeOggv で直接デコードできる
    checkEq(await w.decodeOggv(defaultOggvDecoder), PxtnErr.OK, "oggv: decodeOggv 成功");
    checkEq(w.isOggvDecoded(), true, "oggv: デコード済みになる");
  }

  // ---- 28. ファイル名ユーティリティ ----
  {
    checkEq(stripFileExt("song.ptcop"), "song", "fileutil: 拡張子を除去");
    checkEq(stripFileExt("song.tar.gz"), "song.tar", "fileutil: 最後の拡張子のみ除去");
    checkEq(stripFileExt("song"), "song", "fileutil: 拡張子なしはそのまま");
    checkEq(stripFileExt(".hidden"), ".hidden", "fileutil: 先頭ドットは除去しない");
    checkEq(stripFileExt("untitled."), "untitled", "fileutil: 末尾ドットも除去 (先頭以外の最後のドット以降)");
  }

  // ---- 29. 音色タイプ判別 (マジックバイト) ----
  {
    const enc = (s: string): Uint8Array => new Uint8Array([...new TextEncoder().encode(s), 0, 0, 0, 0]);
    checkEq(detectWoiceType(enc("PTVOICE-")), WoiceType.PTV, "woicetype: PTV を判別");
    checkEq(detectWoiceType(enc("PTNOISE-")), WoiceType.PTN, "woicetype: PTN を判別");
    checkEq(detectWoiceType(enc("OggS")), WoiceType.OGGV, "woicetype: OGG を判別");
    checkEq(detectWoiceType(enc("RIFF")), WoiceType.PCM, "woicetype: 不明なヘッダは PCM");
  }

  // ---- 30. Collage への音色追加 (編集中の ptvoice / ptnoise) ----
  {
    // 追加先は編集可能な Collage タブ (読み取り専用の pttune タブでは追加されない)
    newProjectInTab();

    const v = newVoice();
    const vBytes = snapshotVoice(v);
    check("collageadd: 編集中の ptvoice をバイト列化", vBytes !== null);
    const woiceNum0 = serviceMod.service.woiceNum;
    checkEq(await addWoice(vBytes!, WoiceType.PTV, "AddA"), null, "collageadd: ptvoice を追加");
    checkEq(serviceMod.service.woiceNum, woiceNum0 + 1, "collageadd: 音色数が1増える");
    const wv = serviceMod.service.woiceGet(woiceNum0)!;
    checkEq(wv.type, WoiceType.PTV, "collageadd: 追加した音色は PTV");
    checkEq(woiceName(wv), "AddA", "collageadd: ファイル名が音色名になる");

    const n = newNoise();
    const nBytes = snapshotNoise(n);
    check("collageadd: 編集中の ptnoise をバイト列化", nBytes !== null);
    checkEq(await addWoice(nBytes!, WoiceType.PTN, "AddB"), null, "collageadd: ptnoise を追加");
    const wn = serviceMod.service.woiceGet(woiceNum0 + 1)!;
    checkEq(wn.type, WoiceType.PTN, "collageadd: 追加した音色は PTN");
    checkEq(woiceName(wn), "AddB", "collageadd: ファイル名が音色名になる");

    // 追加した音色は ptcop に保存され、読み戻しても残る
    const projBytes = exportBytes();
    check("collageadd: ptcop を書き出し", projBytes !== null);
    const svc = new Service();
    svc.initCollage(PXTN_MAX_EVENT_NUM);
    checkEq(svc.read(new MemoryIo(projBytes!)), PxtnErr.OK, "collageadd: 書き出した ptcop を読み戻せる");
    checkEq(svc.woiceNum, woiceNum0 + 2, "collageadd: 読み戻した ptcop に追加した音色が残る");
  }

  // ---- 31. 音色を編集 (Collage の PTV/PTN をエディタで開く) ----
  {
    const s = serviceMod.service;
    // 30. で追加した PTV/PTN を対象にする (末尾2つ)
    const ptvW = s.woiceGet(s.woiceNum - 2)!;
    const ptnW = s.woiceGet(s.woiceNum - 1)!;
    checkEq(ptvW.type, WoiceType.PTV, "woiceedit: 対象の PTV を取得");
    checkEq(ptnW.type, WoiceType.PTN, "woiceedit: 対象の PTN を取得");
    checkEq(woiceNameRaw(ptvW), "AddA", "woiceedit: 名前をそのまま取り出せる (raw)");

    // 書き戻し先 (リンク) を付けて開く
    const link = { projectId: currentProjectId.value, woiceIndex: s.woiceNum - 2 };
    check("woiceedit: PTV を ptvoice エディタで開く", openWoiceAsVoice(ptvW, woiceNameRaw(ptvW), link));
    checkEq(currentVoice()?.fileName, "AddA", "woiceedit: ptvoice タブ名が音色名になる");
    checkEq(currentVoice()?.link?.projectId, link.projectId, "woiceedit: ptvoice の書き戻し先 projectId (reactive)");
    checkEq(currentVoice()?.link?.woiceIndex, link.woiceIndex, "woiceedit: ptvoice の書き戻し先 woiceIndex (reactive)");
    checkEq(
      currentVoice()?.woice.getVoice(0)?.wave.num,
      ptvW.getVoice(0)?.wave.num,
      "woiceedit: 波形データが引き継がれる",
    );

    const ptn = ptnW.getVoice(0)!.ptn;
    const ptnLink = { projectId: currentProjectId.value, woiceIndex: s.woiceNum - 1 };
    check("woiceedit: PTN を ptnoise エディタで開く", openPtnAsNoise(ptn, woiceNameRaw(ptnW), ptnLink));
    checkEq(currentNoise()?.fileName, "AddB", "woiceedit: ptnoise タブ名が音色名になる");
    checkEq(currentNoise()?.link?.projectId, ptnLink.projectId, "woiceedit: ptnoise の書き戻し先 projectId (reactive)");
    checkEq(currentNoise()?.link?.woiceIndex, ptnLink.woiceIndex, "woiceedit: ptnoise の書き戻し先 woiceIndex (reactive)");
    checkEq(
      currentNoise()?.noise.getUnit(0)?.main.freq,
      ptn.getUnit(0)?.main.freq,
      "woiceedit: ノイズ内容が引き継がれる",
    );

    // リンクなし (通常のファイルオープン) では書き戻し先を持たない
    checkEq(newVoice().link, undefined, "woiceedit: 新規タブはリンクなし");
    checkEq(newNoise().link, undefined, "woiceedit: 新規ノイズタブはリンクなし");

    // 名前なしの音色は空文字列 ("(no name)" は表示用のみ)
    const anon = new Woice();
    anon.voiceAllocate(1);
    checkEq(woiceNameRaw(anon), "", "woiceedit: 名前なしは空文字列 (raw)");
    checkEq(woiceName(anon), "(no name)", "woiceedit: 名前なしは表示用に (no name)");
  }

  // ---- 32. 変更を適用 (リンク付き voice/noise → 元の Collage 音色) ----
  {
    // 書き戻し先になる Collage プロジェクト (現在のタブ)
    const projA = newProjectInTab();
    const vDoc = newVoice();
    const vBytes = snapshotVoice(vDoc)!;
    checkEq(await addWoice(vBytes, WoiceType.PTV, "ApplyA"), null, "apply: 対象の PTV を用意");
    const idxA = serviceMod.service.woiceNum - 1;
    checkEq(serviceMod.service.woiceGet(idxA)!.getVoice(0)!.volume, 64, "apply: PTV の初期ボリューム");

    // 編集した音色を現在のタブへ適用する
    vDoc.woice.getVoice(0)!.volume = 77;
    const undoLen = projA.undoStack.length;
    checkEq(
      applyWoiceLink({ projectId: projA.id, woiceIndex: idxA }, snapshotVoice(vDoc)!, WoiceType.PTV),
      null,
      "apply: 現在のタブへ適用",
    );
    checkEq(serviceMod.service.woiceGet(idxA)!.getVoice(0)!.volume, 77, "apply: 対象音色の内容が更新される");
    checkEq(projA.undoStack.length, undoLen + 1, "apply: undo エントリが積まれる");
    check("apply: 対象プロジェクトが dirty になる", projA.dirty);
    check("apply: undo が成功する", undo());
    checkEq(serviceMod.service.woiceGet(idxA)!.getVoice(0)!.volume, 64, "apply: undo で適用前に戻る");

    // 現在のタブでないプロジェクトへも書き戻せる (対象プロジェクトの Service を直接操作)
    const projB = newProjectInTab();
    vDoc.woice.getVoice(0)!.volume = 55;
    checkEq(
      applyWoiceLink({ projectId: projA.id, woiceIndex: idxA }, snapshotVoice(vDoc)!, WoiceType.PTV),
      null,
      "apply: 別プロジェクトへ適用",
    );
    check("apply: 別プロジェクトが dirty になる", projA.dirty);
    switchProject(projA.id);
    checkEq(serviceMod.service.woiceGet(idxA)!.getVoice(0)!.volume, 55, "apply: 切り替え後に内容を確認できる");
    check("apply: 別プロジェクトの undo も積まれている", canUndo.value);
    check("apply: 別プロジェクトでも undo できる", undo());
    checkEq(serviceMod.service.woiceGet(idxA)!.getVoice(0)!.volume, 64, "apply: 別プロジェクトの undo で戻る");

    // PTN (ノイズ) の書き戻し
    switchProject(projB.id);
    const nDoc = newNoise();
    nDoc.noise.getUnit(0)!.main.freq = 550;
    checkEq(await addWoice(snapshotNoise(nDoc)!, WoiceType.PTN, "ApplyB"), null, "apply: 対象の PTN を用意");
    const idxB = serviceMod.service.woiceNum - 1;
    nDoc.noise.getUnit(0)!.main.freq = 660;
    checkEq(
      applyWoiceLink({ projectId: projB.id, woiceIndex: idxB }, snapshotNoise(nDoc)!, WoiceType.PTN),
      null,
      "apply: PTN を適用",
    );
    checkEq(
      serviceMod.service.woiceGet(idxB)!.getVoice(0)!.ptn.getUnit(0)!.main.freq,
      660,
      "apply: ノイズ内容が更新される",
    );

    // 変更を適用するとタブの dirty が解除される (タブの link アイコンの色が戻る)
    editVoice(() => {});
    check("apply: 編集でタブが dirty になる", currentVoice()!.dirty);
    const vUndoLen = currentVoice()!.undoStack.length;
    markVoiceClean();
    check("apply: 適用で dirty が解除される", !currentVoice()!.dirty);
    checkEq(currentVoice()!.undoStack.length, vUndoLen, "apply: 解除しても undo スタックは残る");

    editNoise(() => {});
    check("apply: ノイズも編集で dirty になる", currentNoise()!.dirty);
    markNoiseClean();
    check("apply: ノイズも適用で dirty が解除される", !currentNoise()!.dirty);

    // エラー系: 対象の音色を壊さない
    check(
      "apply: 範囲外 index はエラー",
      applyWoiceLink({ projectId: projB.id, woiceIndex: 999 }, snapshotNoise(nDoc)!, WoiceType.PTN) !== null,
    );
    check(
      "apply: 存在しないプロジェクトはエラー",
      applyWoiceLink({ projectId: 99999, woiceIndex: 0 }, snapshotNoise(nDoc)!, WoiceType.PTN) !== null,
    );
    const woiceNum = serviceMod.service.woiceNum;
    check(
      "apply: 不正なバイト列はエラー",
      applyWoiceLink({ projectId: projB.id, woiceIndex: idxB }, new Uint8Array([1, 2, 3]), WoiceType.PTN) !== null,
    );
    checkEq(serviceMod.service.woiceNum, woiceNum, "apply: 不正なバイト列でも音色は消えない");
    checkEq(
      serviceMod.service.woiceGet(idxB)!.getVoice(0)!.ptn.getUnit(0)!.main.freq,
      660,
      "apply: 不正なバイト列でも対象音色は無傷",
    );

    // pttune (再生専用) へは適用できない
    const projTune = newProjectInTab("tune");
    check(
      "apply: 読み取り専用プロジェクトはエラー",
      applyWoiceLink({ projectId: projTune.id, woiceIndex: 0 }, snapshotNoise(nDoc)!, WoiceType.PTN) !== null,
    );
  }

  // ---- 33. File メニューの「変更を適用」の位置 ----
  {
    const ops = {
      new: () => {},
      open: () => {},
      save: () => {},
      saveAs: () => {},
      close: () => {},
      undo: () => {},
      redo: () => {},
      canUndo: () => false,
      canRedo: () => false,
    };
    // voice/noise は beforeSave に「変更を適用」を渡す (プロジェクトを保存の手前)
    const labels = buildFileMenu(ops, [], [{ label: "APPLY" }]).map((m) => (m.sep ? "-" : (m.label ?? "")));
    check(
      "filemenu: 変更を適用はプロジェクトを保存の手前",
      labels.indexOf("APPLY") >= 0 && labels.indexOf("APPLY") < labels.indexOf(t("menu.file.save")),
    );
    // collage (beforeSave 省略) では入らない
    check("filemenu: 省略時は変更を適用なし", !buildFileMenu(ops, []).some((m) => m.label === "APPLY"));
    // extra は従来どおり保存系の後ろ
    const labels2 = buildFileMenu(ops, [{ label: "EXTRA" }], [{ label: "APPLY" }]).map((m) => (m.sep ? "-" : (m.label ?? "")));
    check(
      "filemenu: extra は保存系の後ろ",
      labels2.indexOf("EXTRA") > labels2.indexOf(t("menu.file.saveAs")),
    );
  }

  // ---- 34. 音量スライダーの永続化 (localStorage) ----
  {
    // localStorage をスタブして往復させる (node には localStorage がないため)
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => void store.set(k, v),
    };
    const VOLUME_KEY = "pxtone-garage-master-volume";

    setMasterVolume(0.25);
    checkEq(store.get(VOLUME_KEY), "0.25", "volume: 変更でブラウザに保存される");

    // 別セッション相当 (保存値だけが残った状態) からの復元
    masterVolume.value = 1.0;
    initMasterVolume();
    checkEq(masterVolume.value, 0.25, "volume: 起動時に保存値が復元される");

    store.set(VOLUME_KEY, "abc");
    initMasterVolume();
    checkEq(masterVolume.value, 1.0, "volume: 不正値は既定 1.0");

    store.set(VOLUME_KEY, "5");
    initMasterVolume();
    checkEq(masterVolume.value, 1.0, "volume: 範囲外はクランプ (上限)");

    store.set(VOLUME_KEY, "-1");
    initMasterVolume();
    checkEq(masterVolume.value, 0.0, "volume: 範囲外はクランプ (下限)");

    store.delete(VOLUME_KEY);
    masterVolume.value = 0.5;
    initMasterVolume();
    checkEq(masterVolume.value, 1.0, "volume: 未保存は既定 1.0");

    delete (globalThis as { localStorage?: unknown }).localStorage;
  }

  // ---- 35. ptnoise のレイヤー数 (ファイルに無いレイヤーも 4 つ表示する) ----
  {
    // 1 ユニットだけの ptnoise を手組みする (本家 ptNoise で保存したファイル相当)
    const one = new Noise();
    one.allocate(1, NOISE_ENVE_NUM);
    one.setSmpNum44k(44100);
    const u0 = one.getUnit(0)!;
    u0.bEnable = true;
    u0.pan = -30;
    u0.enveNum = 2;
    u0.enves = [
      { x: 0, y: 100 },
      { x: 500, y: 0 },
    ];
    u0.main = { type: WaveType.Sine, freq: 440, volume: 50, offset: 0, bRev: false };
    const io1 = new MemoryIo();
    check("layers: 1ユニットの ptnoise を書き出せる", one.write(io1));
    const bytes1 = io1.toUint8Array();

    checkEq(openNoise(bytes1, "One"), null, "layers: 1ユニットの ptnoise を開く");
    const d1 = currentNoise()!;
    checkEq(d1.noise.unitNum, NOISE_UNIT_NUM, "layers: 開いた直後から4レイヤーある");
    check(
      "layers: ファイルのレイヤーは内容を保つ",
      d1.noise.getUnit(0)!.bEnable && d1.noise.getUnit(0)!.pan === -30 && d1.noise.getUnit(0)!.enveNum === 2,
    );
    check("layers: 追加されたレイヤーは無効", !d1.noise.getUnit(1)!.bEnable && !d1.noise.getUnit(3)!.bEnable);
    checkEq(d1.noise.getUnit(3)!.enveNum, NOISE_ENVE_NUM, "layers: 追加レイヤーのエンベロープ数");
    // 無効レイヤーは書き出されないため、保存バイト列は元のまま
    checkBytes(snapshotNoise(d1)!, bytes1, "layers: 保存バイト列は元と同じ");

    // undo (バイト列からの復元) でも 4 レイヤーのまま
    editNoise(() => {
      d1.noise.getUnit(0)!.pan = 10;
    });
    check("layers: undo できる", undoNoise());
    checkEq(d1.noise.unitNum, NOISE_UNIT_NUM, "layers: undo 後も4レイヤーある");
    checkEq(d1.noise.getUnit(0)!.pan, -30, "layers: undo で内容が戻る");

    // 3 ユニットの ptnoise も 4 レイヤー表示になる
    const three = new Noise();
    three.allocate(3, NOISE_ENVE_NUM);
    three.setSmpNum44k(44100);
    for (let u = 0; u < 3; u++) {
      const unit = three.getUnit(u)!;
      unit.bEnable = true;
      unit.main = { type: WaveType.Sine, freq: 220 * (u + 1), volume: 50, offset: 0, bRev: false };
    }
    const io3 = new MemoryIo();
    check("layers: 3ユニットの ptnoise を書き出せる", three.write(io3));
    const bytes3 = io3.toUint8Array();
    checkEq(openNoise(bytes3, "Three"), null, "layers: 3ユニットの ptnoise を開く");
    const d3 = currentNoise()!;
    checkEq(d3.noise.unitNum, NOISE_UNIT_NUM, "layers: 3ユニットでも4レイヤー表示");
    check("layers: 4レイヤー目だけ無効", d3.noise.getUnit(2)!.bEnable && !d3.noise.getUnit(3)!.bEnable);
    checkBytes(snapshotNoise(d3)!, bytes3, "layers: 3ユニットでも保存バイト列は元と同じ");
  }

  // ---- 36. ビルド履歴はタブごとに独立する ----
  {
    const a = newNoise();
    pushNoiseHistory(new Float32Array([0, 0]), "A1");
    checkEq(a.history.length, 1, "history: タブAに1件積まれる");
    checkEq(a.history[0]!.label, "A1", "history: ラベルが入る");

    // 別タブでは履歴が空 (履歴がファイルを跨がない)
    const b = newNoise();
    checkEq(b.history.length, 0, "history: 別タブの履歴は空");
    pushNoiseHistory(new Float32Array([0, 0]), "B1");
    checkEq(b.history.length, 1, "history: タブBに1件積まれる");

    // タブを行き来しても互いの履歴が混ざらない
    switchNoise(a.id);
    checkEq(currentNoise()!.history.length, 1, "history: タブAへ戻ると1件のまま");
    checkEq(currentNoise()!.history[0]!.label, "A1", "history: タブAの内容が残っている");

    // 連続ビルド (2秒以内) は直前のエントリを置き換える
    pushNoiseHistory(new Float32Array([0, 0]), "A2");
    checkEq(a.history.length, 1, "history: 連続ビルドは置き換え");
    checkEq(a.history[0]!.label, "A2", "history: 置き換え後のラベル");

    switchNoise(b.id);
    checkEq(currentNoise()!.history[0]!.label, "B1", "history: タブBの履歴は影響を受けない");
  }

  // ---- 37. リンクなしで音色を開く (pttune の「音色を開く」) ----
  {
    // PTV 音色を用意して、リンクなしで開く (「変更を適用」の対象を持たない)
    const src = newVoice();
    const w = new Woice();
    checkEq(w.read(new MemoryIo(snapshotVoice(src)!), WoiceType.PTV), PxtnErr.OK, "open: 元の PTV を用意");
    const tabNum = voices.value.length;
    check("open: リンクなしで音色を開ける", openWoiceAsVoice(w, "Copy"));
    checkEq(voices.value.length, tabNum + 1, "open: 新しいタブが増える");
    checkEq(currentVoice()!.fileName, "Copy", "open: ファイル名が入る");
    checkEq(currentVoice()!.link, undefined, "open: link を持たない (書き戻し先なし)");

    // link 付きで開けば書き戻し先を持つ (ptcop の「音色を編集」)
    check("open: リンク付きでも開ける", openWoiceAsVoice(w, "Linked", { projectId: 1, woiceIndex: 0 }));
    checkEq(currentVoice()!.link?.woiceIndex, 0, "open: link を持てる");
  }

  // ---- 38. 初期タブの置き換え (無題の音色を開いたタブは置き換えない) ----
  {
    // 起動直後 (初期タブだけ) の状態にする
    for (const v of [...voices.value]) closeVoice(v.id);
    checkEq(voices.value.length, 0, "replace: voice のタブを空にする");
    ensureInitialVoice();
    checkEq(voices.value.length, 1, "replace: 初期タブが1つできる");
    check("replace: 初期タブに印が付く", voices.value[0]!.initial);

    // 名前の無い ptvoice を開くと初期タブを置き換える
    const dw = createDefaultWoice();
    const io = new MemoryIo();
    check("replace: 無題の ptvoice を用意", dw.ptvWrite(io) >= 0);
    const unnamedVoice = io.toUint8Array();
    checkEq(openVoice(unnamedVoice, ""), null, "replace: 無題の ptvoice を開く");
    checkEq(voices.value.length, 1, "replace: 初期タブが置き換わる");
    check("replace: 置き換えたタブは初期タブではない", !voices.value[0]!.initial);

    // 無題のまま続けて開いても、置き換えずにタブが増える
    checkEq(openVoice(unnamedVoice, ""), null, "replace: 2つ目の無題 ptvoice を開く");
    checkEq(voices.value.length, 2, "replace: 2つ目は新しいタブになる");
    check("replace: 1つ目のタブが残っている", voices.value[0]!.fileName === "" && voices.value[0]!.woice !== undefined);

    // noise も同じ扱い
    for (const n of [...noises.value]) closeNoise(n.id);
    ensureInitialNoise();
    checkEq(noises.value.length, 1, "replace: noise の初期タブが1つできる");
    check("replace: noise の初期タブに印が付く", noises.value[0]!.initial);
    const io2 = new MemoryIo();
    check("replace: 無題の ptnoise を用意", createDefaultNoise().write(io2));
    const unnamedNoise = io2.toUint8Array();
    checkEq(openNoise(unnamedNoise, ""), null, "replace: 無題の ptnoise を開く");
    checkEq(noises.value.length, 1, "replace: noise の初期タブが置き換わる");
    checkEq(openNoise(unnamedNoise, ""), null, "replace: 2つ目の無題 ptnoise を開く");
    checkEq(noises.value.length, 2, "replace: noise も2つ目は新しいタブになる");
  }

  // ---- 39. スコープ操作 (コピー / 切り取り / クリア / 消去 / 貼り付け / 挿入 / 移調) ----
  {
    // 直前のセクションが tune (再生専用) タブのままなので、編集可能な ptcop タブを用意する
    // (tune の Service は evels 容量 0 のためレコードを積めず、readOnly で mutate も無効。
    // ユニットが無いと commitEdit の sync → cleanupSelection が focusUnit を -1 に戻すため追加する)
    newProjectInTab();
    addUnit(); // unit0 (スコープ操作の対象)
    addUnit(); // unit1 (対象外ユニットの確認用)

    const s = serviceMod.service;
    const kindsAt = (clock: number, unitNo: number, kind: EventKind) =>
      getAllEvents().find((e) => e.clock === clock && e.unitNo === unitNo && e.kind === kind);
    const keyOf = (clock: number, unitNo: number) => kindsAt(clock, unitNo, EventKind.KEY)?.value ?? -1;

    // unit0 / unit1 にイベントを用意
    doc.selectedUnits = [];
    doc.focusUnit = 0;
    doc.mode = "U";
    doc.copier.fill(true);
    s.evels.clear();
    s.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    s.evels.recordAddI(0, 0, EventKind.VELOCITY, 64);
    s.evels.recordAddI(0, 0, EventKind.ON, 480);
    s.evels.recordAddI(480, 0, EventKind.KEY, 0x6100); // 範囲外 (詰められ側)
    s.evels.recordAddI(240, 1, EventKind.VELOCITY, 80); // 対象外ユニット

    // クリップボード初期状態 (何もないので貼り付けメニューが非活性)
    checkEq(scopeClipReady(), false, "スコープ: 初期クリップボードは空");

    // ---- クリア (範囲内を消す。後続は詰めない) ----
    scopeClear(0, 240);
    check("クリア: 範囲内の KEY が消える", !kindsAt(0, 0, EventKind.KEY));
    check("クリア: 範囲内の VELOCITY が消える", !kindsAt(0, 0, EventKind.VELOCITY));
    check("クリア: 範囲内の ON は丸ごと消える", !kindsAt(0, 0, EventKind.ON));
    check("クリア: 後続は詰めない", keyOf(480, 0) === 0x6100);
    check("クリア: 対象外ユニットは残る", kindsAt(240, 1, EventKind.VELOCITY)?.value === 80);

    // ---- 消去 (消して詰める) ----
    scopeDelete(0, 480);
    check("消去: 後続のイベントが前に詰まる", keyOf(0, 0) === 0x6100);
    check("消去: 対象外ユニットは詰めない", kindsAt(240, 1, EventKind.VELOCITY)?.value === 80);

    // ---- コピー (単一ユニット) + 貼り付け ----
    s.evels.recordAddI(240, 0, EventKind.ON, 720); // 末尾をまたぐ ON ([0,480) 内)
    scopeCopy(0, 480);
    checkEq(scopeClipReady(), true, "コピー: クリップボードに載る");
    scopePaste(960);
    check("貼り付け: KEY が載る", keyOf(960, 0) === 0x6100);
    checkEq(kindsAt(1200, 0, EventKind.ON)?.value, 240, "貼り付け: ON は範囲末尾でクリップされる (長さ = 480 - clock)");
    check(
      "貼り付け: 対象外ユニットは載らない",
      getAllEvents().filter((e) => e.unitNo === 1).length === 1 &&
        kindsAt(240, 1, EventKind.VELOCITY)?.value === 80,
    );

    // 書き込み領域の既存イベントは種別ごとに消してから載る (上書き貼り付け)
    s.evels.recordAddI(960, 0, EventKind.VELOCITY, 128);
    s.evels.recordAddI(1440, 0, EventKind.VELOCITY, 99); // 領域外は消えない
    scopePaste(960);
    check("貼り付け: 上書きでクリップに無い VELOCITY も領域内から消える", !kindsAt(960, 0, EventKind.VELOCITY));
    checkEq(kindsAt(1440, 0, EventKind.VELOCITY)?.value, 99, "貼り付け: 領域外の既存イベントは消えない");

    // ---- 種別フィルタ (コピーパネル) ----
    s.evels.clear();
    s.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    s.evels.recordAddI(0, 0, EventKind.ON, 480);
    doc.copier.fill(true);
    doc.copier[0] = false; // ON を外す (ON はコピーしない)
    scopeCopy(0, 480);
    scopePaste(960);
    check("フィルタ: KEY は載る", keyOf(960, 0) === 0x6000);
    check("フィルタ: ON は載らない", !kindsAt(960, 0, EventKind.ON));
    doc.copier.fill(true);

    // ---- 切り取り (フィルタなしコピー + 消去 + コピーパネル全 ON) ----
    scopeCut(0, 480);
    check("切り取り: 範囲のイベントが消える", !kindsAt(0, 0, EventKind.KEY) && !kindsAt(0, 0, EventKind.ON));
    check("切り取り: 内容はクリップボードへ", scopeClipReady());
    checkEq(doc.copier.every((v) => v), true, "切り取り: コピーパネルが全 ON になる");
    scopeInsert(0);
    check("切り取り+挿入: 位置 0 に戻せる", keyOf(0, 0) === 0x6000);

    // ---- 単一ユニットコピーの振り直し (フォーカスユニット変更) ----
    s.evels.clear();
    s.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    s.evels.recordAddI(0, 0, EventKind.ON, 480);
    doc.focusUnit = 1;
    scopeCopy(0, 480); // unit1 (フォーカス) の範囲には何もない → 空
    checkEq(scopeClipReady(), false, "振り直し: フォーカス外のイベントはコピーされない");
    doc.focusUnit = 0;
    scopeCopy(0, 480);
    checkEq(keyOf(0, 0), 0x6000, "振り直し: コピーしても元ユニットは編集されない");
    doc.focusUnit = 1;
    scopePaste(960);
    check("振り直し: 単独コピーはフォーカスユニットに載る", kindsAt(960, 1, EventKind.KEY)?.value === 0x6000);

    // ---- 移調 (KEY 値 0x100/半音、加算は上限クランプ) ----
    doc.focusUnit = 0;
    s.evels.clear();
    s.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    changeEventValue(0, 480, EventKind.KEY, 3 * 0x100); // +3 半音
    checkEq(keyOf(0, 0), 0x6000 + 3 * 0x100, "移調: +3 半音");
    changeEventValue(0, 480, EventKind.KEY, -3 * 0x100);
    checkEq(keyOf(0, 0), 0x6000, "移調: -3 半音で戻る");
    changeEventValue(0, 480, EventKind.KEY, 999 * 0x100);
    checkEq(keyOf(0, 0), 49151, "移調: KEY 値は上限でクランプ");
    changeEventValue(0, 480, EventKind.KEY, -999 * 0x100);
    checkEq(keyOf(0, 0), 0, "移調: KEY 値は下限でクランプ");

    // ---- 挿入 (後続をずらして空いた位置へ貼る) ----
    s.evels.clear();
    s.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    s.evels.recordAddI(0, 0, EventKind.ON, 480);
    s.evels.recordAddI(240, 1, EventKind.VELOCITY, 80); // 対象外ユニット (動かない)
    scopeCopy(0, 480);
    s.evels.recordAddI(480, 0, EventKind.KEY, 0x6100); // 挿入位置の後続 (ずらされる側)
    scopeInsert(480);
    check("挿入: 貼り付け位置に載る", keyOf(480, 0) === 0x6000);
    checkEq(keyOf(960, 0), 0x6100, "挿入: 後続が幅分ずれる (KEY@480 → 960)");
    checkEq(kindsAt(240, 1, EventKind.VELOCITY)?.value, 80, "挿入: 対象外ユニットは動かない");

    // ---- 切り取りの undo ----
    s.evels.clear();
    s.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    scopeCut(0, 240);
    check("切り取り: undo 前に消えている", !kindsAt(0, 0, EventKind.KEY));
    check("切り取り: undo できる", undo());
    checkEq(keyOf(0, 0), 0x6000, "切り取り: undo で戻る");

    // 後続テストのため編集対象とコピーパネルを戻す
    doc.focusUnit = -1;
    doc.selectedUnits = [];
    doc.copier.fill(true);
    doc.mode = "U";
  }

  // ---- 40. WAV書き出しオプション (本家 dlg_BuildOption 相当) ----
  {
    // WAV ヘッダ (fmt ch / sps / data サイズ) を読む
    const wavInfo = (wav: Uint8Array): { ch: number; sps: number; dataSize: number } => {
      const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
      return { ch: dv.getUint16(22, true), sps: dv.getUint32(24, true), dataSize: dv.getUint32(40, true) };
    };
    // data チャンクに非ゼロサンプルがあるか
    const wavHasSignal = (wav: Uint8Array): boolean => {
      const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.byteLength - 44) >> 1);
      for (let i = 0; i < pcm.length; i++) {
        if (pcm[i] !== 0) return true;
      }
      return false;
    };

    // PCM 音色 + ノート 1 つ (4拍) のプロジェクトを用意する
    newProjectInTab();
    checkEq(await addWoice(buildPcmWav(), WoiceType.PCM, "WavTest"), null, "wavexport: PCM音色を追加");
    const wvIdx = serviceMod.service.woiceNum - 1;
    checkEq(addUnitWithWoice("W", wvIdx), true, "wavexport: ユニットを追加");
    const ws = serviceMod.service;
    ws.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    ws.evels.recordAddI(0, 0, EventKind.VELOCITY, 100);
    ws.evels.recordAddI(0, 0, EventKind.ON, 480 * 4);
    const wavBytes = exportBytes();
    check("wavexport: ptcop を書き出し", wavBytes !== null);

    // 既定値 (最後まで / ステレオ / 44100Hz): 演奏データの末尾までの長さになる
    const def = await renderWav(wavBytes!, { ...WAV_EXPORT_DEFAULTS });
    check("wavexport: 既定値でレンダリングできる", "wav" in def);
    if ("wav" in def) {
      const info = wavInfo(def.wav);
      checkEq(info.ch, 2, "wavexport: 既定はステレオ");
      checkEq(info.sps, 44100, "wavexport: 既定は 44100Hz");
      // 本家と同じ規則 (master.playMeas まで) のフレーム数 + ch2 + 16bit
      const frames = pxtnServiceMooCalcSampleNum(
        ws.master.playMeas,
        ws.master.beatNum,
        44100,
        ws.master.beatTempo,
      );
      checkEq(info.dataSize, frames * 2 * 2, "wavexport: 最後までのデータ長");
      check("wavexport: PCM が無音でない", wavHasSignal(def.wav));
    }

    // モノラル / 22050Hz / 演奏時間 0.5 秒: ch と長さが指定どおりになる
    const mono = await renderWav(wavBytes!, {
      ...WAV_EXPORT_DEFAULTS,
      chNum: 1,
      sps: 22050,
      scope: "byTime",
      playTimeSec: 0.5,
    });
    check("wavexport: モノラル + 時間指定でレンダリングできる", "wav" in mono);
    if ("wav" in mono) {
      const info = wavInfo(mono.wav);
      checkEq(info.ch, 1, "wavexport: モノラル指定");
      checkEq(info.sps, 22050, "wavexport: 22050Hz 指定");
      checkEq(info.dataSize, 11025 * 2, "wavexport: 演奏時間ぶんのデータ長");
    }

    // 追加フェードアウト: 末尾にフェード区間ぶんの長さが加わる
    const faded = await renderWav(wavBytes!, {
      ...WAV_EXPORT_DEFAULTS,
      sps: 22050,
      scope: "byTime",
      playTimeSec: 1,
      extraFadeSec: 0.5,
    });
    check("wavexport: フェードアウト付きでレンダリングできる", "wav" in faded);
    if ("wav" in faded) {
      checkEq(wavInfo(faded.wav).dataSize, (22050 + 11025) * 2 * 2, "wavexport: フェード区間が末尾に加算される");
    }

    // ユニットミュート: muteByUnit=true ではミュート中のユニットが鳴らない
    const muted = await renderWav(wavBytes!, { ...WAV_EXPORT_DEFAULTS, muteByUnit: true, mutedUnits: [0] });
    check("wavexport: ミュート有効でレンダリングできる", "wav" in muted);
    if ("wav" in muted) {
      check("wavexport: ミュート中のユニットは無音", !wavHasSignal(muted.wav));
    }
    const unmuted = await renderWav(wavBytes!, { ...WAV_EXPORT_DEFAULTS, muteByUnit: false, mutedUnits: [0] });
    check("wavexport: ミュート無効なら鳴る", "wav" in unmuted && wavHasSignal(unmuted.wav));
  }

  // ---- 41. 音色プロパティ編集 (本家 dlg_Woice 相当) ----
  {
    newProjectInTab();
    checkEq(await addWoice(buildPcmWav(), WoiceType.PCM, "Prop"), null, "woiceprop: PCM音色を追加");
    const pIdx = serviceMod.service.woiceNum - 1;

    // 名前 / tuning / basic key / フラグをまとめて変更
    setWoiceProperties(pIdx, {
      name: "あいうえおかきくけこ",
      tuning: 2.5,
      basicKey: 48,
      waveLoop: true,
      smooth: false,
      beatFit: true,
    });
    let w = serviceMod.service.woiceGet(pIdx)!;
    checkEq(woiceNameRaw(w), "あいうえおかきく", "woiceprop: 名前は ShiftJIS 16 バイトで切り詰め");
    checkEq(w.getVoice(0)!.tuning, 2.5, "woiceprop: tuning が反映される");
    checkEq(w.getVoice(0)!.basicKey, 48 * 0x100, "woiceprop: basicKey が反映される");
    checkEq(w.getVoice(0)!.voiceFlags & 7, 1 | 4, "woiceprop: Loop / Beat Fit が反映される");

    // 範囲外はクランプされる (本家 dlg_Woice と同じ範囲)
    setWoiceProperties(pIdx, {
      name: "Prop",
      tuning: 999,
      basicKey: 200,
      waveLoop: false,
      smooth: false,
      beatFit: false,
    });
    w = serviceMod.service.woiceGet(pIdx)!;
    checkEq(w.getVoice(0)!.tuning, 256, "woiceprop: tuning は 256 にクランプ");
    checkEq(w.getVoice(0)!.basicKey, 108 * 0x100, "woiceprop: basicKey は 108 にクランプ");

    // 1 操作 = 1 undo (名前・プロパティがまとめて戻る)
    check("woiceprop: undo できる", undo());
    w = serviceMod.service.woiceGet(pIdx)!;
    checkEq(woiceNameRaw(w), "あいうえおかきく", "woiceprop: undo で編集前の名前へ戻る");
    checkEq(w.getVoice(0)!.tuning, 2.5, "woiceprop: undo で tuning も戻る");

    // PTV は本家同様、名前のみ反映し tuning / basic key / フラグは変更しない
    const vDoc = newVoice();
    checkEq(await addWoice(snapshotVoice(vDoc)!, WoiceType.PTV, "PropPTV"), null, "woiceprop: PTV を追加");
    const vIdx = serviceMod.service.woiceNum - 1;
    const before = serviceMod.service.woiceGet(vIdx)!.getVoice(0)!;
    const beforeTuning = before.tuning;
    const beforeKey = before.basicKey;
    const beforeFlags = before.voiceFlags;
    setWoiceProperties(vIdx, {
      name: "PTVName",
      tuning: 3,
      basicKey: 21,
      waveLoop: true,
      smooth: true,
      beatFit: true,
    });
    const pw = serviceMod.service.woiceGet(vIdx)!;
    checkEq(woiceNameRaw(pw), "PTVName", "woiceprop: PTV の名前は反映される");
    checkEq(pw.getVoice(0)!.tuning, beforeTuning, "woiceprop: PTV の tuning は変わらない");
    checkEq(pw.getVoice(0)!.basicKey, beforeKey, "woiceprop: PTV の basicKey は変わらない");
    checkEq(pw.getVoice(0)!.voiceFlags, beforeFlags, "woiceprop: PTV のフラグは変わらない");
  }

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})();