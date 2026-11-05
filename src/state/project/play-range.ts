// スコープの設定と編集用再生範囲 (Start/End)
import { service } from "../service";
import { clamp } from "../../lib/clamp";
import { doc } from "./core";

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
    doc.playStart = clamp(meas, 0, max);
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
    doc.playEnd = clamp(meas, minEnd, max);
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
  const start = clamp(lo, 0, measNum - 1);
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
