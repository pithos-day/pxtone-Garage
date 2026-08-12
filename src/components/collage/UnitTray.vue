// 左のユニットリスト (U タブ)。
// 再生/表示/ピン留めのチェックボックスとソロのラジオボタンを持つ。
// 列ヘッダー付きで、ユニット名の下には割り当て音色名を表示する。
<script setup lang="ts">
import { ref } from "vue";
import {
  doc,
  units,
  woices,
  getService,
  setFocusUnit,
  toggleSelected,
  selectRange,
  clearSelection,
  toggleUnitMute,
  toggleUnitVisible,
  toggleUnitPinned,
  toggleUnitSolo,
  replaceUnitRaw,
  removeUnit,
  setUnitName,
  sync,
  EVENTDEFAULT_KEY,
  EVENTDEFAULT_VOLUME,
} from "../../state/project";
import { previewUnitHold } from "../../engine/preview";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
import { useDragUndo } from "../../composables/useUndo";
import { useHoldPreview } from "../../composables/useHoldPreview";
import { t } from "../../i18n";
import ChangeUnitDialog from "./ChangeUnitDialog.vue";

// チェックボックス列 (再生/表示/ピン/ソロ) の幅。CSS の --checks-w と同期
const CHECKS_W = 76;
const ROW_PAD_L = 4; // .unit-row の左パディング (チェックボックス列の開始位置)

const editing = ref<number | null>(null);
const editText = ref("");
const menu = ref<{ x: number; y: number; unit: number } | null>(null);
const changeUnitIdx = ref(-1);
const trayRef = ref<HTMLElement | null>(null);

useCtxMenuClose(menu);

