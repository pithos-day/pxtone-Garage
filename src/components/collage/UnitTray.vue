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
  toggleOperated,
  setOperatedRange,
  clearOperated,
  toggleUnitMute,
  toggleUnitVisible,
  toggleUnitPinned,
  toggleUnitSolo,
  replaceUnitRaw,
  removeUnit,
  setUnitName,
  beginEdit,
  commitEdit,
  sync,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { previewUnitHold, stopPreview } from "../../engine/preview";
import { COLORS } from "../../lib/theme";
import { useCtxMenuClose } from "../../composables/useCtxMenu";
import { t } from "../../i18n";

const editing = ref<number | null>(null);
const editText = ref("");
const menu = ref<{ x: number; y: number; unit: number } | null>(null);
const trayRef = ref<HTMLElement | null>(null);
const rowH = ref(16); // 行の実測高さ (ドラッグ並べ替え用)

useCtxMenuClose(menu);

function onPointerDown(e: PointerEvent, idx: number): void {
  const s = getService();
  if (!s) return;
  const tray = trayRef.value;
  const x = e.clientX - (tray?.getBoundingClientRect().left ?? 0);

  // チェックボックス列 (再生/表示/ピン/ソロの横並び領域) は @pointerdown.stop で処理済み
  if (x < 80) return;

  if (e.button === 2) {
    setFocusUnit(idx);
    menu.value = { x: e.clientX, y: e.clientY, unit: idx };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;

  if (e.ctrlKey || e.metaKey) {
    toggleOperated(idx);
  } else if (e.shiftKey) {
    if (doc.focusUnit >= 0) setOperatedRange(idx);
    else setFocusUnit(idx);
  } else {
    setFocusUnit(idx);
    clearOperated();
  }

  // 押下中サステインで試聴
  const u = s.unitGet(idx);
  if (u?.woice) {
    previewUnitHold(idx, EVENTDEFAULT_KEY, 104);
  }

  // ドラッグ並べ替え
  if (!e.ctrlKey && !e.shiftKey && tray) {
    const h = rowH.value || 16;
    let lastTarget = idx;
    let undoPushed = false;
    const onMove = (ev: PointerEvent): void => {
      const dy = ev.clientY - tray.getBoundingClientRect().top;
      const row = Math.floor(dy / h);
      if (row >= 0 && row < units.value.length && row !== lastTarget) {
        if (!undoPushed) {
          beginEdit();
          undoPushed = true;
        }
        replaceUnitRaw(lastTarget, row);
        lastTarget = row;
        sync();
        doc.rev++;
      }
    };
    const onUp = (): void => {
      tray.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (undoPushed) commitEdit();
    };
    tray.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
}

function onPointerUp(): void {
  stopPreview();
}

// ソロのラジオクリック。ネイティブのチェックは .prevent で抑止し、
// checked 状態は常に :checked バインディング (u.soloed) に追従させる
// (連続クリックでも表示がズレないように)
function onSoloClick(idx: number): void {
  toggleUnitSolo(idx);
}

function startEditName(idx: number): void {
  editing.value = idx;
  editText.value = units.value[idx]?.name ?? "";
  menu.value = null;
}

function commitEditName(idx: number): void {
  if (editing.value === idx) {
    const name = editText.value.trim();
    if (name) setUnitName(idx, name);
  }
  editing.value = null;
}

function onMenuAction(action: "edit" | "remove"): void {
  const u = menu.value?.unit;
  menu.value = null;
  if (u === undefined) return;
  if (action === "edit") startEditName(u);
  else if (action === "remove") removeUnit(u);
}
</script>

<template>
  <div class="tray">
    <div class="tray-title">
      {{ t("unit.title") }} ({{ units.length }})
      <span class="tray-tools">
        <button class="btn btn-sm" :class="{ on: doc.tool === 'pen' }" :title="t('unit.pen')" @click="doc.tool = 'pen'">ペン</button>
        <button class="btn btn-sm" :class="{ on: doc.tool === 'hand' }" :title="t('unit.hand')" @click="doc.tool = 'hand'">キー</button>
      </span>
    </div>
    <div class="unit-header">
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
        :class="{ focus: u.index === doc.focusUnit, operated: doc.operated.includes(u.index), muted: u.muted }"
        :style="{ borderLeft: '4px solid ' + (u.pinned ? COLORS.pinnedMark : 'transparent') }"
        @pointerdown="onPointerDown($event, u.index)"
        @dblclick="startEditName(u.index)"
      >
        <span class="unit-checks" @pointerdown.stop>
          <input type="checkbox" :title="t('unit.play')" :checked="!u.muted" @click.stop="toggleUnitMute(u.index)" />
          <input type="checkbox" :title="t('unit.show')" :checked="u.visible" @click.stop="toggleUnitVisible(u.index)" />
          <input type="checkbox" :title="t('unit.pin')" :checked="u.pinned" @click.stop="toggleUnitPinned(u.index)" />
          <input type="radio" name="unit-solo" :title="t('unit.solo')" :checked="u.soloed" @click.prevent="onSoloClick(u.index)" />
        </span>
        <span class="unit-info">
          <span v-if="editing !== u.index" class="unit-name" :title="`${u.index}: ${u.name}`">
            {{ u.index }}. {{ u.name }}
          </span>
          <input
            v-else
            v-model="editText"
            class="unit-name-input"
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
    <div v-if="menu" class="ctxmenu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <button @click="onMenuAction('edit')">{{ t("unit.editName") }}</button>
      <button class="danger" @click="onMenuAction('remove')">{{ t("common.delete") }}</button>
    </div>
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
  font-size: 11px;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
  background: var(--secondary);
}

.tray-tools {
  display: flex;
  gap: 2px;
}

/* 列ヘッダー (再生/表示/ピン/ソロ/名前) */
.unit-header {
  display: flex;
  gap: 2px;
  padding: 2px 4px;
  font-size: 9px;
  color: var(--muted-foreground);
  background: var(--muted);
  border-bottom: 1px solid var(--border);
  flex: none;
  user-select: none;
}

.unit-header-checks {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 76px;
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
  gap: 2px;
  padding: 2px 4px;
  font-size: 11px;
  color: var(--muted-foreground);
  cursor: pointer;
  border-bottom: 1px solid var(--row-border);
}

.unit-row:hover {
  background: var(--secondary);
}

.unit-row.focus {
  background: var(--focus-row);
}

.unit-row.operated {
  outline: 1px solid var(--focus-outline);
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
  gap: 4px;
  width: 76px;
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
  font-size: 11px;
  padding: 0 2px;
}

.unit-summary {
  font-size: 9px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tray-empty {
  padding: 8px;
  font-size: 11px;
  color: var(--muted-foreground);
  line-height: 1.6;
  white-space: pre-line;
}

.ctxmenu .danger {
  color: var(--danger-text);
}
</style>
