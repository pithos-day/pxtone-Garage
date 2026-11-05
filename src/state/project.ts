// プロジェクト状態 (reactive) と編集 API。
// 編集の正本は service (state/service.ts) で、ここではUIが購読するミラーと
// ミューテーションのラッパーを提供する。
// 実装は state/project/ の領域別ファイルにあり、ここで公開 API をまとめて出す。
export { DELAY_UNITS, VOLUME_MODES, beginEdit, comment, commitEdit, delays, doc, encodeUnitName, ensureInit, exportBytes, getService, markSaved, mutate, mutateBoolean, newProject, openProject, overdrives, pxtnErrorMessage, sync, title, unitNameDisplay, units, woiceName, woiceNameRaw, woiceTypeName, woices, type DelayInfo, type OverdriveInfo, type ToolMode, type UnitInfo, type WoiceInfo } from "./project/core";
export { addUnit, addUnitWithWoice, clearSelection, focusedOrSelected, pianoRollUnits, pinnedUnits, removeUnit, replaceUnitRaw, selectRange, setAllUnitsVisible, setFocusUnit, setUnitName, toggleSelected, toggleUnitMute, toggleUnitPinned, toggleUnitSolo, toggleUnitVisible } from "./project/units";
export { addWoice, addWoices, detectWoiceType, prepareWoiceFile, removeWoice, replaceWoiceFile, replaceWoiceRaw, setUnitNameAndWoice, setWoiceProperties, type PreparedWoice, type WoiceProperties } from "./project/woices";
export { fileRepeatToUi, setLastMeas, setMeasNum, setProjectSettings, setRepeatMeas, setTempo, setTextComment, setTextName, uiRepeatToFile } from "./project/master";
export { addEvent, changeEventValue, clockContext, copyMeas, deleteEvents, getAllEvents, projectWriteOps, setEventValue, stemUnits } from "./project/events";
export { addNotesToSelection, clearNoteSelection, clipboardHasNotes, hasNoteSelection, moveSelectedNotesRaw, noteCopy, noteCut, noteDelete, quantize, selectedNoteList, toggleNoteSelected } from "./project/note-selection";
export { scopeClear, scopeClipReady, scopeCopy, scopeCut, scopeDelete, scopeInsert, scopePaste } from "./project/scope";
export { addDelay, addOverdrive, removeDelay, removeOverdrive, updateDelay, updateOverdrive } from "./project/effects";
export { normalizePlayRange, setPlayEnd, setPlayRange, setPlayStart, setScope } from "./project/play-range";

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
} from "pxtone-ts";
