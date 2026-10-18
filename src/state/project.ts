// プロジェクト状態 (reactive) と編集 API。
// 編集の正本は service (state/service.ts) で、ここではUIが購読するミラーと
// ミューテーションのラッパーを提供する。
import { reactive, ref } from "vue";
import {
  WoiceType,
  EventKind,
  PxtnErr,
  MemoryIo,
  eventKindIsTail,
  shiftJisToString,
  EVENTDEFAULT_KEY,
  EVENTDEFAULT_VELOCITY,
  EVENTDEFAULT_VOLUME,
  EVENTDEFAULT_PAN_VOLUME,
  EVENTDEFAULT_PAN_TIME,
  EVENTDEFAULT_PORTAMENT,
  EVENTDEFAULT_VOICENO,
  EVENTDEFAULT_GROUPNO,
  EVENTDEFAULT_TUNING,
  EVENTDEFAULT_BASICKEY,
  PTV_VOICEFLAG_SMOOTH,
  PTV_VOICEFLAG_WAVELOOP,
  PTV_VOICEFLAG_BEATFIT,
  defaultOggvDecoder,
  ioPutUint32LE,
  ioPutUint16LE,
  ioPutFloatLE,
  ioPutInt32LE,
  type EveRecord,
} from "pxtone-ts";
import { encodeShiftJis, truncateShiftJis } from "../lib/sjis";
import type { EventWriteOps } from "../lib/editing";
import { COPIER_KINDS } from "../lib/eventKinds";
import { service, ensureService } from "./service";
import { pushUndo, clearUndo, snapshotProject } from "./undo";
import { t } from "../i18n";

export type ToolMode = "W" | "U";

// CopierPanel の KINDS 数 (イベント種類 index 0..8)
const COPIER_KIND_NUM = 9;

export interface UnitInfo {
  index: number;
  name: string;
  woiceIndex: number; // 割り当て済み音色 index (-1 = なし)
  muted: boolean;
  visible: boolean; // ピアノロールにノート表示するか
  pinned: boolean; // ピン留め (上部レーン固定)
  soloed: boolean; // ソロ中
}

export interface WoiceInfo {
  index: number;
  name: string;
  type: WoiceType;
  typeName: string;
}

export interface DelayInfo {
  index: number;
  unit: number;
  freq: number;
  rate: number;
  group: number;
}

export interface OverdriveInfo {
  index: number;
  cut: number;
  amp: number;
  group: number;
}

export const doc = reactive({
  ready: false,
  readOnly: false, // pttune 形式 (再生専用) のとき true
  fileName: "",
  dirty: false,
  mode: "U" as ToolMode,
  rev: 0, // 編集リビジョン (canvas 再描画のトリガー)
  focusUnit: -1,
  selectedUnits: [] as number[],
  scrollX: 0, // フィールド左端のスクロール位置 (px)
  scrollYUnit: 0, // ユニットトレイの行オフセット
  scrollYKey: 0, // ピアノロールの行オフセット (0 = 最上段 = コード108)
  zoom: 48, // 1拍のピクセル幅
  divi: 4, // 拍分割
  scope1: 0, // 選択範囲 (クロック)
  scope2: 0,
  volumeVisible: false,
  volumeMode: 0, // VOLUMEMODE (0=Velocity..7=Tuning)
  tool: "smart" as "pen" | "hand" | "smart", // ピアノロール用ツール (smart = スマート: 書込/移動/端は押した位置で切り替わる。既定はスマート)
  // コピー対象の種類フラグ。CopierPanel の KINDS (index 0..8) と対応
  copier: Array(COPIER_KIND_NUM).fill(true) as boolean[],
  muted: [] as number[], // ミュート中のユニット index
  unitVisible: [] as boolean[], // ピアノロールに表示するユニット
  unitPinned: [] as boolean[], // ピン留め中のユニット
  soloUnit: -1, // ソロ中のユニット index (-1 = なし)
  soloBackup: [] as number[], // ソロ開始時のミュート状態 (解除時に復元)
  playStart: -1, // 編集用再生範囲の開始小節 (0-based, -1 = 未設定)
  playEnd: -1, // 編集用再生範囲の終了小節 (0-based, -1 = 未設定)
  repeatMeas: 0, // Repeat 位置 (1-based 小節番号, 0 = なし)
});

export const units = ref<UnitInfo[]>([]);
export const woices = ref<WoiceInfo[]>([]);
export const delays = ref<DelayInfo[]>([]);
export const overdrives = ref<OverdriveInfo[]>([]);
export const title = ref("");
export const comment = ref("");

// Delay の単位表示名 (EffectorPanel と共用)
export const DELAY_UNITS = ["BEAT", "MEAS", "SECOND"];

export function getService(): typeof service | null {
  return doc.ready ? service : null;
}

export function ensureInit(): boolean {
  if (doc.ready) return true;
  if (!ensureService()) return false;
  doc.ready = true;
  sync();
  return true;
}

// サービスからミラーへ同期。
// doc.readOnly はタブ種別由来のためここでは触らない (projects.ts の
// restore/refreshCurrent が設定する。循環 import 回避のため)
export function sync(): void {
  if (!doc.ready) return;
  syncUnits();
  syncWoiceList();
  syncEffects();
  syncMeta();
  cleanupSelection();
  // Repeat はエンジン/ファイルが 0-based、UI が 1-based (0 = なし)。
  // undo/redo や読み込みでエンジン値が変わっても表示へ必ず変換する
  doc.repeatMeas = fileRepeatToUi(service.master.repeatMeas);
}

// 表示/ピン留め配列をユニット数に合わせる (新規ユニットは表示オン)
function syncUnitVisibility(s: typeof service): void {
  while (doc.unitVisible.length < s.unitNum) doc.unitVisible.push(true);
  while (doc.unitPinned.length < s.unitNum) doc.unitPinned.push(false);
  if (doc.unitVisible.length > s.unitNum) doc.unitVisible.length = s.unitNum;
  if (doc.unitPinned.length > s.unitNum) doc.unitPinned.length = s.unitNum;
}

