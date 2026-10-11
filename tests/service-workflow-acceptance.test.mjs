import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function isolateFunction(first, next, inject) {
  const start = app.indexOf("  function " + first + "(");
  const end = app.indexOf("\n  " + next, start);
  assert.ok(start >= 0 && end > start, "Function boundaries missing for " + first);
  return runInNewContext(app.slice(start,end)+"\n({"+first+"})",inject)[first];
}
const clock=()=> "2026-10-12T01:00:00.000Z";
const basicDraft=()=>({
 assets:[{id:"AST-01",tag:"AST-01",endpointId:"EP-01",assignedUserId:"USER-01",status:"Assigned"}],
 endpoints:[{id:"EP-01",owner:"Alex Demo"}],
 identities:[{id:"USER-01",displayName:"Alex Demo",department:"IT",templateId:"TPL-IT",status:"Active"}],
 technicians:[],templates:[{id:"TPL-IT",department:"IT"}],
 incidents:[{id:"INC-1001"}]
});
const makeTicket=()=>isolateFunction("buildTicketForDraft","async function commitNewTicket",{
 now:clock,SLA:{P1:{response:1,resolution:2},P2:{response:2,resolution:8},P3:{response:4,resolution:24},P4:{response:8,resolution:72}},
 priorityFromImpactUrgency:(impact,urgency)=>impact==="High"&&urgency==="High"?"P1":"P3",
 addHours:(date,hours)=>new Date(Date.parse(date)+hours*3600000).toISOString(),
 normalizeTicket:(ticket)=>ticket
});
test("Ticket builder generates an unused, sequential ID and correct SLA deadlines",()=>{
  const draft=basicDraft();
  const result=makeTicket()(draft,{title:"Laptop cannot print",assetId:"AST-01",
    requesterId:"USER-01",assigneeId:"USER-01",impact:"Medium",urgency:"Medium"});
  assert.equal(result.id,"INC-1002");
  assert.equal(result.endpointId,"EP-01");
  assert.equal(result.requesterId,"USER-01");
  assert.equal(result.assigneeId,"USER-01");
  assert.equal(result.responseDue,"2026-10-12T05:00:00.000Z");
  assert.equal(result.resolutionDue,"2026-10-13T01:00:00.000Z");
  assert.equal(draft.incidents.length,1,"Must not mutate draft before commit");
});
test("Ticket builder accepts unassigned tickets and non-asset service requests",()=>{
  const result=makeTicket()(basicDraft(),{type:"Service Request",title:"Reset identity review"});
  assert.equal(result.assetId,"");
  assert.equal(result.assigneeId,"");
});
test("Ticket builder rejects nonexistent linked assets",()=>{
  assert.throws(()=>makeTicket()(basicDraft(),{title:"Test",assetId:"AST-NOT-FOUND"}),/asset is no longer available/);
});
test("Ticket builder rejects inactive requesters and nonexistent technicians",()=>{
  const draft=basicDraft();
  draft.identities[0].status="Disabled";
  assert.throws(()=>makeTicket()(draft,{title:"Test",requesterId:"USER-01"}),/active requester/);
  assert.throws(()=>makeTicket()(draft,{title:"Test",assigneeId:"USER-01"}),/active technician/);
});
test("Ticket builder rejects non-IT assignee records",()=>{
  const draft=basicDraft();
  draft.identities[0].department="Finance";
  draft.identities[0].templateId="TPL-OTHER";
  assert.throws(()=>makeTicket()(draft,{title:"Test",assigneeId:"USER-01"}),/active technician/);
});
test("Disabling an identity releases linked assets without affecting unrelated endpoints",()=>{
  const release=isolateFunction("releaseIdentityAssets","function openIdentityModal",{});
  const draft=basicDraft();
  draft.assets.push({id:"AST-02",assignedUserId:"",status:"Available"});
  draft.endpoints.push({id:"EP-02",owner:"Other"});
  assert.equal(release(draft,"USER-01"),1);
  assert.equal(draft.assets[0].assignedUserId,"");
  assert.equal(draft.assets[0].status,"Available");
  assert.equal(draft.endpoints[0].owner,"Unassigned");
  assert.equal(draft.endpoints[1].owner,"Other");
  assert.equal(release(draft,"USER-01"),0);
});
test("Identity creation and onboarding ticket are in the same cloud transaction",()=>{
  const start=app.indexOf('  $("provisionUserBtn").addEventListener');
  const end=app.indexOf("  function renderTroubleshooting()",start);
  const form=app.slice(start,end);
  assert.match(form,/await commitWorkspaceChange\(\(draft\) => \{/);
  assert.match(form,/draft\.identities\.push\(user\)/);
  assert.match(form,/const review=buildTicketForDraft\(draft,/);
  assert.match(form,/draft\.incidents\.unshift\(review\)/);
  assert.ok(form.indexOf("draft.incidents.unshift(review)") < form.indexOf('audit("Identity","Identity record created"'));
});
test("Offboarding updates identity, asset releases, and return ticket atomically",()=>{
  const src=app.slice(app.indexOf("  async function offboardIdentity("),app.indexOf('  $("identitySearch")'));
  assert.match(src,/await commitWorkspaceChange\(\(draft\)=>\{/);
  assert.match(src,/released=releaseIdentityAssets\(draft,user\.id\)/);
  assert.match(src,/record\.status="Offboarded"/);
  assert.match(src,/const ticket=buildTicketForDraft\(draft,/);
  assert.match(src,/draft\.incidents\.unshift\(ticket\)/);
});
test("Cloud Service Desk actions confirm the database save before success",()=>{
  const form=app.slice(app.indexOf('  $("newIncidentBtn")'),app.indexOf("  function renderAuditEntries("));
  const record=app.slice(app.indexOf("  function openTicketModal("),app.indexOf("  function renderIncidents("));
  assert.match(form,/await commitNewTicket\(input\)/);
  assert.match(record,/First response not saved/);
  assert.match(record,/Work note not saved/);
  assert.match(record,/await commitWorkspaceChange/);
});
test("Viewers cannot invoke secondary record-changing buttons",()=>{
  const access=app.slice(app.indexOf("  function applyRoleAccess()"),app.indexOf("  function updateModeUI("));
  assert.match(access,/qsa\("#modalBody button"\)/);
  assert.match(access,/if \(readOnly && !\["mCancel","mKbClose"\]\.includes\(el\.id\)\)/);
});
test("Workspace identity actions do not impersonate Supabase account administration",()=>{
  const controls=app.slice(app.indexOf("  function openIdentityModal("),app.indexOf('  $("identitySearch")'));
  assert.match(controls,/Flag Credential Review/);
  assert.match(controls,/Workspace Identity/);
  assert.match(controls,/do not disable a Supabase Auth account/);
});
