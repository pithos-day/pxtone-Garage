// プロジェクト状態 (reactive のミラー) と編集ラッパー、プロジェクト全体の操作
import { reactive, ref } from "vue";
import { EVENTDEFAULT_GROUPNO, EVENTDEFAULT_PAN_TIME, EVENTDEFAULT_PAN_VOLUME, EVENTDEFAULT_PORTAMENT, EVENTDEFAULT_TUNING, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOICENO, EVENTDEFAULT_VOLUME, EventKind, MemoryIo, PxtnErr, WoiceType, shiftJisToString } from "pxtone-ts";
import { encodeShiftJis, truncateShiftJis } from "../../lib/sjis";
import { ensureService, service } from "../service";
import { clearUndo, markCurrentRevisionSaved, pushUndo, snapshotProject, touchCurrentRevision } from "../undo";
import { t } from "../../i18n";
import { fileRepeatToUi } from "./master";
import { selectedNoteList } from "./note-selection";

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
  // 選択中のノート (フォーカスユニットの ON のクロック)。タブをまたいで持ち越さないので
  // ProjectState には含めない
  selectedNotes: [] as number[],
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
export function exitSolo(): void {
  doc.soloUnit = -1;
  doc.muted = [...doc.soloBackup];
  doc.soloBackup = [];
}

// 削除・読み込み後に選択/ミュート/ソロ状態をユニット数へ整合化する
function cleanupSelection(): void {
  const s = service;
  if (doc.focusUnit >= s.unitNum) doc.focusUnit = -1;
  // undo や範囲操作で消えたノートを選択から外す
  if (doc.selectedNotes.length > 0) {
    const heads = new Set(selectedNoteList().map((n) => n.head));
    doc.selectedNotes = doc.selectedNotes.filter((h) => heads.has(h));
  }
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
  touchCurrentRevision();
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
  doc.selectedNotes = [];
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
  markCurrentRevisionSaved();
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
  markCurrentRevisionSaved();
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
