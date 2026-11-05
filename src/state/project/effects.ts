// エフェクト (Delay / Overdrive)
import { service } from "../service";
import { mutate } from "./core";

export function addDelay(unit: number, freq: number, rate: number, group: number): void {
  mutate(() => {
    service.delayAdd(unit, freq, rate, group);
  });
}

export function removeDelay(idx: number): void {
  mutate(() => {
    service.delayRemove(idx);
  });
}

export function updateDelay(idx: number, unit: number, freq: number, rate: number, group: number): void {
  mutate(() => {
    service.delaySet(idx, unit, freq, rate, group);
  });
}

export function addOverdrive(cut: number, amp: number, group: number): void {
  mutate(() => {
    service.overdriveAdd(cut, amp, group);
  });
}

export function removeOverdrive(idx: number): void {
  mutate(() => {
    service.overdriveRemove(idx);
  });
}

export function updateOverdrive(idx: number, cut: number, amp: number, group: number): void {
  mutate(() => {
    service.overdriveSet(idx, cut, amp, group);
  });
}
