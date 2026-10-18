import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../supabase/functions/opsfusion-staff-account/index.ts',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('status:number,data:unknown','status,data').replaceAll("')!","')");
function harness(config={}){
 let handler;const actions=[];
 const service={auth:{getUser:async()=>({data:{user:config.unauth?null:{id:'owner'}},error:null}),admin:{createUser:async args=>{actions.push('create');assert.equal(args.password,'TemporaryPass123!');return config.existing?{error:{}}:{data:{user:{id:'new-member'}}};},deleteUser:async id=>{assert.equal(id,'new-member');actions.push('cleanup');return {};}}},from:()=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:config.member?null:{id:'workspace'}};},then(resolve){return Promise.resolve({count:0,error:null}).then(resolve);}}),rpc:async()=>{actions.push('grant');return {error:config.grantFailure?{}:null};}};
 runInNewContext(source,{createClient:()=>service,Deno:{env:{get:()=> 'server-config'},serve:fn=>handler=fn},Response});
 return {actions,invoke:()=>handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({workspace_id:'11111111-1111-4111-8111-111111111111',email:'member@example.test',password:'TemporaryPass123!',name:'Member Example'})}))};
}
test('Only authenticated workspace owner can create members',async()=>{for(const config of [{unauth:true},{member:true}]){const h=harness(config);assert.ok([401,403].includes((await h.invoke()).status));assert.deepEqual(h.actions,[]);}});
test('New member creation grants scoped membership',async()=>{const h=harness();assert.equal((await h.invoke()).status,200);assert.deepEqual(h.actions,['create','grant']);});
test('Existing accounts are never overwritten or deleted',async()=>{const h=harness({existing:true});assert.equal((await h.invoke()).status,409);assert.deepEqual(h.actions,['create']);});
test('Failed membership grant cleans up only the newly created account',async()=>{const h=harness({grantFailure:true});assert.equal((await h.invoke()).status,409);assert.deepEqual(h.actions,['create','grant','cleanup']);});