function onPointerDown(e: PointerEvent, idx: number): void {
  const s = getService();
  if (!s) return;
  const tray = trayRef.value;
  const x = e.clientX - (tray?.getBoundingClientRect().left ?? 0);

  // チェックボックス列 (再生/表示/ピン/ソロの横並び領域) は @pointerdown.stop で処理済み
  if (x < CHECKS_W + ROW_PAD_L) return;

  if (e.button === 2) {
    setFocusUnit(idx);
    menu.value = { x: e.clientX, y: e.clientY, unit: idx };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;

  if (e.ctrlKey || e.metaKey) {
    toggleSelected(idx);
  } else if (e.shiftKey) {
    if (doc.focusUnit >= 0) selectRange(idx);
    else setFocusUnit(idx);
  } else {
    setFocusUnit(idx);
    clearSelection();
  }

  // 押下中サステインで試聴
  const u = s.unitGet(idx);
  if (u?.woice) {
    hold.onPress();
    previewUnitHold(idx, EVENTDEFAULT_KEY, EVENTDEFAULT_VOLUME);
  }

  // ドラッグ並べ替え (ctrl/shift 選択中は無効)
  if (!e.ctrlKey && !e.shiftKey && tray) {
    startDragReorder(tray, idx);
  }
}

// 行の実測高さを基準に、ドラッグ中のマウス位置へユニットを逐次並べ替える
// (undo は並べ替え開始時の1エントリにまとめる)
function startDragReorder(tray: HTMLElement, idx: number): void {
  const first = tray.querySelector<HTMLElement>(".unit-row");
  const h = first?.offsetHeight ?? 24;
  let lastTarget = idx;
  const dragUndo = useDragUndo();
  const onMove = (ev: PointerEvent): void => {
    const dy = ev.clientY - tray.getBoundingClientRect().top;
    const row = Math.floor((tray.scrollTop + dy) / h);
    if (row >= 0 && row < units.value.length && row !== lastTarget) {
      dragUndo.onFirstMove();
      replaceUnitRaw(lastTarget, row);
      lastTarget = row;
      sync();
      doc.rev++;
    }
  };
  const onUp = (): void => {
    tray.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    dragUndo.finish();
  };
  tray.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

const hold = useHoldPreview();
function onPointerUp(): void {
  hold.onRelease();
}

// ソロのラジオ操作。
// ON: ネイティブのチェック (change イベント) で切替。OFF: チェック済みラジオの
// 再クリック (チェック状態は変わらないため click で処理)。
// ネイティブのチェックを活かすことで、ブラウザのラジオグループ処理と
// 表示がズレないようにする
function onSoloChange(idx: number, e: Event): void {
  if ((e.target as HTMLInputElement).checked) toggleUnitSolo(idx);
}

function onSoloClick(idx: number): void {
  if (units.value[idx]?.soloed) toggleUnitSolo(idx);
}

function startEditName(idx: number): void {
  editing.value = idx;
  editText.value = units.value[idx]?.name ?? "";
  menu.value = null;
  // 入力欄は autofocus でフォーカスされ、外側クリック (blur) で編集状態が解除される
}

function commitEditName(idx: number): void {
  if (editing.value === idx) {
    const name = editText.value.trim();
    if (name) setUnitName(idx, name);
  }
  editing.value = null;
}

function onMenuAction(action: "edit" | "remove" | "change"): void {
  const u = menu.value?.unit;
  menu.value = null;
  if (u === undefined) return;
  if (action === "edit") startEditName(u);
  else if (action === "remove") removeUnit(u);
  else changeUnitIdx.value = u;
}
</script>

<template>
  <div class="tray" :style="{ '--checks-w': CHECKS_W + 'px' }">
    <div class="tray-title bar-header">
      {{ t("unit.title") }} ({{ units.length }})
      <span class="tray-tools">
        <button class="btn btn-sm" :class="{ on: doc.tool === 'pen' }" :title="t('unit.pen')" @click="doc.tool = 'pen'">ペン</button>
        <button class="btn btn-sm" :class="{ on: doc.tool === 'hand' }" :title="t('unit.hand')" @click="doc.tool = 'hand'">キー</button>
      </span>
    </div>
    <div class="unit-header bar-header">
      <span class="unit-header-checks">
        <span :title="t('unit.play')">{{ t("unit.headerPlay") }}</span>
        <span :title="t('unit.show')">{{ t("unit.headerShow") }}</span>
        <span :title="t('unit.pin')">{{ t("unit.headerPin") }}</span>
        <span :title="t('unit.solo')">{{ t("unit.headerSolo") }}</span>
      </span>
      <span class="unit-header-name">{{ t("unit.headerName") }}</span>
    </div>
    <div ref="trayRef" class="tray-list" @contextmenu.prevent @pointerup="onPointerUp">
      <div
        v-for="u in units"
        :key="u.index"
        class="unit-row"
        :class="{ focus: u.index === doc.focusUnit, selected: doc.selectedUnits.includes(u.index), muted: u.muted }"
        :style="{ borderLeft: '4px solid ' + (u.pinned ? 'var(--primary)' : 'transparent') }"
        @pointerdown="onPointerDown($event, u.index)"
        @dblclick="startEditName(u.index)"
      >
        <span class="unit-checks" @pointerdown.stop>
          <input type="checkbox" :title="t('unit.play')" :checked="!u.muted" @click.stop="toggleUnitMute(u.index)" />
          <input type="checkbox" :title="t('unit.show')" :checked="u.visible" @click.stop="toggleUnitVisible(u.index)" />
          <input type="checkbox" :title="t('unit.pin')" :checked="u.pinned" @click.stop="toggleUnitPinned(u.index)" />
          <input type="radio" name="unit-solo" :title="t('unit.solo')" :checked="u.soloed" @change="onSoloChange(u.index, $event)" @click="onSoloClick(u.index)" />
        </span>
        <span class="unit-info">
          <span v-if="editing !== u.index" class="unit-name" :title="`${u.index}: ${u.name}`">
            {{ u.index }}. {{ u.name }}
          </span>
          <input
            v-else
            v-model="editText"
            class="unit-name-input"
            autofocus
            maxlength="16"
            @keydown.enter="commitEditName(u.index)"
            @keydown.esc="editing = null"
            @blur="commitEditName(u.index)"
            @pointerdown.stop
          />
          <span class="unit-summary">{{ woices[u.woiceIndex]?.name ?? t("unit.noWoice") }}</span>
        </span>
      </div>
      <div v-if="units.length === 0" class="tray-empty">{{ t("unit.empty") }}</div>
    </div>
    <div v-if="menu" class="ctxmenu popup" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <button v-if="woices.length > 0" @click="onMenuAction('change')">{{ t("unit.changeWoice") }}</button>
      <button @click="onMenuAction('edit')">{{ t("unit.editName") }}</button>
      <button class="danger" @click="onMenuAction('remove')">{{ t("common.delete") }}</button>
    </div>
    <ChangeUnitDialog v-if="changeUnitIdx >= 0" :unit-idx="changeUnitIdx" @close="changeUnitIdx = -1" />
  </div>
</template>

<style scoped>
.tray {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  user-select: none;
}

.tray-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  font-size: var(--text-sm);
}

.tray-tools {
  display: flex;
  gap: var(--space-2xs);
}

/* 列ヘッダー (再生/表示/ピン/ソロ/名前) */
.unit-header {
  display: flex;
  gap: var(--space-2xs);
  padding: 2px 4px;
  font-size: var(--text-2xs);
  flex: none;
}

.unit-header-checks {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  width: var(--checks-w);
  flex: none;
}

.unit-header-checks span {
  width: 16px;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
}

.unit-header-name {
  flex: 1;
  min-width: 0;
  padding-left: 2px;
  overflow: hidden;
  white-space: nowrap;
}

.tray-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
}

.unit-row {
  display: flex;
  gap: var(--space-2xs);
  padding: 2px 4px;
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}

.unit-row:hover {
  background: var(--card);
}

.unit-row:hover:not(.focus) .unit-name {
  color: var(--card-foreground);
}

.unit-row:hover:not(.focus) .unit-summary {
  color: var(--card-foreground);
}

.unit-row.focus {
  background: color-mix(in srgb, var(--primary) 15%, transparent);
}

.unit-row.selected {
  outline: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
  outline-offset: -1px;
}

.unit-row.muted .unit-name {
  color: var(--muted-foreground);
  text-decoration: line-through;
}

.unit-checks {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  width: var(--checks-w);
  flex: none;
}

.unit-checks input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--primary);
  cursor: pointer;
}

.unit-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.unit-name {
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-name-input {
  font-size: var(--text-sm);
  padding: 0 2px;
  background: var(--secondary);
  color: var(--secondary-foreground);
}

.unit-summary {
  font-size: var(--text-2xs);
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tray-empty {
  padding: 8px;
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  line-height: 1.6;
  white-space: pre-line;
}

.ctxmenu .danger {
  color: var(--destructive);
}
</style>
