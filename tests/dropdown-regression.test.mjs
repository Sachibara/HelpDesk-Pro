import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const app = readFileSync(new URL("../app.js",import.meta.url),"utf8");
const html = readFileSync(new URL("../index.html",import.meta.url),"utf8");
const cloud = readFileSync(new URL("../cloud.js",import.meta.url),"utf8");

function pickFunctions(names, context) {
  const functions=names.map((name)=>{
    const rx=new RegExp("\\n  function "+name+"\\([^]*?\\n  \\}");
    const hit=app.match(rx);
    assert.ok(hit,"Missing function "+name);
    return hit[0];
  });
  return runInNewContext(functions.join("\n")+"\n({"+names.join(",")+"})",context);
}

test("Cloud role templates always offer three selectable defaults on existing empty workspaces",()=>{
  const state={templates:[],identities:[],technicians:[]};
  const out=pickFunctions(["cloudRoleTemplates","availableRoleTemplates","templateById"],
    {state,demoMode:false});
  assert.deepEqual(Array.from(out.availableRoleTemplates(),x=>x.id),["TPL-STD","TPL-IT","TPL-ADMIN"]);
  assert.equal(out.templateById("TPL-IT").department,"IT");
  assert.equal(out.templateById("unknown"),null);
});
test("Cloud role choices preserve valid customized templates and normalize missing groups",()=>{
  const state={templates:[{id:"TPL-IT",name:"Custom IT Support",department:"IT"},
    {id:"TPL-CUSTOM",name:"Network Operator",department:"Network"}]};
  const out=pickFunctions(["cloudRoleTemplates","availableRoleTemplates","templateById"],{state,demoMode:false});
  assert.equal(out.availableRoleTemplates().length,4);
  assert.equal(out.templateById("TPL-IT").name,"Custom IT Support");
  assert.deepEqual(Array.from(out.templateById("TPL-CUSTOM").groups),[]);
});
test("Portfolio Demo uses its own templates only, not cloud defaults",()=>{
  const state={templates:[{id:"DEMO-ONLY",name:"Demo role",department:"Test",groups:[]}]};
  const out=pickFunctions(["cloudRoleTemplates","availableRoleTemplates","templateById"],{state,demoMode:true});
  assert.deepEqual(Array.from(out.availableRoleTemplates(),x=>x.id),["DEMO-ONLY"]);
});
test("Available technician options derive from active real IT identities only",()=>{
  const state={templates:[],technicians:[],identities:[
    {id:"U1",displayName:"IT Technician",title:"IT Support Technician",status:"Active",templateId:"TPL-IT",department:"IT"},
    {id:"U2",displayName:"Finance Employee",status:"Active",templateId:"TPL-STD",department:"General"},
    {id:"U3",displayName:"Former IT",status:"Offboarded",templateId:"TPL-IT",department:"IT"}
  ]};
  const out=pickFunctions(["cloudRoleTemplates","availableRoleTemplates","templateById","availableTechnicians","technicianById"],{state,demoMode:false});
  assert.deepEqual(Array.from(out.availableTechnicians(),x=>x.id),["U1"]);
  assert.equal(out.technicianById("U1").name,"IT Technician");
  assert.equal(out.technicianById("U2"),null);
});
test("Filter options preserve a selection when still available",()=>{
  const node={value:"Assigned",innerHTML:""};
  const {setFilterOptions}=pickFunctions(["setFilterOptions"],{esc:x=>String(x)});
  setFilterOptions(node,"All states",["Available","Assigned","Available"]);
  assert.equal(node.value,"Assigned");
  assert.equal((node.innerHTML.match(/value="Available"/g)||[]).length,1);
});
test("Filter options reset obsolete selections and escape record values",()=>{
  const node={value:"Retired",innerHTML:""};
  const escape=x=>String(x).replaceAll("&","&amp;").replaceAll("<","&lt;");
  const {setFilterOptions}=pickFunctions(["setFilterOptions"],{esc:escape});
  setFilterOptions(node,"All",["Assigned","bad <record>"]);
  assert.equal(node.value,"");
  assert.ok(node.innerHTML.includes("bad &lt;record>"));
});
test("Endpoint select preserves the actual user's choice when rendering another page",()=>{
  const state={endpoints:[
    {id:"EP-A",hostname:"A",ip:"10.0.0.1"},
    {id:"EP-B",hostname:"B",ip:"10.0.0.2"}
  ]};
  const {fillEndpointSelect}=pickFunctions(["fillEndpointSelect"],{state,currentEndpointId:"EP-A",esc:x=>String(x)});
  const node={value:"EP-B",innerHTML:"",disabled:false};
  fillEndpointSelect(node,null,true);
  assert.equal(node.value,"EP-B");
  assert.equal(node.disabled,false);
});
test("Empty endpoint dropdown presents useful fallback and disables invalid selection",()=>{
  const state={endpoints:[]};
  const {fillEndpointSelect}=pickFunctions(["fillEndpointSelect"],{state,currentEndpointId:null,esc:x=>String(x)});
  const node={value:"",innerHTML:"",disabled:false};
  fillEndpointSelect(node,null,true);
  assert.equal(node.disabled,true);
  assert.match(node.innerHTML,/No endpoints/);
});
test("Role Template selector is explicit, interactive, validated and persisted",()=>{
  assert.ok(app.includes('id="mIdTemplate" required'));
  assert.ok(app.includes('availableRoleTemplates().map('));
  assert.ok(app.includes('key === "mIdTemplate" ? "change" : "input"'));
  assert.ok(app.includes("draft.templates = availableRoleTemplates().map"));
});
test("Asset lifecycle dropdown responds to status and limits assignment to active identities",()=>{
  assert.ok(app.includes('$("mAssetStatus").addEventListener("change", updateAssignment)'));
  assert.ok(app.includes('$("mAssetUser").disabled = !assigning || !hasActive'));
  assert.ok(app.includes("Choose an active identity"));
});
test("Ticket assignee dropdown is backed by active workspace IT roles",()=>{
  assert.ok(app.includes("availableTechnicians().map((t)"));
  assert.ok(app.includes("availableTechnicians().map((tech)"));
});
test("Switch and endpoint mapping dropdowns report missing prerequisites",()=>{
  assert.ok(app.includes("No switches — add a Switch endpoint first"));
  assert.ok(app.includes("No endpoints — add an endpoint first"));
  assert.ok(app.includes('$("mPortSwitch").disabled = !switches.length'));
  assert.ok(app.includes('$("mPortEndpoint").disabled = !state.endpoints.length'));
});
test("Ticket status dropdown confirms cloud save and rolls back on rejection",()=>{
  assert.ok(app.includes('qsa("[data-incident-status]").forEach((select)=>select.onchange=async()=>'));
  assert.ok(app.includes('await commitWorkspaceChange((draft)=>'));
  assert.ok(app.includes('select.value=previous;select.disabled=false'));
});
test("Cloud endpoint agent dropdown cannot claim online status without an agent",()=>{
  assert.ok(app.includes('(demoMode?\'<option value="online">Online (demo)</option>'));
  assert.ok(app.includes('Not connected — requires an authorized endpoint agent'));
  assert.ok(html.includes('<option value="unverified">Unverified / Agent Not Connected</option>'));
});
test("All known static data filters and dynamic workflow selectors remain present",()=>{
  for(const id of ["endpointSiteFilter","endpointStateFilter","assetStatusFilter","assetTypeFilter",
    "identityStatusFilter","identityDepartmentFilter","diagEndpoint","remoteEndpoint",
    "ticketStatusFilter","ticketPriorityFilter","auditModuleFilter"]) {
    assert.ok(html.includes('id="'+id+'"'),"Missing static select "+id);
  }
  for(const id of ["mType","mAgent","mAssetStatus","mAssetUser","mAssetType","mAssetEndpoint",
    "mMaintAsset","mMaintType","mIdTemplate","mService","mPortSwitch","mPortEndpoint",
    "mTicketType","mTicketCategory","mTicketRequester","mTicketAsset","mTicketImpact",
    "mTicketUrgency","mTicketAssignee","mIncidentSource"]) {
    assert.ok(app.includes('id="'+id+'"'),"Missing dynamic select "+id);
  }
});
test("Dropdown scripts do not contain secret Supabase credentials",()=>{
  assert.doesNotMatch(cloud,/service_role|sb_secret_/i);
});

