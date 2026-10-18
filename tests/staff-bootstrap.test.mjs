import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../cloud.js',import.meta.url),'utf8');
function fixture(workspaces=[],memberRole='technician',intent=false){
 const writes=[];const user={id:'staff',email:'staff@example.test',user_metadata:{create_workspace:true},app_metadata:{opsfusion_owner_signup:intent}};
 const client={rpc:async(name)=>{assert.equal(name,'opsfusion_create_workspace');return {data:workspace('new','staff')};},auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}}),onAuthStateChange(){}},from(table){let method='select';const chain={select(){return chain;},eq(){return chain;},order(){return chain;},limit(){return chain;},update(value){method='update';writes.push({table,method,value});return chain;},insert(value){method='insert';writes.push({table,method,value});return chain;},maybeSingle(){return Promise.resolve({data:table==='opsfusion_profiles'?{user_id:user.id}:{role:memberRole}});},then(resolve,reject){return Promise.resolve({data:table==='opsfusion_workspaces'?workspaces:table==='opsfusion_audit_events'?[{id:'event',actor_id:'staff',module:'Service Desk',action:'Updated'}]:null}).then(resolve,reject);}};return chain;}};
 const window={supabase:{createClient:()=>client},location:{hash:''}};runInNewContext(source,{window,console});return {api:window.OpsFusionCloud,writes};
}
const workspace=(id,owner_id='owner')=>({id,owner_id,name:id,state:{incidents:[]},updated_at:'2026-10-17T12:00:00Z'});
test('Portal account cannot bootstrap even with forged owner signup user metadata',async()=>{const f=fixture();await f.api.init();await assert.rejects(f.api.bootstrap({}),/not authorized/);assert.equal(f.writes.filter(w=>w.table==='opsfusion_workspaces'||w.table==='opsfusion_memberships').length,0);assert.equal(f.api.isCloudActive(),false);});
test('Technician loads existing shared workspace with individual audit identity',async()=>{const f=fixture([workspace('shared')]);await f.api.init();const r=await f.api.bootstrap({});assert.equal(r.workspaceId,'shared');assert.equal(r.role,'technician');assert.equal(r.audit[0].actorId,'staff');assert.equal(f.api.isWorkspaceOwner(),false);});
test('Authorized workspace selection is explicit and unknown IDs are rejected',async()=>{const f=fixture([workspace('first'),workspace('second')]);await f.api.init();const r=await f.api.bootstrap({},'', 'second');assert.equal(r.workspaceId,'second');assert.equal(r.workspaces.length,2);await assert.rejects(f.api.bootstrap({},'', 'foreign'),/not authorized/);assert.equal(f.api.getWorkspaceId(),'second');});
test('Viewer membership loads read-only role; ownership retains administrator role',async()=>{const f=fixture([workspace('shared')],'viewer');await f.api.init();assert.equal((await f.api.bootstrap({})).role,'viewer');const owner=fixture([workspace('owned','staff')],'viewer');await owner.api.init();assert.equal((await owner.api.bootstrap({})).role,'admin');assert.equal(owner.api.isWorkspaceOwner(),true);});

test('Explicit owner signup creates an independent workspace; member login does not',async()=>{const f=fixture([],'technician',true);await f.api.init();assert.equal((await f.api.bootstrap({})).workspaceId,'new');assert.equal(f.api.isWorkspaceOwner(),true);});
