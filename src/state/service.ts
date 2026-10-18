// 現在のプロジェクトが共有する権威 Service インスタンス (編集の正本)。
// 複数プロジェクト対応のため、タブ切替で差し替えられる (export let)。
import { Service, PxtnErr, PXTN_MAX_EVENT_NUM } from "pxtone-ts";

// ptcop ヘッダの exe_ver。
// 本家は GetCompileVersion = v1*1000 + v2*100 + v3*10 + v4 の値を uint16 で書くため、
// ptCollage 0.9.4.56 (FILEVERSION 0,9,4,56) は 0*1000 + 9*100 + 4*10 + 56 = 996 (0x03E4)
export const EXE_VER = 996;

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
