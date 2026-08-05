// エフェクトパネル (Delay / OverDrive) — フローティング
<script setup lang="ts">
import { ref } from "vue";
import PanelBox from "./PanelBox.vue";
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

const editing = ref<{ kind: "delay" | "overdrive"; idx: number } | null>(null);
const form = ref({ unit: 0, freq: 0.25, rate: 50, group: 0, cut: 0, amp: 1 });

const DELAY_UNITS = ["BEAT", "MEAS", "SECOND"];

function onEditDelay(idx: number): void {
  const d = delays.value[idx];
  if (!d) return;
  form.value = { unit: d.unit, freq: d.freq, rate: d.rate, group: d.group, cut: 0, amp: 1 };
  editing.value = { kind: "delay", idx };
}

function onEditOverdrive(idx: number): void {
  const o = overdrives.value[idx];
  if (!o) return;
  form.value = { unit: 0, freq: 0, rate: 0, group: o.group, cut: o.cut, amp: o.amp };
  editing.value = { kind: "overdrive", idx };
}

function commitEdit(): void {
  const ed = editing.value;
  editing.value = null;
  if (!ed) return;
  if (ed.kind === "delay") updateDelay(ed.idx, form.value.unit, form.value.freq, form.value.rate, form.value.group);
  else updateOverdrive(ed.idx, form.value.cut, form.value.amp, form.value.group);
}

function onAddDelay(): void {
  addDelay(0, 0.25, 50, 0);
}

function onAddOverdrive(): void {
  addOverdrive(0, 1, 0);
}
</script>

<template>
  <PanelBox title="Effector">
    <div class="eff-body">
      <div class="eff-section">
        <div class="eff-head">
          <span>Delay ({{ delays.length }})</span>
          <button class="btn btn-sm" @click="onAddDelay">＋</button>
        </div>
        <div v-for="d in delays" :key="'d' + d.index" class="eff-row" @dblclick="onEditDelay(d.index)">
          <span>{{ DELAY_UNITS[d.unit] ?? d.unit }}</span>
          <span>{{ d.freq.toFixed(2) }}</span>
          <span>{{ d.rate.toFixed(0) }}%</span>
          <span>G{{ d.group }}</span>
          <button class="btn btn-sm" @click="onEditDelay(d.index)">編集</button>
          <button class="btn btn-sm btn-danger" @click="removeDelay(d.index)">✕</button>
        </div>
        <div v-if="delays.length === 0" class="eff-empty">なし</div>
      </div>
      <div class="eff-section">
        <div class="eff-head">
          <span>OverDrive ({{ overdrives.length }})</span>
          <button class="btn btn-sm" @click="onAddOverdrive">＋</button>
        </div>
        <div v-for="o in overdrives" :key="'o' + o.index" class="eff-row" @dblclick="onEditOverdrive(o.index)">
          <span>cut {{ o.cut }}%</span>
          <span>amp {{ o.amp.toFixed(2) }}</span>
          <span>G{{ o.group }}</span>
          <button class="btn btn-sm" @click="onEditOverdrive(o.index)">編集</button>
          <button class="btn btn-sm btn-danger" @click="removeOverdrive(o.index)">✕</button>
        </div>
        <div v-if="overdrives.length === 0" class="eff-empty">なし</div>
      </div>
    </div>

    <div v-if="editing" class="eff-edit">
      <template v-if="editing.kind === 'delay'">
        <div class="row">
          <label>単位</label>
          <select v-model.number="form.unit">
            <option v-for="(u, i) in DELAY_UNITS" :key="u" :value="i">{{ u }}</option>
          </select>
        </div>
        <div class="row">
          <label>長さ</label>
          <input type="number" v-model.number="form.freq" step="0.01" min="0" />
        </div>
        <div class="row">
          <label>FB%</label>
          <input type="number" v-model.number="form.rate" min="0" max="100" />
        </div>
      </template>
      <template v-else>
        <div class="row">
          <label>Cut%</label>
          <input type="number" v-model.number="form.cut" min="0" max="99" />
        </div>
        <div class="row">
          <label>Amp</label>
          <input type="number" v-model.number="form.amp" step="0.01" min="0" />
        </div>
      </template>
      <div class="row">
        <label>Group</label>
        <input type="number" v-model.number="form.group" min="0" max="6" />
      </div>
      <div class="row">
        <button class="btn btn-accent" @click="commitEdit">OK</button>
        <button class="btn" @click="editing = null">キャンセル</button>
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
  color: var(--text-bright);
  margin-bottom: 2px;
}

.eff-row {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  padding: 1px 2px;
  color: var(--text);
}

.eff-row:hover {
  background: var(--panel-light);
}

.eff-empty {
  font-size: 10px;
  color: var(--text-dim);
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
