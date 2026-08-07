// 現在のプロジェクトが共有する権威 Service インスタンス (編集の正本)。
// 複数プロジェクト対応のため、タブ切替で差し替えられる (export let)。
import { Service, PxtnErr, PXTN_MAX_EVENT_NUM } from "pxtone-ts";

// ptcop ヘッダの exe_ver (本家 0.9.4.56 相当の値)
export const EXE_VER = 0x9456;

export let service = new Service();
export let serviceReady = false;

export function setService(s: Service): void {
  service = s;
  serviceReady = true;
}

export function ensureService(): boolean {
  if (serviceReady) return true;
  if (service.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) return false;
  serviceReady = true;
  return true;
}
