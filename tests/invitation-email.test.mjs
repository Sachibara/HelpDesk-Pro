import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../supabase/functions/opsfusion-invitations/index.ts',import.meta.url),'utf8').replace(/^import .*\n/,'').replace('status:number,data:unknown','status,data').replace(/Deno\.env\.get\(([^)]+)\)!/g,'Deno.env.get($1)');
function harness(config={}){
 let handler;const calls=[];
 const chain={eq(){return this;},select:async()=>({data:config.cancelled?[]:[{id:'inv'}],error:null})};
 const client={auth:{getUser:async()=>({data:{user:config.unauth?null:{id:'owner'}},error:null}),signInWithOtp:async p=>{calls.push(['email',p]);return {error:config.delivery?{message:'provider details secret'}:null};}},rpc:async(name,payload)=>{calls.push(['reserve',payload]);return config.denied?{error:{message:'Workspace owner required'}}:{data:{id:'inv',email:'recipient@example.test',attempt:1}};},from:()=>({update:p=>{calls.push(['delivery',p]);return chain;}})};
 runInNewContext(source,{createClient:()=>client,Deno:{env:{get:()=> 'server-only'},serve:fn=>handler=fn},Response});
 return {calls,invoke:(headers={})=>handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer fixture',...headers},body:JSON.stringify({action:'create',workspace_id:'w',email:'recipient@example.test',kind:'staff'})}))};
}
test('Invitation sender rejects unauthenticated users before reserving or emailing',async()=>{const h=harness({unauth:true});assert.equal((await h.invoke()).status,401);assert.deepEqual(h.calls,[]);});
test('Nonowner cannot dispatch invitation email',async()=>{const h=harness({denied:true});assert.equal((await h.invoke()).status,400);assert.equal(h.calls.length,1);});
test('Unexpected browser origin cannot dispatch invitation email',async()=>{const h=harness();assert.equal((await h.invoke({origin:'https://attacker.test'})).status,403);assert.deepEqual(h.calls,[]);});
test('Sender requests Auth email without passwords or exposing login links',async()=>{const h=harness();const r=await h.invoke();assert.equal(r.status,200);const p=h.calls.find(c=>c[0]==='email')[1];assert.equal(p.email,'recipient@example.test');assert.equal(p.options.data.create_workspace,false);assert.equal(p.options.emailRedirectTo,'https://opsfusion-it.vercel.app/invitations');assert.equal('password' in p,false);const body=await r.text();assert.doesNotMatch(body,/access_token|refresh_token|https:/);assert.equal(h.calls.at(-1)[1].delivery,'sent');});
test('Provider failure remains retryable and never reports successful delivery',async()=>{const h=harness({delivery:true});const r=await h.invoke();assert.equal(r.status,502);assert.equal(h.calls.at(-1)[1].delivery,'failed');assert.doesNotMatch(await r.text(),/provider details secret/);});
test('Cancellation during send cannot be reported as an active sent invitation',async()=>{const h=harness({cancelled:true});assert.equal((await h.invoke()).status,409);});
