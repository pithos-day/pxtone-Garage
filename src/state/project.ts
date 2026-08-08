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
import { service, ensureService, EXE_VER } from "./service";
import { pushUndo, clearUndo } from "./undo";
import { t } from "../i18n";

export type ToolMode = "W" | "U";

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
  operated: [] as number[],
  scrollX: 0, // フィールド左端のクロック
  scrollYUnit: 0, // ユニットトレイの行オフセット
  scrollYKey: 0, // ピアノロールの行オフセット (0 = 最上段 = コード108)
  zoom: 48, // 1拍のピクセル幅
  divi: 4, // 拍分割
  scope1: 0, // 選択範囲 (クロック)
  scope2: 0,
  volumeVisible: false,
  volumeMode: 0, // VOLUMEMODE (0=Velocity..7=Tuning)
  tool: "pen" as "pen" | "hand", // ピアノロール用ツール
  copier: [true, true, true, true, true, true, true, true, true] as boolean[],
  muted: [] as number[], // ミュート中のユニット index
  unitVisible: [] as boolean[], // ピアノロールに表示するユニット
  unitPinned: [] as boolean[], // ピン留め中のユニット
  soloUnit: -1, // ソロ中のユニット index (-1 = なし)
  soloBackup: [] as number[], // ソロ開始時のミュート状態 (解除時に復元)
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
  const s = service;
  // 表示/ピン留め配列をユニット数に合わせる (新規ユニットは表示オン)
  while (doc.unitVisible.length < s.unitNum) doc.unitVisible.push(true);
  while (doc.unitPinned.length < s.unitNum) doc.unitPinned.push(false);
  if (doc.unitVisible.length > s.unitNum) doc.unitVisible.length = s.unitNum;
  if (doc.unitPinned.length > s.unitNum) doc.unitPinned.length = s.unitNum;
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
  const ws: WoiceInfo[] = [];
  for (let i = 0; i < s.woiceNum; i++) {
    const w = s.woiceGet(i);
    if (!w) continue;
    ws.push({ index: i, name: woiceName(w), type: w.type, typeName: woiceTypeName(w.type) });
  }
  woices.value = ws;
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
  title.value = service.text.getNameString();
  comment.value = service.text.getCommentString();
  if (doc.focusUnit >= s.unitNum) doc.focusUnit = -1;
  doc.operated = doc.operated.filter((u) => u >= 0 && u < s.unitNum);
  doc.muted = doc.muted.filter((u) => u >= 0 && u < s.unitNum);
  doc.soloBackup = doc.soloBackup.filter((u) => u >= 0 && u < s.unitNum);
  if (doc.soloUnit >= s.unitNum) {
    // ソロ対象が消えた: ソロを解除して元のミュート状態を復元
    doc.soloUnit = -1;
    doc.muted = [...doc.soloBackup];
    doc.soloBackup = [];
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

// 単発操作
export function mutate(fn: () => void): void {
  pushUndo();
  fn();
  commitEdit();
}

// ---- プロジェクト全体 ----

export function newProject(): boolean {
  if (!ensureInit()) return false;
  service.clear();
  doc.fileName = "";
  doc.focusUnit = -1;
  doc.operated = [];
  doc.muted = [];
  doc.soloUnit = -1;
  doc.soloBackup = [];
  doc.scope1 = 0;
  doc.scope2 = 0;
  doc.scrollX = 0;
  doc.scrollYUnit = 0;
  doc.scrollYKey = 0;
  doc.dirty = false;
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
  doc.focusUnit = -1;
  doc.operated = [];
  doc.muted = [];
  doc.soloUnit = -1;
  doc.soloBackup = [];
  doc.scope1 = 0;
  doc.scope2 = 0;
  doc.scrollX = 0;
  doc.scrollYUnit = 0;
  doc.scrollYKey = 0;
  doc.dirty = false;
  clearUndo();
  sync();
  doc.rev++;
  return null;
}

// 現在のプロジェクトを ptcop バイト列へ
export function exportBytes(): Uint8Array | null {
  if (!doc.ready) return null;
  const io = new MemoryIo();
  if (service.write(io, false, EXE_VER) !== PxtnErr.OK) return null;
  return io.toUint8Array();
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
      return `${t("error.loadWithErr")} (err=${res})`;
  }
}