// ユニット一覧 (音色は u.woice か最後の VOICENO イベントから解決)
function syncUnits(): void {
  const s = service;
  syncUnitVisibility(s);
  // read 直後は unit.woice が未設定 (VOICENO イベントで決まる) ため、
  // 各ユニットの最後の VOICENO イベント値を事前に集めておく (1パスで解決)
  const lastVoiceNo = new Map<number, number>();
  for (const e of s.evels.records) {
    if (e.kind === EventKind.VOICENO) lastVoiceNo.set(e.unitNo, e.value);
  }
  const us: UnitInfo[] = [];
  for (let i = 0; i < s.unitNum; i++) {
    const u = s.unitGet(i);
    if (!u) continue;
    let wIdx = -1;
    if (u.woice) {
      for (let w = 0; w < s.woiceNum; w++) {
        if (s.woiceGet(w) === u.woice) {
          wIdx = w;
          break;
        }
      }
    } else {
      wIdx = lastVoiceNo.get(i) ?? -1;
      if (wIdx >= s.woiceNum) wIdx = -1;
    }
    us.push({
      index: i,
      name: unitNameDisplay(u.name) || `unit ${i}`,
      woiceIndex: wIdx,
      muted: doc.muted.includes(i),
      visible: doc.unitVisible[i] ?? true,
      pinned: doc.unitPinned[i] ?? false,
      soloed: doc.soloUnit === i,
    });
  }
  units.value = us;
}

function syncWoiceList(): void {
  const s = service;
  const ws: WoiceInfo[] = [];
  for (let i = 0; i < s.woiceNum; i++) {
    const w = s.woiceGet(i);
    if (!w) continue;
    ws.push({ index: i, name: woiceName(w), type: w.type, typeName: woiceTypeName(w.type) });
  }
  woices.value = ws;
}

function syncEffects(): void {
  syncDelays();
  syncOverdrives();
}

function syncDelays(): void {
  const s = service;
  const ds: DelayInfo[] = [];
  for (let i = 0; i < s.delayNum; i++) {
    const d = s.delayGet(i);
    if (!d) continue;
    ds.push({ index: i, unit: d.unit, freq: d.freq, rate: d.rate, group: d.group });
  }
  delays.value = ds;
}

function syncOverdrives(): void {
  const s = service;
  const os: OverdriveInfo[] = [];
  for (let i = 0; i < s.overdriveNum; i++) {
    const o = s.overdriveGet(i);
    if (!o) continue;
    os.push({ index: i, cut: o.cut, amp: o.amp, group: o.group });
  }
  overdrives.value = os;
}

function syncMeta(): void {
  title.value = service.text.getNameString();
  comment.value = service.text.getCommentString();
}

// ソロを解除し、開始前のミュート状態 (soloBackup) を復元する
function exitSolo(): void {
  doc.soloUnit = -1;
  doc.muted = [...doc.soloBackup];
  doc.soloBackup = [];
}

// 削除・読み込み後に選択/ミュート/ソロ状態をユニット数へ整合化する
function cleanupSelection(): void {
  const s = service;
  if (doc.focusUnit >= s.unitNum) doc.focusUnit = -1;
  doc.selectedUnits = doc.selectedUnits.filter((u) => u >= 0 && u < s.unitNum);
  doc.muted = doc.muted.filter((u) => u >= 0 && u < s.unitNum);
  doc.soloBackup = doc.soloBackup.filter((u) => u >= 0 && u < s.unitNum);
  if (doc.soloUnit >= s.unitNum) {
    // ソロ対象が消えた: ソロを解除して元のミュート状態を復元
    exitSolo();
  }
  // ソロ中の不変条件: ソロユニット以外を全ミュート
  if (doc.soloUnit >= 0) {
    doc.muted = [];
    for (let u = 0; u < s.unitNum; u++) if (u !== doc.soloUnit) doc.muted.push(u);
  }
}

// 音色名の生文字列 (名前なしは空文字列)。woiceName との違いは "(no name)" を付けないこと
export function woiceNameRaw(w: { getNameBuf(): Uint8Array }): string {
  const buf = w.getNameBuf();
  let end = buf.indexOf(0);
  if (end < 0) end = buf.length;
  return shiftJisToString(buf.subarray(0, end));
}

// 音色名を表示用にデコード (本家同様、最初の NUL で終端する C 文字列扱い)
export function woiceName(w: { getNameBuf(): Uint8Array }): string {
  return woiceNameRaw(w) || "(no name)";
}

// ユニット名を本家形式 (Shift_JIS・最大 16 バイト) にエンコードする。
// pxtone-ts の Unit.setNameBuf は 1 バイト = 1 文字 (latin-1) として保持するため SJIS バイト列を渡す
// (2 バイト文字は分断しない。本家 pxShiftJIS_check_size 相当)
export function encodeUnitName(name: string): Uint8Array {
  return truncateShiftJis(encodeShiftJis(name), 16);
}

// Unit.name (latin-1 文字列) を本家と同じ Shift_JIS としてデコードした表示用の名前
export function unitNameDisplay(name: string): string {
  if (!name) return "";
  const bytes = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i++) bytes[i] = name.charCodeAt(i) & 0xff;
  return shiftJisToString(bytes);
}

export function woiceTypeName(type: WoiceType): string {
  switch (type) {
    case WoiceType.PCM:
      return "PCM";
    case WoiceType.PTV:
      return "PTV";
    case WoiceType.PTN:
      return "PTN";
    case WoiceType.OGGV:
      return "OGGV";
    default:
      return "?";
  }
}

// ---- 編集ラッパー ----

function markDirty(): void {
  doc.dirty = true;
  doc.rev++;
}

// 1回のドラッグ操作などは beginEdit() → 編集 → commitEdit()
export function beginEdit(): void {
  if (doc.readOnly) return;
  pushUndo();
}

export function commitEdit(): void {
  if (doc.readOnly) return;
  service.adjustMeasNum();
  sync();
  markDirty();
}

