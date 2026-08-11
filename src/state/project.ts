// プロジェクト状態 (reactive) と編集 API。
// 編集の正本は service (state/service.ts) で、ここではUIが購読するミラーと
// ミューテーションのラッパーを提供する。
import { reactive, ref } from "vue";
import {
  WoiceType,
  EventKind,
  PxtnErr,
  MemoryIo,
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
  type EveRecord,
} from "pxtone-ts";
import { encodeShiftJis } from "../lib/sjis";
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
  tool: "pen" as "pen" | "hand", // ピアノロール用ツール
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

// サービスからミラーへ同期
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
      // read 直後は unit.woice が未設定 (VOICENO イベントで決まる) ため、
      // 最後の VOICENO イベント値から音色を解決する
      for (const e of s.evels.records) {
        if (e.kind === EventKind.VOICENO && e.unitNo === i) wIdx = e.value;
      }
      if (wIdx >= s.woiceNum) wIdx = -1;
    }
    us.push({
      index: i,
      name: u.name || `unit ${i}`,
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
  const s = service;
  const ds: DelayInfo[] = [];
  for (let i = 0; i < s.delayNum; i++) {
    const d = s.delayGet(i);
    if (!d) continue;
    ds.push({ index: i, unit: d.unit, freq: d.freq, rate: d.rate, group: d.group });
  }
  delays.value = ds;
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

// 音色名を表示用にデコード (本家同様、最初の NUL で終端する C 文字列扱い)
export function woiceName(w: { getNameBuf(): Uint8Array }): string {
  const buf = w.getNameBuf();
  let end = buf.indexOf(0);
  if (end < 0) end = buf.length;
  return shiftJisToString(buf.subarray(0, end)) || "(no name)";
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
  pushUndo();
}

export function commitEdit(): void {
  service.adjustMeasNum();
  sync();
  markDirty();
}

// 単発操作。fn の戻り値をそのまま返す (失敗判定をクロージャ経由で持ち出さない)
export function mutate<T>(fn: () => T): T | undefined {
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
      u?.setNameBuf(name);
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
    if (name) u?.setNameBuf(name);
    const w = woiceIdx >= 0 ? service.woiceGet(woiceIdx) : null;
    if (u && w) {
      u.setWoice(w);
      writeUnitWoice(ui, woiceIdx);
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

// ドラッグ中など、undo を自前で管理する場合の生操作
export function replaceUnitRaw(oldPlace: number, newPlace: number): void {
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
    const order = [...Array(n).keys()];
    const [moved] = order.splice(oldPlace, 1);
    order.splice(Math.min(newPlace, order.length), 0, moved!);
    doc.soloUnit = order[doc.soloUnit] ?? -1;
  }
  service.unitReplace(oldPlace, newPlace);
  service.evels.recordUnitNoReplace(oldPlace, newPlace);
}

export function setUnitName(idx: number, name: string): void {
  mutate(() => {
    service.unitGet(idx)?.setNameBuf(name);
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

// PTV/PTN/PCM ファイルバイト列を音色として追加。エラーメッセージを返す (成功時 null)
export function addWoice(bytes: Uint8Array, type: WoiceType): string | null {
  if (!doc.ready) return t("error.notReady");
  return (
    mutate(() => {
      const io = new MemoryIo(bytes);
      const res = service.woiceRead(service.woiceNum, io, type);
      if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
      return null;
    }) ?? null
  );
}

export function removeWoice(idx: number): void {
  mutate(() => {
    service.woiceRemove(idx);
  });
}

export function replaceWoice(oldPlace: number, newPlace: number): void {
  if (oldPlace === newPlace) return;
  mutate(() => {
    service.woiceReplace(oldPlace, newPlace);
  });
}

// 再生・プレビューは VOICENO イベントから音色を決定するため、
// ユニットの全 VOICENO イベントを新しい音色に書き換える (無ければ clock 0 に追加)。
function writeUnitWoice(unitIdx: number, woiceIdx: number): void {
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
    if (trimmed) u.setNameBuf(trimmed);
    const w = service.woiceGet(woiceIdx);
    if (!w) return;
    u.setWoice(w);
    writeUnitWoice(unitIdx, woiceIdx);
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
  doc.repeatMeas = meas > 0 ? meas : 0;
  mutate(() => {
    service.master.setRepeatMeas(uiRepeatToFile(doc.repeatMeas));
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
  service.evels.recordAddI(clock, unitNo, kind, value);
}

export function deleteEvents(clock1: number, clock2: number, unitNo: number, kind?: number): void {
  if (kind === undefined) service.evels.recordDeleteByUnit(clock1, clock2, unitNo);
  else service.evels.recordDelete(clock1, clock2, unitNo, kind);
}

export function setEventValue(clock1: number, clock2: number, unitNo: number, kind: number, value: number): void {
  service.evels.recordValueSet(clock1, clock2, unitNo, kind, value);
}

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
    doc.playEnd = Math.max(doc.playStart >= 0 ? doc.playStart + 1 : 0, Math.min(meas, max));
  }
  doc.rev++;
}

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
