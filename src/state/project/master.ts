// マスター (BPM・拍子・小節) とテキスト
import { encodeShiftJis } from "../../lib/sjis";
import { service } from "../service";
import { doc, mutate } from "./core";

export function setTempo(tempo: number): void {
  mutate(() => {
    service.master.set(service.master.beatNum, tempo, service.master.beatClock);
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