// 単発操作。fn の戻り値をそのまま返す (失敗判定をクロージャ経由で持ち出さない)
export function mutate<T>(fn: () => T): T | undefined {
  if (doc.readOnly) return undefined;
  pushUndo();
  const ret = fn();
  commitEdit();
  return ret;
}

// boolean を返す単発操作 (mutate が undefined を返しても false に丸める)
export function mutateBoolean(fn: () => boolean): boolean {
  return mutate(fn) ?? false;
}

// ---- プロジェクト全体 ----

// 新規/読込時に編集用の UI 状態をリセットする (ファイルの内容には影響しない)
function resetEditingState(): void {
  doc.focusUnit = -1;
  doc.selectedUnits = [];
  doc.muted = [];
  doc.soloUnit = -1;
  doc.soloBackup = [];
  doc.playStart = -1;
  doc.playEnd = -1;
  doc.scope1 = 0;
  doc.scope2 = 0;
  doc.scrollX = 0;
  doc.scrollYUnit = 0;
  doc.scrollYKey = 0;
  doc.dirty = false;
}

export function newProject(): boolean {
  if (!ensureInit()) return false;
  service.clear();
  doc.fileName = "";
  resetEditingState();
  doc.repeatMeas = 0;
  clearUndo();
  sync();
  doc.rev++;
  return true;
}

// バイト列から読み込み。エラーメッセージを返す (成功時 null)
export function openProject(bytes: Uint8Array): string | null {
  if (!ensureInit()) return t("error.engineInit");
  const io = new MemoryIo(bytes);
  const res = service.read(io);
  if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
  resetEditingState();
  clearUndo();
  sync();
  doc.rev++;
  return null;
}

// 現在のプロジェクトを ptcop バイト列へ
export function exportBytes(): Uint8Array | null {
  if (!doc.ready) return null;
  return snapshotProject()?.bytes ?? null;
}

// 保存した状態をクリーンに
export function markSaved(): void {
  doc.dirty = false;
}

export function pxtnErrorMessage(res: PxtnErr): string {
  switch (res) {
    case PxtnErr.FMT_UNKNOWN:
      return t("error.format");
    case PxtnErr.OGG_NO_SUPPORTED:
      return t("error.ogg");
    case PxtnErr.DENY_BEATCLOCK:
      return t("error.beatClock");
    case PxtnErr.TOO_MUCH_EVENT:
      return t("error.tooManyEvents");
    default:
      return `${t("error.loadFailed")} (err=${res})`;
  }
}

// ---- ユニット ----

export function addUnit(name?: string): boolean {
  return mutateBoolean(() => {
    const ok = service.unitAddNew();
    if (ok && name) {
      const u = service.unitGet(service.unitNum - 1);
      u?.setNameBuf(encodeUnitName(name));
    }
    return ok;
  });
}

// 名前と音色を指定してユニットを追加 (1つの undo エントリ)。
// woiceIdx が -1 の場合は音色なし。
export function addUnitWithWoice(name: string | undefined, woiceIdx: number): boolean {
  return mutateBoolean(() => {
    if (!service.unitAddNew()) return false;
    const ui = service.unitNum - 1;
    const u = service.unitGet(ui);
    if (name) u?.setNameBuf(encodeUnitName(name));
    const w = woiceIdx >= 0 ? service.woiceGet(woiceIdx) : null;
    if (u && w) {
      u.setWoice(w);
      applyWoiceToUnitEvents(ui, woiceIdx);
    }
    return true;
  });
}

export function removeUnit(idx: number): void {
  // 削除されるユニット番号を UI 状態 (選択/ミュート/ソロ/表示/ピン) に反映してから削除
  const shift = (n: number): number => (n === idx ? -1 : n > idx ? n - 1 : n);
  doc.selectedUnits = doc.selectedUnits.map(shift).filter((n) => n >= 0);
  doc.muted = doc.muted.map(shift).filter((n) => n >= 0);
  doc.soloBackup = doc.soloBackup.map(shift).filter((n) => n >= 0);
  doc.unitVisible = shiftArr(doc.unitVisible, idx);
  doc.unitPinned = shiftArr(doc.unitPinned, idx);
  if (doc.soloUnit === idx) {
    // ソロ対象の削除: ソロ解除して元のミュート状態を復元
    exitSolo();
  } else if (doc.soloUnit > idx) {
    doc.soloUnit--;
  }
  mutate(() => {
    service.unitRemove(idx);
    service.evels.recordUnitNoMiss(idx);
  });
}

function shiftArr(a: boolean[], idx: number): boolean[] {
  if (idx < 0 || idx >= a.length) return a;
  return [...a.slice(0, idx), ...a.slice(idx + 1)];
}

export function replaceUnit(oldPlace: number, newPlace: number): void {
  if (oldPlace === newPlace) return;
  mutate(() => {
    replaceUnitRaw(oldPlace, newPlace);
  });
}

// ドラッグ中など、undo を自前で管理する場合の生操作。
// 読み取り専用タブでは何もしない (呼び出し側のガード漏れに対する二重防御)
export function replaceUnitRaw(oldPlace: number, newPlace: number): void {
  if (doc.readOnly) return;
  // ユニット番号の移動に合わせて UI 状態も移動させる
  const move = <T>(a: T[]): T[] => {
    if (oldPlace >= a.length) return a;
    const out = [...a];
    const [v] = out.splice(oldPlace, 1);
    out.splice(Math.min(newPlace, out.length), 0, v!);
    return out;
  };
  doc.selectedUnits = move(doc.selectedUnits);
  doc.muted = move(doc.muted);
  doc.soloBackup = move(doc.soloBackup);
  doc.unitVisible = move(doc.unitVisible);
  doc.unitPinned = move(doc.unitPinned);
  if (doc.soloUnit >= 0) {
    // 番号と同じ並べ替えを index 順配列に適用し、soloUnit の新位置を引く
    // (unitReplace 後に数値として換算できないため配列経由で追従する)
    const n = Math.max(units.value.length, oldPlace + 1, newPlace + 1);
    const order = move([...Array(n).keys()]);
    doc.soloUnit = order[doc.soloUnit] ?? -1;
  }
  service.unitReplace(oldPlace, newPlace);
  service.evels.recordUnitNoReplace(oldPlace, newPlace);
}

