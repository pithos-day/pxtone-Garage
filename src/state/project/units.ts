// ユニットの編集と表示状態
import { service } from "../service";
import { doc, encodeUnitName, exitSolo, mutate, mutateBoolean, sync, units } from "./core";
import { applyWoiceToUnitEvents } from "./woices";

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
  // 並べ替え後の並び (order[新しい番号] = 元の番号)
  const order = move([...Array(service.unitNum).keys()]);
  const placeOf = (unit: number): number => order.indexOf(unit);
  // 選択やミュートは位置ごとの値ではなくユニット番号の一覧なので、番号を付け替える
  doc.selectedUnits = doc.selectedUnits.map(placeOf);
  doc.muted = doc.muted.map(placeOf);
  doc.soloBackup = doc.soloBackup.map(placeOf);
  if (doc.focusUnit >= 0) doc.focusUnit = placeOf(doc.focusUnit);
  doc.unitVisible = move(doc.unitVisible);
  doc.unitPinned = move(doc.unitPinned);
  if (doc.soloUnit >= 0) doc.soloUnit = placeOf(doc.soloUnit);
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
