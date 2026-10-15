import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('Public entry opens the employee portal without a workspace bootstrap or demo handler',()=>{
 assert.match(html,/<a[^>]*id="employeePortalBtn"[^>]*href="\/employee"[^>]*>Employee Support Portal<\/a>/);
 assert.doesNotMatch(html+app,/continueDemoBtn|demoMode|seedState|loadState|Launch Portfolio Demo/);
 assert.equal(existsSync(new URL('../demo-data.js',import.meta.url)),false);
});
test('Workspace commits reject unauthenticated and viewer access without invoking the builder or saving',async()=>{
 const from=app.indexOf('  async function commitWorkspaceChange('),to=app.indexOf('\n  function esc(',from);
 for(const [active,role] of [[false,'signed-out'],[true,'viewer']]){
  let saves=0,built=false;
  const commit=runInNewContext(app.slice(from,to)+'\ncommitWorkspaceChange',{
   workspaceSessionEpoch:0,workspaceCommitQueue:Promise.resolve(),cloudRole:role,
   window:{OpsFusionCloud:{isCloudActive:()=>active,getWorkspaceId:()=> 'workspace-a',saveWorkspace:async()=>{saves++;}}}
  });
  await assert.rejects(commit(()=>{built=true;}),/editor cloud session is required/);
  assert.equal(saves,0);assert.equal(built,false);
 }
});
test('Browser DOM bindings still resolve after demo controls are removed',()=>{
 const defined=new Set([... (html+'\n'+app).matchAll(/id="([^"]+)"/g)].map(x=>x[1]));
 for(const m of app.matchAll(/field\("[^"]+",\s*"([^"]+)"/g))defined.add(m[1]);
 const missing=[...app.matchAll(/\$\("([^"]+)"\)/g)].map(x=>x[1]).filter(x=>!defined.has(x));
 assert.deepEqual([...new Set(missing)],[]);
});
test('No demo seed or demo static route remains in the local backend or Pages build',()=>{
 const backend=readFileSync(new URL('../backend/helpdesk_api.py',import.meta.url),'utf8');
 const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 assert.doesNotMatch(backend,/seed_database|demo_tickets|demo-data\.js/);
 assert.doesNotMatch(pages,/demo-data\.js/);
 assert.match(pages,/employee\.html employee\.css employee\.js employee-model\.js employee-admin\.js/);
});