export function setUnitName(idx: number, name: string): void {
  mutate(() => {
    service.unitGet(idx)?.setNameBuf(encodeUnitName(name));
  });
}

export function setFocusUnit(idx: number): void {
  doc.focusUnit = idx;
}

export function toggleSelected(idx: number): void {
  doc.selectedUnits = toggleInArray(doc.selectedUnits, idx);
}

export function selectRange(idx: number): void {
  const a = Math.min(doc.focusUnit, idx);
  const b = Math.max(doc.focusUnit, idx);
  doc.selectedUnits = [];
  for (let u = a; u <= b; u++) doc.selectedUnits.push(u);
}

export function clearSelection(): void {
  doc.selectedUnits = [];
}

// 配列に idx があれば削除、なければ追加
function toggleInArray(arr: number[], idx: number): number[] {
  const out = [...arr];
  const i = out.indexOf(idx);
  if (i >= 0) out.splice(i, 1);
  else out.push(idx);
  return out;
}

// UI 状態のみの変更 (undo 不要): エンジンと同期して再描画リビジョンを進める
function afterUiEdit(): void {
  sync();
  doc.rev++;
}

export function toggleUnitMute(idx: number): void {
  if (doc.soloUnit >= 0) {
    // ソロ中の手動変更: ソロを解除し、元のミュート状態に今回の変更を反映
    const wasMuted = doc.muted.includes(idx);
    exitSolo();
    const i = doc.muted.indexOf(idx);
    if (wasMuted) {
      if (i >= 0) doc.muted.splice(i, 1);
    } else if (i < 0) {
      doc.muted.push(idx);
    }
  } else {
    doc.muted = toggleInArray(doc.muted, idx);
  }
  afterUiEdit();
}

// ソロ切替。ON: 他ユニットを全ミュート、OFF (同ユニット再クリック):
// ソロ開始前のミュート状態 (soloBackup) を復元。
// ソロ中の別ユニットへの直接切替ではバックアップを保持する
// (ソロ由来のミュートで上書きしない)
export function toggleUnitSolo(idx: number): void {
  if (doc.soloUnit === idx) {
    exitSolo();
  } else {
    if (doc.soloUnit === -1) doc.soloBackup = [...doc.muted];
    doc.soloUnit = idx;
    doc.muted = units.value.map((u) => u.index).filter((u) => u !== idx);
  }
  afterUiEdit();
}

// ピアノロールにノートを表示するか (表示チェック)
export function toggleUnitVisible(idx: number): void {
  doc.unitVisible[idx] = !(doc.unitVisible[idx] ?? true);
  afterUiEdit();
}

// 全ユニットの表示を一括設定 (View メニュー「全ユニット表示」)
export function setAllUnitsVisible(visible: boolean): void {
  doc.unitVisible.fill(visible);
  afterUiEdit();
}

// ピン留め (上部レーン固定)
export function toggleUnitPinned(idx: number): void {
  doc.unitPinned[idx] = !(doc.unitPinned[idx] ?? false);
  afterUiEdit();
}

// ピアノロールにノートを表示するユニット一覧 (フォーカス + 表示 + ピン留め)
export function pianoRollUnits(): number[] {
  const set = new Set<number>();
  if (doc.focusUnit >= 0) set.add(doc.focusUnit);
  for (let u = 0; u < doc.unitVisible.length; u++) {
    if (doc.unitVisible[u]) set.add(u);
    if (doc.unitPinned[u]) set.add(u);
  }
  return [...set].sort((a, b) => a - b);
}

// ピン留め中のユニット一覧
export function pinnedUnits(): number[] {
  const out: number[] = [];
  for (let u = 0; u < doc.unitPinned.length; u++) {
    if (doc.unitPinned[u]) out.push(u);
  }
  return out;
}

// 編集対象ユニット (フォーカス + 選択)
export function focusedOrSelected(): number[] {
  const set = new Set<number>(doc.selectedUnits);
  if (doc.focusUnit >= 0) set.add(doc.focusUnit);
  return [...set].sort((a, b) => a - b);
}

// ---- 音色 ----

// OGGV (mateOGGV チャンク) のヘッダサイズ (本家 _MATERIALSTRUCT_OGGV 相当)
const MATE_OGGV_STRUCT_SIZE = 12;
const PXTN_OGGV_HEADER_SIZE = 16;

// 生 OGG バイト列を mateOGGV チャンクとして io に書き込む。
// ch/sps/smpNum はデコード結果から取得する (本家 pxtnWoice::read の OGGV 分岐と同一の初期値)
function writeMateOggvChunk(io: MemoryIo, data: Uint8Array, ch: number, sps: number, smpNum: number): void {
  ioPutUint32LE(io, MATE_OGGV_STRUCT_SIZE + PXTN_OGGV_HEADER_SIZE + data.length);
  ioPutUint16LE(io, 0); // xxx
  ioPutUint16LE(io, EVENTDEFAULT_BASICKEY); // basicKey (本家 Voice_Allocate の初期値)
  ioPutUint32LE(io, PTV_VOICEFLAG_SMOOTH); // voiceFlags (本家の初期値)
  ioPutFloatLE(io, 1); // tuning
  ioPutInt32LE(io, ch);
  ioPutInt32LE(io, sps);
  ioPutInt32LE(io, smpNum);
  ioPutInt32LE(io, data.length);
  io.write(data, 1, data.length);
}

