import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url),"utf8");
const app = readFileSync(new URL("../app.js", import.meta.url),"utf8");
const cloud = readFileSync(new URL("../cloud.js", import.meta.url),"utf8");
const ui = readFileSync(new URL("../automation.js", import.meta.url),"utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261011_cloud_automation.sql", import.meta.url),"utf8");
const scheduler = readFileSync(new URL("../supabase/migrations/20261011_cloud_automation_schedule.sql", import.meta.url),"utf8");
const patchedScanner = readFileSync(new URL("../supabase/migrations/20261011_cloud_automation_fix.sql", import.meta.url),"utf8");

test("Automation Center has a navigation entry and matching section",()=>{
  assert.match(html,/data-page="automation"/);
  assert.match(html,/data-panel="automation"/);
  assert.match(app,/automation: \["Cloud workflow engine", "Automation Center"\]/);
});
test("Every automation UI element queried by ID exists in HTML",()=>{
  const ids=new Set(Array.from(html.matchAll(/id="([^"]+)"/g),match=>match[1]));
  const references=Array.from(ui.matchAll(/\$\("([^"]+)"\)/g),match=>match[1]);
  for(const id of references)assert.ok(ids.has(id), "Missing HTML element "+id);
});
test("Automations do not generate local simulated telemetry",()=>{
  assert.match(ui,/Cloud Workspace/);
  assert.match(ui,/loadAutomations\(\)/);
  assert.match(ui,/runAutomations\(\)/);
  assert.doesNotMatch(ui,/Math\.random\(/);
});
test("Manual automation scan saves pending workspace changes first",()=>{
  assert.match(ui,/await window\.OpsFusionFlushSaves\(\)/);
  assert.match(app,/window\.OpsFusionFlushSaves = async/);
});
test("Settings UI snapshots before the render loop",()=>{
  assert.match(ui,/const input=\{/);
  assert.match(ui,/await cloud\(\)\.saveAutomationRules\(input\)/);
});
test("Cloud automation uses authenticated workspace-scoped queries",()=>{
  assert.match(cloud,/\.rpc\("opsfusion_run_automations"/);
  assert.match(cloud,/\.eq\("workspace_id",workspaceId\)/);
  assert.match(cloud,/workspaceOwnerId !== session\.user\.id/);
});
test("Maintenance tasks can be created and completed via Assets",()=>{
  assert.match(html,/id="addMaintenanceTaskBtn"/);
  assert.match(app,/Maintenance scheduled/);
  assert.match(app,/Maintenance completed/);
  assert.match(app,/data-maint-complete/);
  assert.match(app,/!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(dueDate\)/);
});
test("Database enforces RLS and retains settings independently",()=>{
  for(const table of ["opsfusion_automation_settings","opsfusion_automation_alerts","opsfusion_automation_runs"]) {
    assert.ok(migration.includes("ALTER TABLE public."+table+" ENABLE ROW LEVEL SECURITY"));
  }
  assert.match(migration,/GRANT UPDATE\(status\)/);
});
test("Scheduled scans do not overwrite workspace JSON",()=>{
  assert.match(migration,/CREATE FUNCTION opsfusion_private\.scan_workspace/);
  assert.doesNotMatch(patchedScanner,/UPDATE public\.opsfusion_workspaces/);
  assert.match(scheduler,/0 \* \* \* \*/);
});
test("Fix covers JSON operator precedence and UTC date comparisons",()=>{
  assert.match(patchedScanner,/\|\|\(x->>'id'\)/);
  assert.doesNotMatch(patchedScanner,/pg_catalog\.current_date/);
});

test("Automation rule editing requires the actual workspace owner",()=>{
  assert.match(cloud,/function isWorkspaceOwner\(\)/);
  assert.match(ui,/cloud\(\)\?\.isWorkspaceOwner\?\.\(\) === true/);
});
test("Separate Portfolio Demo cannot submit cloud audit records",()=>{
  assert.match(app,/if \(!demoMode && window\.OpsFusionCloud\?\.isCloudActive\?\.\(\) && cloudRole !== "viewer"\)/);
});
