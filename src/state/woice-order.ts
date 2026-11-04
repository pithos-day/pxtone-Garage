// 音色の並べ替え。音色番号を参照するものをまとめて追従させる。
// (イベントは project、「音色を編集」で開いたタブの書き戻し先は voice / noise が持つ)
import { doc, replaceWoiceRaw } from "./project";
import { currentProjectId } from "./projects";
import { voices } from "./voice";
import { noises } from "./noise";
import { movedIndex } from "../lib/woice";

// undo は呼び出し側で管理する (ドラッグ全体で 1 エントリにまとめるため)
export function moveWoiceRaw(oldPlace: number, newPlace: number): void {
  if (doc.readOnly) return;
  replaceWoiceRaw(oldPlace, newPlace);
  for (const d of [...voices.value, ...noises.value]) {
    if (d.link?.projectId !== currentProjectId.value) continue;
    d.link.woiceIndex = movedIndex(d.link.woiceIndex, oldPlace, newPlace);
  }
}