// 生 OGG バイト列を mateOGGV チャンク (未デコードのまま保持) に変換する。失敗時 null
async function oggBytesToMateChunk(bytes: Uint8Array): Promise<Uint8Array | null> {
  // チャンネル/サンプリングレート/サンプル数は OGG のヘッダ情報としてデコード結果から取得する
  const oggInfo = await defaultOggvDecoder.decode(bytes);
  const ch = oggInfo.ch;
  const sps = oggInfo.sps;
  const smpNum = oggInfo.samples[0]?.length ?? 0;
  if (ch <= 0 || sps <= 0 || smpNum <= 0) return null;
  const io = new MemoryIo();
  writeMateOggvChunk(io, bytes, ch, sps, smpNum);
  return io.toUint8Array();
}

// PTV/PTN/PCM/OGGV ファイルバイト列を音色として追加。エラーメッセージを返す (成功時 null)。
// マジックバイトで音色タイプを判別する (PTV/PTN/OGG はヘッダ、それ以外は PCM)
export function detectWoiceType(bytes: Uint8Array): WoiceType {
  const head = String.fromCharCode(...bytes.subarray(0, 8));
  if (head === "PTVOICE-") return WoiceType.PTV;
  if (head === "PTNOISE-") return WoiceType.PTN;
  if (head.startsWith("OggS")) return WoiceType.OGGV;
  return WoiceType.PCM;
}

// 指定 index に音色ファイルを読み込み、名前を設定する。エラー文字列を返す (成功時 null)。
// addWoice (追加) と replaceWoiceFile (置き換え) の共通処理
async function readWoiceFileInto(idx: number, bytes: Uint8Array, type: WoiceType, name?: string): Promise<string | null> {
  // OGGV のみ mateOGGV チャンク形式へ変換する (他はそのまま)
  const chunk = type === WoiceType.OGGV ? await oggBytesToMateChunk(bytes) : bytes;
  if (!chunk) return t("error.ogg");
  return (
    mutate(() => {
      const res = service.woiceRead(idx, new MemoryIo(chunk), type);
      if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
      // 名前は本家形式 (ShiftJIS・最大 16 バイト) で設定する
      if (name) service.woiceGet(idx)?.setNameBuf(encodeShiftJis(name), 16);
      return null;
    }) ?? null
  );
}

// 音色ファイルを末尾に追加。name はファイル名 (拡張子なし) で音色名にする
export async function addWoice(bytes: Uint8Array, type: WoiceType, name?: string): Promise<string | null> {
  if (!doc.ready) return t("error.notReady");
  return readWoiceFileInto(service.woiceNum, bytes, type, name);
}

export function removeWoice(idx: number): void {
  mutate(() => {
    service.woiceRemove(idx);
  });
}

// 既存の音色 index を別の音色ファイルで置き換える。ユニットは音色を index 参照するため、
// 同じ index に読み込めば、使用中のユニットも自動的に新しい音色を指す
export async function replaceWoiceFile(idx: number, bytes: Uint8Array, type: WoiceType, name?: string): Promise<string | null> {
  if (!doc.ready) return t("error.notReady");
  if (idx < 0 || idx >= service.woiceNum) return t("error.notReady");
  return readWoiceFileInto(idx, bytes, type, name);
}

// 音色フラグ (Loop / Smooth / Beat Fit) のビットマスク
const WOICE_FLAG_MASK = PTV_VOICEFLAG_WAVELOOP | PTV_VOICEFLAG_SMOOTH | PTV_VOICEFLAG_BEATFIT;

// 音色のプロパティ (本家 dlg_Woice 相当)
export interface WoiceProperties {
  name: string;
  tuning: number; // 0..256 (PTV では使わない)
  basicKey: number; // コード (21..108)。PTV では使わない
  waveLoop: boolean; // PTV 以外のみ
  smooth: boolean;
  beatFit: boolean;
}

// 音色のプロパティをまとめて変更 (1つの undo エントリ)。
// 本家 dlg_Woice と同じく、名前は全タイプ、tuning / basic key / フラグは
// PTV 以外に適用する (PTV の tuning はダイアログでも編集不可のため触らない)
export function setWoiceProperties(idx: number, props: WoiceProperties): void {
  mutate(() => {
    const w = service.woiceGet(idx);
    const vc = w?.getVoice(0);
    if (!w || !vc) return;
    // 音色名は ShiftJIS・最大 16 バイト (本家 pxtnMAX_TUNEWOICENAME)
    w.setNameBuf(truncateShiftJis(encodeShiftJis(props.name), 16), 16);
    if (w.type !== WoiceType.PTV) {
      vc.tuning = Math.min(256, Math.max(0, props.tuning));
      vc.basicKey = Math.min(108, Math.max(21, props.basicKey)) * 0x100;
      let flags = vc.voiceFlags & ~WOICE_FLAG_MASK;
      if (props.waveLoop) flags |= PTV_VOICEFLAG_WAVELOOP;
      if (props.smooth) flags |= PTV_VOICEFLAG_SMOOTH;
      if (props.beatFit) flags |= PTV_VOICEFLAG_BEATFIT;
      vc.voiceFlags = flags;
    }
  });
}

// 再生・プレビューは VOICENO イベントから音色を決定するため、
// ユニットの全 VOICENO イベントを新しい音色に書き換える (無ければ clock 0 に追加)。
function applyWoiceToUnitEvents(unitIdx: number, woiceIdx: number): void {
  const end = service.evels.records.reduce((m, e) => Math.max(m, e.clock + 1), 0);
  const changed = service.evels.recordValueSet(0, end, unitIdx, EventKind.VOICENO, woiceIdx);
  if (changed === 0) service.evels.recordAddI(0, unitIdx, EventKind.VOICENO, woiceIdx);
}

// ユニットの名前と音色をまとめて変更 (1つの undo エントリ)。
// name が空文字列の場合は名前を変更しない。
export function setUnitNameAndWoice(unitIdx: number, name: string, woiceIdx: number): void {
  mutate(() => {
    const u = service.unitGet(unitIdx);
    if (!u) return;
    const trimmed = name.trim();
    if (trimmed) u.setNameBuf(encodeUnitName(trimmed));
    const w = service.woiceGet(woiceIdx);
    if (!w) return;
    u.setWoice(w);
    applyWoiceToUnitEvents(unitIdx, woiceIdx);
  });
}

