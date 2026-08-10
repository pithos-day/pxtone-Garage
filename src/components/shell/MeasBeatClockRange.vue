// 小節:拍:クロックの3入力フィールド (v-model:meas / v-model:beat / v-model:clock)
<script setup lang="ts">
import { getService } from "../../state/project";
import { t } from "../../i18n";

const meas = defineModel<number>("meas", { required: true });
const beat = defineModel<number>("beat", { required: true });
const clock = defineModel<number>("clock", { required: true });

const beatClock = (): number => getService()?.master.beatClock ?? 480;
const beatNum = (): number => getService()?.master.beatNum ?? 4;
</script>

<template>
  <label>{{ t("copymeas.meas") }}</label>
  <input v-model.number="meas" type="number" min="1" />
  <label>{{ t("copymeas.beat") }}</label>
  <input v-model.number="beat" type="number" min="1" :max="beatNum()" />
  <label>{{ t("copymeas.clock") }}</label>
  <input v-model.number="clock" type="number" min="0" :max="beatClock() - 1" />
</template>
