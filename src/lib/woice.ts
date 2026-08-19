// 音色 (Woice) の表示用サマリ文字列生成
import { WoiceType, VoiceType, type Woice } from "pxtone-ts";
import { t } from "../i18n";

// 音色ファイルの選択・ドロップで使う accept と拡張子除去 (ToolPanel / WoiceTray で共通)
export const WOICE_FILE_ACCEPT = ".ptvoice,.ptnoise,.wav,.ogg";
export const WOICE_FILE_EXT_RE = /\.(ptvoice|ptnoise|wav|ogg)$/i;

export function woiceSummary(w: Woice): string {
  const vc = w.getVoice(0);
  if (!vc) return "";
  switch (w.type) {
    case WoiceType.PCM:
      return `${vc.pcm.sps}Hz/${vc.pcm.bps}bit/${vc.pcm.ch}ch ${(vc.pcm.sec * 1000).toFixed(0)}ms`;
    case WoiceType.PTV:
      if (vc.type === VoiceType.Coodinate) {
        return t("woice.summaryCoord").replace("{n}", String(vc.wave.num));
      }
      if (vc.type === VoiceType.Overtone) {
        return t("woice.summaryOvertone").replace("{n}", String(vc.wave.num));
      }
      return t("woice.summaryUnknown");
    case WoiceType.PTN:
      return t("woice.summaryPtn").replace("{n}", String(vc.ptn.unitNum)).replace("{ms}", (vc.ptn.sec * 1000).toFixed(0));
    case WoiceType.OGGV:
      // 生 OGG の情報 (チャンネル/サンプリングレート/サンプル数) を表示 (本家 GetInfo 相当)
      return `${vc.oggv?.ch ?? "?"}ch/${vc.oggv?.sps ?? "?"}Hz/${vc.oggv?.smpNum ?? "?"}smp`;
    default:
      return "";
  }
}