// ---- マスター (BPM・拍子・小節) ----

export function setTempo(tempo: number): void {
  mutate(() => {
    service.master.set(service.master.beatNum, tempo, service.master.beatClock);
  });
}

export function setBeatNum(beatNum: number): void {
  mutate(() => {
    service.master.set(beatNum, service.master.beatTempo, service.master.beatClock);
  });
}

export function setMeasNum(measNum: number): void {
  mutate(() => {
    service.master.setMeasNum(measNum);
  });
}

// プロジェクト設定をまとめて1つの undo エントリとして適用 (Project ダイアログ用)
export function setProjectSettings(settings: {
  name?: string;
  comment?: string;
  tempo?: number;
  beatNum?: number;
  measNum?: number;
}): void {
  mutate(() => {
    if (settings.name !== undefined) service.text.setNameBuf(encodeShiftJis(settings.name));
    if (settings.comment !== undefined) service.text.setCommentBuf(encodeShiftJis(settings.comment));
    if (settings.tempo !== undefined) service.master.set(service.master.beatNum, settings.tempo, service.master.beatClock);
    if (settings.beatNum !== undefined) service.master.set(settings.beatNum, service.master.beatTempo, service.master.beatClock);
    if (settings.measNum !== undefined) service.master.setMeasNum(settings.measNum);
  });
}

export function setRepeatMeas(meas: number): void {
  // Repeat は 1-based 小節番号 (0 = なし)。エンジン/ファイルは 0-based で
  // 「1小節目 = 曲頭から再生」を表すため、保存側では変換して書き込む。
  const normalized = meas > 0 ? meas : 0;
  doc.repeatMeas = normalized;
  mutate(() => {
    service.master.setRepeatMeas(uiRepeatToFile(normalized));
  });
}

export function setLastMeas(meas: number): void {
  mutate(() => {
    service.master.setLastMeas(meas);
  });
}

// Repeat の 1-based 表示値 ↔ 0-based ファイル値 (1小節目=曲頭再生) 変換
export function fileRepeatToUi(fileValue: number): number {
  return fileValue > 0 ? fileValue + 1 : 0;
}

export function uiRepeatToFile(uiValue: number): number {
  return uiValue > 0 ? uiValue - 1 : 0;
}

export function setTextName(name: string): void {
  mutate(() => {
    service.text.setNameBuf(encodeShiftJis(name));
  });
}

export function setTextComment(text: string): void {
  mutate(() => {
    service.text.setCommentBuf(encodeShiftJis(text));
  });
}

// ---- イベント (クロック単位) ----

export function clockContext(): { beatClock: number; beatNum: number; zoom: number; measNum: number } {
  return {
    beatClock: service.master.beatClock,
    beatNum: service.master.beatNum,
    zoom: doc.zoom,
    measNum: service.master.measNum,
  };
}

// 実イベントか (NULL プレースホルダでない)
function isMeaningfulEvent(e: EveRecord): boolean {
  return e.kind !== EventKind.NULL;
}

export function getAllEvents(): EveRecord[] {
  return service.evels.records.filter(isMeaningfulEvent);
}

export function addEvent(clock: number, unitNo: number, kind: number, value: number): void {
  if (doc.readOnly) return;
  service.evels.recordAddI(clock, unitNo, kind, value);
}

export function deleteEvents(clock1: number, clock2: number, unitNo: number, kind?: number): void {
  if (doc.readOnly) return;
  if (kind !== undefined) {
    service.evels.recordDelete(clock1, clock2, unitNo, kind);
    return;
  }
  service.evels.recordDeleteByUnit(clock1, clock2, unitNo);
}

export function setEventValue(clock1: number, clock2: number, unitNo: number, kind: number, value: number): void {
  if (doc.readOnly) return;
  service.evels.recordValueSet(clock1, clock2, unitNo, kind, value);
}

// lib/editing の書き込み API アダプタ (KeyField / VolumeField / PinnedLanes で共有)
export const projectWriteOps: EventWriteOps = { deleteEvents, addEvent, setEventValue };

// 範囲内のイベント値を加算変更する (本家の「ベロシティ/パン/ボリューム」相当)。
// 対象はフォーカス+選択中のユニット。加算は recordValueChange が
// 種別ごとの上限 (0..128 等) にクランプする
export function changeEventValue(clock1: number, clock2: number, kind: number, value: number): void {
  const targets = focusedOrSelected();
  if (targets.length === 0) return;
  mutate(() => {
    for (const u of targets) {
      service.evels.recordValueChange(clock1, clock2, u, kind, value);
    }
  });
}

// 小節コピー (本家の「小節コピー」相当)。
// [c1, c2) のイベントを対象ユニット (フォーカス+選択) から kinds で
// フィルタして収集し、to 位置から幅×times 分ペーストする。
// ON イベントの長さはコピー範囲内にクランプする
export function copyMeas(c1: number, c2: number, to: number, times: number, kinds: number[]): void {
  if (c2 <= c1 || times < 1) return;
  const targets = focusedOrSelected();
  if (targets.length === 0) return;
  const width = c2 - c1;
  mutate(() => {
    const copied: { clock: number; unitNo: number; kind: number; value: number }[] = [];
    for (const e of service.evels.records) {
      if (!isMeaningfulEvent(e)) continue;
      if (e.clock < c1 || e.clock >= c2) continue;
      if (!targets.includes(e.unitNo)) continue;
      if (!kinds.includes(e.kind)) continue;
      let value = e.value;
      if (e.kind === EventKind.ON && e.clock + e.value > c2) value = c2 - e.clock;
      copied.push({ clock: e.clock - c1, unitNo: e.unitNo, kind: e.kind, value });
    }
    for (let i = 0; i < times; i++) {
      const base = to + i * width;
      for (const ev of copied) {
        service.evels.recordAddI(base + ev.clock, ev.unitNo, ev.kind, ev.value);
      }
    }
  });
}

