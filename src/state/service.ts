// アプリ全体で共有する権威 Service インスタンス (編集の正本)
import { Service, PxtnErr, PXTN_MAX_EVENT_NUM } from "pxtone-ts";

// ptcop ヘッダの exe_ver (本家 0.9.4.56 相当の値)
export const EXE_VER = 0x9456;

export const service = new Service();
export let serviceReady = false;

export function ensureService(): boolean {
  if (serviceReady) return true;
  if (service.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) return false;
  serviceReady = true;
  return true;
}