// ---- ユニット ----

export function addUnit(name?: string): boolean {
  let ok = false;
  mutate(() => {
    ok = service.unitAddNew();
    if (ok && name) {
      const u = service.unitGet(service.unitNum - 1);
      u?.setNameBuf(name);
    }
  });
  return ok;
}

export function removeUnit(idx: number): void {
  // 削除されるユニット番号を UI 状態 (選択/ミュート/ソロ/表示/ピン) に反映してから削除
  const shift = (n: number): number => (n === idx ? -1 : n > idx ? n - 1 : n);
  doc.operated = doc.operated.map(shift).filter((n) => n >= 0);
  doc.muted = doc.muted.map(shift).filter((n) => n >= 0);
  doc.soloBackup = doc.soloBackup.map(shift).filter((n) => n >= 0);
  doc.unitVisible = shiftArr(doc.unitVisible, idx);
  doc.unitPinned = shiftArr(doc.unitPinned, idx);
  if (doc.soloUnit === idx) {
    // ソロ対象の削除: ソロ解除して元のミュート状態を復元
    doc.soloUnit = -1;
    doc.muted = [...doc.soloBackup];
    doc.soloBackup = [];
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
  doc.operated = move(doc.operated);
  doc.muted = move(doc.muted);
  doc.soloBackup = move(doc.soloBackup);
  doc.unitVisible = move(doc.unitVisible);
  doc.unitPinned = move(doc.unitPinned);
  if (doc.soloUnit >= 0) {
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

export function toggleOperated(idx: number): void {
  const i = doc.operated.indexOf(idx);
  if (i >= 0) doc.operated.splice(i, 1);
  else doc.operated.push(idx);
}

export function setOperatedRange(idx: number): void {
  const a = Math.min(doc.focusUnit, idx);
  const b = Math.max(doc.focusUnit, idx);
  doc.operated = [];
  for (let u = a; u <= b; u++) doc.operated.push(u);
}

export function clearOperated(): void {
  doc.operated = [];
}

export function toggleUnitMute(idx: number): void {
  if (doc.soloUnit >= 0) {
    // ソロ中の手動変更: ソロを解除し、元のミュート状態に今回の変更を反映
    const wasMuted = doc.muted.includes(idx);
    doc.muted = [...doc.soloBackup];
    doc.soloUnit = -1;
    doc.soloBackup = [];
    const i = doc.muted.indexOf(idx);
    if (wasMuted) {
      if (i >= 0) doc.muted.splice(i, 1);
    } else if (i < 0) {
      doc.muted.push(idx);
    }
  } else {
    const i = doc.muted.indexOf(idx);
    if (i >= 0) doc.muted.splice(i, 1);
    else doc.muted.push(idx);
  }
  sync();
  doc.rev++;
}

// ソロ切替。ON: 他ユニットを全ミュート、OFF (同ユニット再クリック):
// ソロ開始前のミュート状態 (soloBackup) を復元
export function toggleUnitSolo(idx: number): void {
  if (doc.soloUnit === idx) {
    doc.soloUnit = -1;
    doc.muted = [...doc.soloBackup];
    doc.soloBackup = [];
  } else {
    doc.soloBackup = [...doc.muted];
    doc.soloUnit = idx;
    doc.muted = units.value.map((u) => u.index).filter((u) => u !== idx);
  }
  sync();
  doc.rev++;
}

// ピアノロールにノートを表示するか (表示チェック)
export function toggleUnitVisible(idx: number): void {
  doc.unitVisible[idx] = !(doc.unitVisible[idx] ?? true);
  sync();
  doc.rev++;
}

// 全ユニットの表示を一括設定 (View メニュー「全ユニット表示」)
export function setAllUnitsVisible(visible: boolean): void {
  for (let u = 0; u < doc.unitVisible.length; u++) doc.unitVisible[u] = visible;
  sync();
  doc.rev++;
}

// ピン留め (上部レーン固定)
export function toggleUnitPinned(idx: number): void {
  doc.unitPinned[idx] = !(doc.unitPinned[idx] ?? false);
  sync();
  doc.rev++;
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

// 編集対象ユニット (フォーカス + operated)
export function focusedOrOperated(): number[] {
  const set = new Set<number>(doc.operated);
  if (doc.focusUnit >= 0) set.add(doc.focusUnit);
  return [...set].sort((a, b) => a - b);
}

// ---- 音色 ----

// PTV/PTN/PCM ファイルバイト列を音色として追加
export function addWoice(bytes: Uint8Array, type: WoiceType): string | null {
  if (!doc.ready) return t("error.notReady");
  let err: string | null = null;
  mutate(() => {
    const io = new MemoryIo(bytes);
    const res = service.woiceRead(service.woiceNum, io, type);
    if (res !== PxtnErr.OK) {
      err = pxtnErrorMessage(res);
      return;
    }
  });
  return err;
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

export function setUnitWoice(unitIdx: number, woiceIdx: number): void {
  mutate(() => {
    const u = service.unitGet(unitIdx);
    const w = service.woiceGet(woiceIdx);
    if (u && w) u.setWoice(w);
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
export function setProjectSettings(o: {
  name?: string;
  comment?: string;
  tempo?: number;
  beatNum?: number;
  measNum?: number;
}): void {
  mutate(() => {
    if (o.name !== undefined) service.text.setNameBuf(encodeShiftJis(o.name));
    if (o.comment !== undefined) service.text.setCommentBuf(encodeShiftJis(o.comment));
    if (o.tempo !== undefined) service.master.set(service.master.beatNum, o.tempo, service.master.beatClock);
    if (o.beatNum !== undefined) service.master.set(o.beatNum, service.master.beatTempo, service.master.beatClock);
    if (o.measNum !== undefined) service.master.setMeasNum(o.measNum);
  });
}

export function setRepeatMeas(meas: number): void {
  mutate(() => {
    service.master.setRepeatMeas(meas);
  });
}

export function setLastMeas(meas: number): void {
  mutate(() => {
    service.master.setLastMeas(meas);
  });
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

export function clockView() {
  return {
    beatClock: service.master.beatClock,
    beatNum: service.master.beatNum,
    zoom: doc.zoom,
    measNum: service.master.measNum,
  };
}

// 範囲内のイベント一覧 (unitNo, kind でフィルタ可)
export function eventsInRange(clock1: number, clock2: number, unitNo?: number): EveRecord[] {
  const records = service.evels.records;
  const out: EveRecord[] = [];
  for (const e of records) {
    if (e.kind === EventKind.NULL) continue;
    if (e.clock < clock1 || e.clock > clock2) continue;
    if (unitNo !== undefined && e.unitNo !== unitNo) continue;
    out.push(e);
  }
  return out;
}

export function getAllEvents(): EveRecord[] {
  return service.evels.records.filter((e) => e.kind !== EventKind.NULL);
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

export function clearScope(): void {
  doc.scope1 = 0;
  doc.scope2 = 0;
}

// 音色を単体ファイルバイト列としてエクスポート。
// Woice.read は PTV を ptvRead、PTN を ptn.read で直接読むため、
// PTV は .ptvoice 形式、PTN は .ptnoise 形式 (共にスタンドアロン) で書き出す。
// PCM のみ mate セクション形式 (ioMatePcmR が読む) を使う。
export function woiceBytes(idx: number): Uint8Array | null {
  const w = service.woiceGet(idx);
  if (!w) return null;
  const io = new MemoryIo();
  switch (w.type) {
    case WoiceType.PTV: {
      const size = w.ptvWrite(io);
      if (size < 0) return null;
      break;
    }
    case WoiceType.PTN: {
      const vc = w.getVoice(0);
      if (!vc || !vc.ptn.write(io)) return null;
      break;
    }
    case WoiceType.PCM:
      if (!w.ioMatePcmW(io)) return null;
      break;
    default:
      return null;
  }
  return io.toUint8Array();
}