// ---- スコープ操作 (本家の ScopeEvent に相当する) ----
// 選択範囲 (スコープ) に対するコピー / 切り取り / クリア / 消去 / 貼り付け / 挿入。
// 対象ユニットはフォーカス+選択 (単独ならフォーカスのみ、本家 UnitFocus 相当)。
// クリップボードはスコープ操作共有で、本家同様プロジェクト (タブ) をまたいで貼り付けできる

// クリップボードのイベント (clock はコピー範囲開始からの相対クロック)
interface ScopeClipEvent {
  clock: number;
  unitNo: number;
  kind: number;
  value: number;
}

let scopeClip: ScopeClipEvent[] = [];
let scopeClipWidth = 0; // コピー元範囲の幅 (クロック)
// 単一ユニット (W モード or 対象単独) でコピーしたか。
// true なら貼り付け時にクリップボードのユニット番号を貼り付け先へ振り直す (本家 Record_UnitNo_Set 相当)
let scopeClipFocusOnly = false;

// doc.copier (コピーパネル) のチェック状態 → フィルタ対象のイベント種別
function copierKinds(): number[] {
  return COPIER_KINDS.filter((k) => doc.copier[k.index] ?? true).map((k) => k.kind);
}

// スコープ操作の対象ユニット (本家 UnitFocus 相当)。
// W モード (音源編集) か対象が単独のときはフォーカスユニットのみ
function scopeUnits(): number[] {
  const targets = focusedOrSelected();
  if (doc.mode !== "U" || targets.length <= 1) {
    if (doc.focusUnit >= 0) return [doc.focusUnit];
    return targets.length > 0 ? targets : [];
  }
  return targets;
}

// 範囲の正規化 (本家 _change 相当)
function scopeRange(c1: number, c2: number): [number, number] {
  return [Math.min(c1, c2), Math.max(c1, c2)];
}

// コピー (範囲内のイベントをクリップボードへ収集)。
// kinds は対象イベント種別の一覧 (null = フィルタなし全種別、切り取りで使う)。
// 長さ種別 (ON/PORTAMENT) の value は範囲末尾にクリップする (本家準拠)
export function scopeCopy(c1: number, c2: number, kinds: number[] | null = copierKinds()): void {
  const [a, b] = scopeRange(c1, c2);
  const targets = scopeUnits();
  const clip: ScopeClipEvent[] = [];
  const tset = new Set(targets);
  const kset = kinds ? new Set<number>(kinds) : null;
  if (b > a && targets.length > 0) {
    for (const e of service.evels.records) {
      if (!isMeaningfulEvent(e)) continue;
      if (e.clock >= b) break;
      if (e.clock < a) continue;
      if (!tset.has(e.unitNo)) continue;
      if (kset && !kset.has(e.kind)) continue;
      const value = eventKindIsTail(e.kind) && e.value > b - e.clock ? b - e.clock : e.value;
      clip.push({ clock: e.clock - a, unitNo: e.unitNo, kind: e.kind, value });
    }
  }
  scopeClip = clip;
  scopeClipWidth = b - a;
  scopeClipFocusOnly = targets.length <= 1;
}

// クリップボードに貼り付けられる内容があるか
export function scopeClipReady(): boolean {
  return scopeClip.length > 0 && scopeClipWidth > 0;
}

// クリア (範囲内のイベントを削除。後続は詰めない)
export function scopeClear(c1: number, c2: number): void {
  if (!doc.ready) return;
  const [a, b] = scopeRange(c1, c2);
  const targets = scopeUnits();
  if (b <= a || targets.length === 0) return;
  mutate(() => {
    for (const u of targets) service.evels.recordDeleteByUnit(a, b, u);
  });
}

// 消去 (範囲内のイベントを削除し、後続を詰めて前に寄せる)
export function scopeDelete(c1: number, c2: number): void {
  if (!doc.ready) return;
  const [a, b] = scopeRange(c1, c2);
  const targets = scopeUnits();
  if (b <= a || targets.length === 0) return;
  mutate(() => {
    for (const u of targets) {
      service.evels.recordDeleteByUnit(a, b, u);
      service.evels.recordClockShift(b, a - b, u);
    }
  });
}

// 切り取り (種別フィルタなしでコピーし、消去する。その後コピーパネルのチェックを全 ON にする
// — 本家 ScopeEvent_Cut + if_Copier_AllCheck 相当)
export function scopeCut(c1: number, c2: number): void {
  scopeCopy(c1, c2, null);
  scopeDelete(c1, c2);
  doc.copier.fill(true);
}

// 貼り付け・挿入の共通: クリップボードのコピー方式に応じて貼り付け先ユニットを決める。
// 単一ユニットでコピーした場合: すべてフォーカスユニットへ振り直す (本家 Record_UnitNo_Set 相当)。
// 複数ユニットでコピーした場合: クリップボード元と同じユニットへ (現在の編集対象のみ)
function scopeTargets(): number[] {
  if (scopeClipFocusOnly) {
    if (doc.focusUnit >= 0) return [doc.focusUnit];
  }
  return scopeUnits();
}

// 貼り付け (クリップボードの内容を clock 位置へ載せる)。
// 書き込み領域の既存イベントは種別ごとに消してから載せる (本家 _Paste 相当)。
// 種別の絞り込みは現在のコピーパネルのチェックに従う
export function scopePaste(clock: number): void {
  if (!scopeClipReady() || !doc.ready) return;
  const targets = scopeTargets();
  if (targets.length === 0) return;
  const kset = new Set(copierKinds());
  mutate(() => {
    for (const u of targets) {
      // 対象ユニットに載るイベント (単独コピー時はすべて、複数コピー時は元ユニットが一致するもの)
      const events = scopeClip.filter((ev) => (scopeClipFocusOnly || ev.unitNo === u) && kset.has(ev.kind));
      // 書き込み領域の既存イベントを種別ごとに削除 (フィルタON種別のみ。クリップの種別が空でも消す)
      for (const kind of kset) {
        service.evels.recordDelete(clock, clock + scopeClipWidth, u, kind);
      }
      for (const ev of events) {
        service.evels.recordAddI(clock + ev.clock, u, ev.kind, ev.value);
      }
    }
  });
}

