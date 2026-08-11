// エフェクトパネル (Delay / OverDrive) — フローティング
<script setup lang="ts">
import { computed, ref } from "vue";
import PanelBox from "./PanelBox.vue";
import { t } from "../../i18n";
import {
  delays,
  overdrives,
  addDelay,
  removeDelay,
  updateDelay,
  addOverdrive,
  removeOverdrive,
  updateOverdrive,
} from "../../state/project";
import { getService, DELAY_UNITS } from "../../state/project";

// 編集中のフォーム。delay と overdrive でフィールドが異なるため判別 union で持つ
// (無関係なフィールドにダミー値 0/1 を入れる旧 form を置き換え)
type EditForm =
  | { kind: "delay"; unit: number; freq: number; rate: number; group: number }
  | { kind: "overdrive"; cut: number; amp: number; group: number };

const editing = ref<EditForm | null>(null);
const editingIdx = ref(-1);


// 上限 (本家: Delay 4 / OverDrive 2)
const delayMax = computed(() => getService()?.delayMax ?? 4);
const overdriveMax = computed(() => getService()?.overdriveMax ?? 2);

function onEditDelay(idx: number): void {
  const d = delays.value[idx];
  if (!d) return;
  editing.value = { kind: "delay", unit: d.unit, freq: d.freq, rate: d.rate, group: d.group };
  editingIdx.value = idx;
}

function onEditOverdrive(idx: number): void {
  const o = overdrives.value[idx];
  if (!o) return;
  editing.value = { kind: "overdrive", cut: o.cut, amp: o.amp, group: o.group };
  editingIdx.value = idx;
}

function commitEdit(): void {
  const f = editing.value;
  const idx = editingIdx.value;
  editing.value = null;
  editingIdx.value = -1;
  if (!f || idx < 0) return;
  if (f.kind === "delay") updateDelay(idx, f.unit, f.freq, f.rate, f.group);
  else updateOverdrive(idx, f.cut, f.amp, f.group);
}

function onAddDelay(): void {
  if (delays.value.length >= delayMax.value) return;
  addDelay(0, 0.25, 50, 0);
}

function onAddOverdrive(): void {
  if (overdrives.value.length >= overdriveMax.value) return;
  addOverdrive(0, 1, 0);
}

// 編集中のエフェクトが削除されたら編集画面も閉じる
function onRemoveDelay(idx: number): void {
  if (editing.value?.kind === "delay" && editingIdx.value === idx) editing.value = null;
  removeDelay(idx);
}

function onRemoveOverdrive(idx: number): void {
  if (editing.value?.kind === "overdrive" && editingIdx.value === idx) editing.value = null;
  removeOverdrive(idx);
}
</script>

<template>
  <PanelBox :title="t('effector.title')">
    <div class="eff-body">
      <div class="eff-section">
        <div class="eff-head">
          <span>{{ t("effector.delay") }} ({{ delays.length }}/{{ delayMax }})</span>
          <button class="btn btn-sm" :disabled="delays.length >= delayMax" @click="onAddDelay">＋</button>
        </div>
        <div v-for="d in delays" :key="'d' + d.index" class="eff-row" @dblclick="onEditDelay(d.index)">
          <span>{{ DELAY_UNITS[d.unit] ?? d.unit }}</span>
          <span>{{ d.freq.toFixed(2) }}</span>
          <span>{{ d.rate.toFixed(0) }}%</span>
          <span>G{{ d.group }}</span>
          <button class="btn btn-sm" @click="onEditDelay(d.index)">{{ t("common.edit") }}</button>
          <button class="btn btn-sm btn-danger" @click="onRemoveDelay(d.index)">✕</button>
        </div>
        <div v-if="delays.length === 0" class="eff-empty">{{ t("effector.none") }}</div>
      </div>
      <div class="eff-section">
        <div class="eff-head">
          <span>{{ t("effector.overdrive") }} ({{ overdrives.length }}/{{ overdriveMax }})</span>
          <button class="btn btn-sm" :disabled="overdrives.length >= overdriveMax" @click="onAddOverdrive">＋</button>
        </div>
        <div v-for="o in overdrives" :key="'o' + o.index" class="eff-row" @dblclick="onEditOverdrive(o.index)">
          <span>cut {{ o.cut }}%</span>
          <span>amp {{ o.amp.toFixed(2) }}</span>
          <span>G{{ o.group }}</span>
          <button class="btn btn-sm" @click="onEditOverdrive(o.index)">{{ t("common.edit") }}</button>
          <button class="btn btn-sm btn-danger" @click="onRemoveOverdrive(o.index)">✕</button>
        </div>
        <div v-if="overdrives.length === 0" class="eff-empty">{{ t("effector.none") }}</div>
      </div>
    </div>

    <div v-if="editing" class="eff-edit">
      <template v-if="editing.kind === 'delay'">
        <div class="row">
          <label>{{ t("effector.unit") }}</label>
          <select v-model.number="editing.unit">
            <option v-for="(u, i) in DELAY_UNITS" :key="u" :value="i">{{ u }}</option>
          </select>
        </div>
        <div class="row">
          <label>{{ t("effector.length") }}</label>
          <input type="number" v-model.number="editing.freq" step="0.01" min="0" />
        </div>
        <div class="row">
          <label>{{ t("effector.feedback") }}</label>
          <input type="number" v-model.number="editing.rate" min="0" max="100" />
        </div>
      </template>
      <template v-else>
        <div class="row">
          <label>{{ t("effector.cut") }}</label>
          <input type="number" v-model.number="editing.cut" min="0" max="99" />
        </div>
        <div class="row">
          <label>{{ t("effector.amp") }}</label>
          <input type="number" v-model.number="editing.amp" step="0.01" min="0" />
        </div>
      </template>
      <div class="row">
        <label>{{ t("effector.group") }}</label>
        <input type="number" v-model.number="editing.group" min="0" max="6" />
      </div>
      <div class="row">
        <button class="btn btn-accent" @click="commitEdit">OK</button>
        <button class="btn" @click="editing = null">{{ t("common.cancel") }}</button>
      </div>
    </div>
  </PanelBox>
</template>

<style scoped>
.eff-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.eff-section {
  border: 1px solid var(--border);
  padding: 3px;
}

.eff-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--foreground);
  margin-bottom: 2px;
}

.eff-row {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  padding: 1px 2px;
  color: var(--muted-foreground);
}

.eff-row:hover {
  background: var(--card);
  color: var(--card-foreground);
}

.eff-empty {
  font-size: 10px;
  color: var(--muted-foreground);
  padding: 2px;
}

.eff-edit {
  border-top: 1px solid var(--border);
  margin-top: 6px;
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
