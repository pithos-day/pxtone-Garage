// イベント種別の表示用定数テーブル (CopierPanel のフィルタ定義)
import { EventKind } from "pxtone-ts";

// Copier のコピー種別フィルタ (9種)。i は doc.copier の index と対応
export const COPIER_KINDS = [
  { i: 0, label: "ON", kind: EventKind.ON },
  { i: 1, label: "KEY", kind: EventKind.KEY },
  { i: 2, label: "PAN_VOLUME", kind: EventKind.PAN_VOLUME },
  { i: 3, label: "PAN_TIME", kind: EventKind.PAN_TIME },
  { i: 4, label: "VELOCITY", kind: EventKind.VELOCITY },
  { i: 5, label: "VOLUME", kind: EventKind.VOLUME },
  { i: 6, label: "PORTAMENT", kind: EventKind.PORTAMENT },
  { i: 7, label: "VOICENO", kind: EventKind.VOICENO },
  { i: 8, label: "GROUPNO", kind: EventKind.GROUPNO },
] as const;
