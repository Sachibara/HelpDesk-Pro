import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const app = readFileSync(new URL("../app.js",import.meta.url),"utf8");
const cloud = readFileSync(new URL("../cloud.js",import.meta.url),"utf8");
const assetsSql = readFileSync(new URL("../supabase/migrations/20261011_asset_integrity_guard.sql",import.meta.url),"utf8");
const scanSql = readFileSync(new URL("../supabase/migrations/20261011_automation_alert_reactivation.sql",import.meta.url),"utf8");

test("Fresh Cloud Workspace has role templates without fake people or groups",()=>{
 const start=app.indexOf("  function cloudRoleTemplates() {");
 const end=app.indexOf("  let state = emptyCloudState();",start);
 assert.ok(start>=0&&end>start);
 const {cloudRoleTemplates,emptyCloudState}=runInNewContext(
   app.slice(start,end)+"\n({cloudRoleTemplates,emptyCloudState})",
   {now:()=> "2026-10-11T00:00:00Z"}
 );
 const state=emptyCloudState();
 assert.equal(state.identities.length,0);
 assert.equal(state.groups.length,0);
 assert.equal(state.endpoints.length,0);
 assert.equal(state.assets.length,0);
 assert.equal(state.incidents.length,0);
 assert.deepEqual(Array.from(state.templates,t=>t.id),["TPL-STD","TPL-IT","TPL-ADMIN"]);
 assert.ok(state.templates.every(t=>Array.isArray(t.groups)&&t.groups.length===0));
});
test("Old cloud workspaces without templates are upgraded without fabricated users",()=>{
 assert.ok(app.includes("if (!state.templates.length) state.templates = cloudRoleTemplates()"));
});
test("Asset mutation validates assignment before any state change",()=>{
 const modal=app.slice(app.indexOf("  function openAssetModal("),app.indexOf('  $("assetSearch")'));
 assert.match(modal,/selectedStatus === "Assigned" && \(!owner \|\| owner\.status !== "Active"\)/);
 assert.ok(modal.indexOf('if (selectedStatus === "Assigned"') < modal.indexOf('await commitWorkspaceChange('));
 assert.ok(modal.includes('await commitWorkspaceChange('));
});
test("Asset create and lifecycle changes are saved to Supabase before success toast",()=>{
 assert.match(app,/await window\.OpsFusionCloud\.saveWorkspace\(proposed\)/);
 const add=app.slice(app.indexOf('  $("addAssetBtn")'),app.indexOf('  $("addMaintenanceTaskBtn")'));
 assert.match(add,/await commitWorkspaceChange/);
 assert.ok(add.indexOf("await commitWorkspaceChange")<add.indexOf('toast("Asset added"'));
});
test("Maintenance schedule and completion survive only after successful cloud saves",()=>{
 const begin=app.indexOf('  $("addMaintenanceTaskBtn")');
 const end=app.indexOf('  function renderIdentity()',begin);
 assert.match(app,/\[data-maint-complete\]/);
 const create=app.slice(begin,end);
 assert.ok(create.includes('await commitWorkspaceChange('));
 assert.ok(create.indexOf('await commitWorkspaceChange(')<create.indexOf('toast("Maintenance scheduled"'));
});
test("Identity record creation is transparently record-only and has templates",()=>{
 const source=app.slice(app.indexOf('  $("provisionUserBtn")'),app.indexOf('  function renderTroubleshooting()'));
 assert.ok(source.includes("Add Identity Record (workspace only)"));
 assert.ok(source.includes('await commitWorkspaceChange('));
 assert.ok(source.includes("Link a confirmed portal account in Settings."));
  assert.ok(source.includes('username:"",upn:""'));
  assert.ok(!source.includes('username+"@corp.local"'));
});
test("Server asset integrity trigger enforces duplicate tags and links",()=>{
 assert.match(assetsSql,/CREATE TRIGGER opsfusion_enforce_asset_integrity/);
 assert.match(assetsSql,/seen_tags \? lower\(tag\)/);
 assert.match(assetsSql,/requires a valid active identity record/);
 assert.match(assetsSql,/links to missing endpoint/);
 assert.match(assetsSql,/links to missing asset/);
});
test("Recurring automation alerts reopen, acknowledged alerts clear when resolved",()=>{
 assert.match(scanSql,/prior_status='cleared' THEN 'open'/);
 assert.match(scanSql,/status <> 'cleared' AND NOT/);
 assert.match(scanSql,/IF prior_status='cleared' THEN new_rows := new_rows \+ 1/);
});
test("Auth uses Supabase sessions and no browser-side service role key",()=>{
 assert.ok(cloud.includes('client.auth.signUp('));
 assert.ok(cloud.includes('client.auth.signInWithPassword('));
 assert.doesNotMatch(cloud,/service_role|sb_secret_/i);
});