// 挿入 (clock 以降のイベントを貼り付け幅だけ後ろへずらし、空いた位置へ貼り付ける)。
// 貼り付けは種別フィルタなしで行う (本家 ScopeEvent_Insert 相当)
export function scopeInsert(clock: number): void {
  if (!scopeClipReady() || !doc.ready) return;
  const targets = scopeTargets();
  if (targets.length === 0) return;
  mutate(() => {
    for (const u of targets) {
      // 対象外ユニットは触らない。空いた幅 (クリップボードに無いユニット) はそのままブランクになる
      service.evels.recordClockShift(clock, scopeClipWidth, u);
      const events = scopeClip.filter((ev) => scopeClipFocusOnly || ev.unitNo === u);
      for (const ev of events) {
        service.evels.recordAddI(clock + ev.clock, u, ev.kind, ev.value);
      }
    }
  });
}

// ---- エフェクト ----

export function addDelay(unit: number, freq: number, rate: number, group: number): void {
  mutate(() => {
    service.delayAdd(unit, freq, rate, group);
  });
}

export function removeDelay(idx: number): void {
  mutate(() => {
    service.delayRemove(idx);
  });
}

export function updateDelay(idx: number, unit: number, freq: number, rate: number, group: number): void {
  mutate(() => {
    service.delaySet(idx, unit, freq, rate, group);
  });
}

export function addOverdrive(cut: number, amp: number, group: number): void {
  mutate(() => {
    service.overdriveAdd(cut, amp, group);
  });
}

export function removeOverdrive(idx: number): void {
  mutate(() => {
    service.overdriveRemove(idx);
  });
}

export function updateOverdrive(idx: number, cut: number, amp: number, group: number): void {
  mutate(() => {
    service.overdriveSet(idx, cut, amp, group);
  });
}

// ---- その他 ----

export function setScope(clock1: number, clock2: number): void {
  doc.scope1 = Math.min(clock1, clock2);
  doc.scope2 = Math.max(clock1, clock2);
}

// ---- 編集用再生範囲 (Start/End) ----

// 開始小節を設定 (同値なら解除)。end が start 以下なら end を start+1 に調整
// (本家の if_PlayField_SetStartMeas 準拠)
export function setPlayStart(meas: number): void {
  if (meas < 0 || meas === doc.playStart) {
    doc.playStart = -1;
  } else {
    const max = service.master.measNum - 1;
    doc.playStart = Math.max(0, Math.min(meas, max));
    if (doc.playEnd !== -1 && doc.playEnd <= doc.playStart) doc.playEnd = doc.playStart + 1;
  }
  doc.rev++;
}

// 終了小節を設定 (同値なら解除)。start 以上にクランプ (本家の SetEndMeas 準拠)
export function setPlayEnd(meas: number): void {
  if (meas < 0 || meas === doc.playEnd) {
    doc.playEnd = -1;
  } else {
    const max = service.master.measNum;
    // Start より前には置けない (Start 未設定なら 0)
    const minEnd = doc.playStart >= 0 ? doc.playStart + 1 : 0;
    doc.playEnd = Math.max(minEnd, Math.min(meas, max));
  }
  doc.rev++;
}

// Start/End (小節番号) の正規化: 順序の入れ替え・クランプ・1小節以上の保証。
// ドラッグ中のプレビューと確定で同じ結果にするため、状態側の純関数として置く
export function normalizePlayRange(
  startMeas: number,
  endMeas: number,
  measNum: number,
): { start: number; end: number } {
  const lo = Math.min(startMeas, endMeas);
  const hi = Math.max(startMeas, endMeas);
  const start = Math.max(0, Math.min(lo, measNum - 1));
  const end = Math.min(Math.max(hi, start + 1), measNum);
  return { start, end };
}

// Start/End をまとめて設定 (ドラッグ操作用)。同値でも解除せず、start < end を保証する
export function setPlayRange(startMeas: number, endMeas: number): void {
  const { start, end } = normalizePlayRange(startMeas, endMeas, service.master.measNum);
  doc.playStart = start;
  doc.playEnd = end;
  doc.rev++;
}

// ボリュームオートメーションのモード定義 (doc.volumeMode 0..7 と対応)。
// 書き込み対象のイベント種別・デフォルト値・表示名を1つのテーブルで管理する
// (VolumeField の描画/編集と CollageEditor のモードボタンで共用)
export const VOLUME_MODES = [
  { kind: EventKind.VELOCITY, def: EVENTDEFAULT_VELOCITY, label: "Velocity" },
  { kind: EventKind.PAN_VOLUME, def: EVENTDEFAULT_PAN_VOLUME, label: "Pan_Volume" },
  { kind: EventKind.PAN_TIME, def: EVENTDEFAULT_PAN_TIME, label: "Pan_Time" },
  { kind: EventKind.VOLUME, def: EVENTDEFAULT_VOLUME, label: "Volume" },
  { kind: EventKind.PORTAMENT, def: EVENTDEFAULT_PORTAMENT, label: "Portament" },
  { kind: EventKind.VOICENO, def: EVENTDEFAULT_VOICENO, label: "VoiceNo" },
  { kind: EventKind.GROUPNO, def: EVENTDEFAULT_GROUPNO, label: "GroupNo" },
  { kind: EventKind.TUNING, def: EVENTDEFAULT_TUNING, label: "Tuning" },
] as const;

// イベントデフォルト値の再エクスポート
export {
  WoiceType,
  EVENTDEFAULT_KEY,
  EVENTDEFAULT_VELOCITY,
  EVENTDEFAULT_VOLUME,
  EVENTDEFAULT_PAN_VOLUME,
  EVENTDEFAULT_PAN_TIME,
  EVENTDEFAULT_PORTAMENT,
  EVENTDEFAULT_VOICENO,
  EVENTDEFAULT_GROUPNO,
  EVENTDEFAULT_TUNING,
};
