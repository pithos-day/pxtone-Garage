// 左のユニットリスト (U タブ)。
// 音色一覧と同じデザイン感の行に、表示/再生/ピン留めのチェックボックスを持つ
<script setup lang="ts">
import { ref } from "vue";
import {
  doc,
  units,
  getService,
  setFocusUnit,
  toggleOperated,
  setOperatedRange,
  clearOperated,
  toggleUnitMute,
  toggleUnitVisible,
  toggleUnitPinned,
  replaceUnitRaw,
  removeUnit,
  setUnitName,
  beginEdit,
  commitEdit,
  sync,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { previewUnitHold, stopPreview } from "../../engine/preview";

const editing = ref<number | null>(null);
const editText = ref("");
const menu = ref<{ x: number; y: number; unit: number } | null>(null);
const trayRef = ref<HTMLElement | null>(null);
const rowH = ref(16); // 行の実測高さ (ドラッグ並べ替え用)

function onPointerDown(e: PointerEvent, idx: number): void {
  const s = getService();
  if (!s) return;
  const tray = trayRef.value;
  const x = e.clientX - (tray?.getBoundingClientRect().left ?? 0);

  // チェックボックス列 (表示/再生/ピン留めの横並び領域) は @pointerdown.stop で処理済み
  if (x < 56) return;

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
      ユニット ({{ units.length }})
      <span class="tray-tools">
        <button class="btn btn-sm" :class="{ on: doc.tool === 'pen' }" title="ペン (音符)" @click="doc.tool = 'pen'">ペン</button>
        <button class="btn btn-sm" :class="{ on: doc.tool === 'hand' }" title="ハンド (キーのみ)" @click="doc.tool = 'hand'">キー</button>
      </span>
    </div>
    <div ref="trayRef" class="tray-list" @contextmenu.prevent @pointerup="onPointerUp">
      <div
        v-for="u in units"
        :key="u.index"
        class="unit-row"
        :class="{ focus: u.index === doc.focusUnit, operated: doc.operated.includes(u.index), muted: u.muted }"
        :style="{ borderLeft: '4px solid ' + (u.pinned ? '#00f080' : 'transparent') }"
        @pointerdown="onPointerDown($event, u.index)"
        @dblclick="startEditName(u.index)"
      >
        <span class="unit-checks" @pointerdown.stop>
          <input type="checkbox" title="表示 (ピアノロール)" :checked="u.visible" @click.stop="toggleUnitVisible(u.index)" />
          <input type="checkbox" title="再生" :checked="!u.muted" @click.stop="toggleUnitMute(u.index)" />
          <input type="checkbox" title="ピン留め (上部に固定)" :checked="u.pinned" @click.stop="toggleUnitPinned(u.index)" />
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
          <span class="unit-summary">
            {{ u.muted ? "ミュート" : "再生" }} /
            {{ u.visible ? "表示" : "非表示" }} /
            {{ u.pinned ? "ピン留め" : "未ピン" }} /
            音色 {{ u.woiceIndex >= 0 ? u.woiceIndex : "-" }}
          </span>
        </span>
      </div>
      <div v-if="units.length === 0" class="tray-empty">
        ユニットがありません。<br />ツールパネルの「＋ユニット」から追加
      </div>
    </div>
    <div v-if="menu" class="ctxmenu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <button @click="onMenuAction('edit')">名前を編集</button>
      <button class="danger" @click="onMenuAction('remove')">削除</button>
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
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
  background: var(--panel-light);
}

.tray-tools {
  display: flex;
  gap: 2px;
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
  color: var(--text);
  cursor: pointer;
  border-bottom: 1px solid rgba(52, 50, 85, 0.4);
}

.unit-row:hover {
  background: var(--panel-light);
}

.unit-row.focus {
  background: rgba(240, 128, 0, 0.18);
}

.unit-row.operated {
  outline: 1px solid rgba(240, 128, 0, 0.5);
  outline-offset: -1px;
}

.unit-row.muted .unit-name {
  color: var(--text-dim);
  text-decoration: line-through;
}

.unit-checks {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 56px;
  flex: none;
}

.unit-checks input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.unit-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.unit-name {
  color: var(--text-bright);
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
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tray-empty {
  padding: 8px;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.6;
}

.ctxmenu .danger {
  color: #ff8888;
}
</style>
