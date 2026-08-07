// 複数プロジェクト管理のスモークテスト (node で直接実行)
import {
  projects,
  currentProjectId,
  newProjectInTab,
  switchProject,
  closeProject,
  openProjectInTab,
} from "../src/state/projects";
import { doc, units, addUnit, setTempo, exportBytes, ensureInit } from "../src/state/project";
import * as serviceMod from "../src/state/service";
import { undo, redo, canUndo, canRedo } from "../src/state/undo";

let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name} ${detail}`);
  }
}

// ---- 1. 初期プロジェクト ----
newProjectInTab();
check("初期プロジェクトが1つ", projects.value.length === 1);
check("currentProjectId が最初のタブ", currentProjectId.value === projects.value[0]!.id);
check("doc.ready", doc.ready === true);

// ---- 2. 編集 + タブ間の独立 ----
addUnit("A");
check("ユニット追加で units=1", units.value.length === 1, `len=${units.value.length}`);
setTempo(180);
check("テンポ変更", exportBytes() !== null);
const p1Id = currentProjectId.value;
const savedScroll = 12345;
doc.scrollX = savedScroll;
check("undo が積まれる", canUndo.value === true);

const p2 = newProjectInTab();
check("2タブ目が開く", projects.value.length === 2);
check("2タブ目はユニット0個", units.value.length === 0, `len=${units.value.length}`);
check("2タブ目は undo 空", canUndo.value === false && canRedo.value === false);
check("2タブ目 scrollX リセット", doc.scrollX === 0);

// ---- 3. タブ切替で状態が復元される ----
switchProject(p1Id);
check("1タブ目へ切替: units=1", units.value.length === 1);
check("1タブ目 scrollX 復元", doc.scrollX === savedScroll, `scrollX=${doc.scrollX}`);
check("1タブ目 undo 復元", canUndo.value === true);

// ---- 4. タブごとの undo 独立 ----
undo(); // setTempo を戻す → 1 unit
check("1タブ目 undo#1 → units=1", units.value.length === 1, `len=${units.value.length}`);
undo(); // addUnit を戻す → 0 unit
check("1タブ目 undo#2 → units=0", units.value.length === 0, `len=${units.value.length}`);
check("1タブ目 redo が積まれる", canRedo.value === true);
redo();
check("1タブ目 redo → units=1", units.value.length === 1);
switchProject(p2.id);
check("2タブ目 undo は空のまま", canUndo.value === false, `canUndo=${canUndo.value}`);
switchProject(p1Id);
check("1タブ目 undo/redo 復元", canUndo.value === true && canRedo.value === true);

// ---- 5. タブ1に追加 → タブ2はそのまま ----
addUnit("B");
check("1タブ目 units=2 (A,B)", units.value.length === 2, `len=${units.value.length}`);
const bytes = exportBytes();
check("bytes 取得", bytes !== null);
switchProject(p2.id);
check("2タブ目 units=0 のまま", units.value.length === 0);

// ---- 6. openProjectInTab ----
const p3err = openProjectInTab(bytes!, "my-song");
check("open で新タブ (エラーなし)", p3err === null, `err=${p3err}`);
const p3Id = currentProjectId.value;
check("3タブ目に2ユニット復元", units.value.length === 2, `len=${units.value.length}`);
check("タブ名がファイル名になる", doc.fileName === "my-song", `fileName=${doc.fileName}`);
check(
  "タブ表示用の名前も設定される",
  projects.value.find((p) => p.id === p3Id)?.fileName === "my-song",
);
check("テンポ復元 (120)", serviceMod.service.master.beatTempo === 120, `tempo=${serviceMod.service.master.beatTempo}`);
check("タブ数 3", projects.value.length === 3);

// ---- 7. タブごとの undo 独立 (追加分) ----
switchProject(p1Id);
check("1タブ目 units=2 に戻る", units.value.length === 2, `len=${units.value.length}`);
addUnit("C");
check("1タブ目 units=3 (A,B,C)", units.value.length === 3, `len=${units.value.length}`);
undo();
check("1タブ目 undo → units=2", units.value.length === 2);
switchProject(p2.id);
check("2タブ目 undo は空のまま", canUndo.value === false);
switchProject(p1Id);
check("1タブ目 undo 復元 (true)", canUndo.value === true);

// ---- 8. closeProject ----
closeProject(p3Id);
check("閉じると 2タブ", projects.value.length === 2);
check("非アクティブを閉じても現在タブは p1", currentProjectId.value === p1Id);
check("最後の1つは閉じられない", (() => {
  for (let i = 0; i < 10; i++) closeProject(projects.value[0]!.id);
  return projects.value.length === 1;
})());
check("残ったタブは 1つ (p2)", currentProjectId.value === p2.id);
check("p2 は units=0", units.value.length === 0);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
