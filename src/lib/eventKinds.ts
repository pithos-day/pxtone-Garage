// イベント種別の表示用定数テーブル (CopierPanel のフィルタ定義)
import { EventKind } from "pxtone-ts";

// Copier のコピー種別フィルタ (9種)。index は doc.copier の index と対応
export const COPIER_KINDS = [
  { index: 0, label: "ON", kind: EventKind.ON },
  { index: 1, label: "KEY", kind: EventKind.KEY },
  { index: 2, label: "PAN_VOLUME", kind: EventKind.PAN_VOLUME },
  { index: 3, label: "PAN_TIME", kind: EventKind.PAN_TIME },
  { index: 4, label: "VELOCITY", kind: EventKind.VELOCITY },
  { index: 5, label: "VOLUME", kind: EventKind.VOLUME },
  { index: 6, label: "PORTAMENT", kind: EventKind.PORTAMENT },
  { index: 7, label: "VOICENO", kind: EventKind.VOICENO },
  { index: 8, label: "GROUPNO", kind: EventKind.GROUPNO },
] as const;
