// 左のユニットリスト (フォーカス / operated / 並べ替え / ミュート / メニュー)
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
  replaceUnitRaw,
  removeUnit,
  setUnitName,
  beginEdit,
  commitEdit,
  sync,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { previewWoice } from "../../engine/preview";

const rowH = 16;
const editing = ref<number | null>(null);
const editText = ref("");
const menu = ref<{ x: number; y: number; unit: number } | null>(null);
const trayRef = ref<HTMLElement | null>(null);

function onPointerDown(e: PointerEvent, idx: number): void {
  const s = getService();
  if (!s) return;
  const tray = trayRef.value;
  const x = e.clientX - (tray?.getBoundingClientRect().left ?? 0);

  // ミュートトグル (先頭14px)
  if (x < 14 && e.button === 0) {
    toggleUnitMute(idx);
    return;
  }

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

  // 試聴
  const u = s.unitGet(idx);
  if (u?.woice) {
    let wIdx = -1;
    for (let w = 0; w < s.woiceNum; w++) if (s.woiceGet(w) === u.woice) wIdx = w;
    previewWoice(u.woice, wIdx, EVENTDEFAULT_KEY, 104, 0.8);
  }

  // ドラッグ並べ替え
  if (!e.ctrlKey && !e.shiftKey && tray) {
    let lastTarget = idx;
    let undoPushed = false;
    const onMove = (ev: PointerEvent): void => {
      const dy = ev.clientY - tray.getBoundingClientRect().top;
      const row = Math.floor(dy / rowH);
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
    <div class="tray-title">ユニット</div>
    <div ref="trayRef" class="tray-list" @contextmenu.prevent>
      <div
        v-for="u in units"
        :key="u.index"
        class="unit-row"
        :class="{
          focus: u.index === doc.focusUnit,
          operated: doc.operated.includes(u.index),
          muted: u.muted,
        }"
        :style="{ height: rowH + 'px' }"
        @pointerdown="onPointerDown($event, u.index)"
        @dblclick="startEditName(u.index)"
      >
        <span class="unit-mute" :class="{ off: u.muted }" title="ミュート">♪</span>
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
        <span v-if="u.woiceIndex >= 0 && editing !== u.index" class="unit-woice" title="音色番号">
          [{{ u.woiceIndex }}]
        </span>
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
  padding: 3px 6px;
  font-size: 11px;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
  background: var(--panel-light);
}

.tray-list {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.unit-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 2px;
  font-size: 11px;
  color: var(--text);
  cursor: default;
  border-bottom: 1px solid rgba(52, 50, 85, 0.4);
  white-space: nowrap;
  overflow: hidden;
}

.unit-row:nth-child(even) {
  background: rgba(255, 255, 255, 0.02);
}

.unit-row.focus {
  background: rgba(240, 128, 0, 0.25);
  color: #fff;
}

.unit-row.operated {
  outline: 1px solid rgba(240, 128, 0, 0.5);
  outline-offset: -1px;
}

.unit-row.muted .unit-name {
  color: var(--text-dim);
  text-decoration: line-through;
}

.unit-mute {
  font-size: 10px;
  color: var(--accent);
  width: 12px;
  text-align: center;
}

.unit-mute.off {
  color: var(--text-dim);
}

.unit-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-name-input {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  padding: 0 2px;
}

.unit-woice {
  font-size: 9px;
  color: var(--accent);
}

.ctxmenu .danger {
  color: #ff8888;
}
</style>
