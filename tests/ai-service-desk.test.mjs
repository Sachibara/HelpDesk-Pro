import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const edge=readFileSync(new URL("../supabase/functions/opsfusion-ai-assistant/index.ts",import.meta.url),"utf8");
const client=readFileSync(new URL("../cloud.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261012_ai_assistant_rate_limit.sql",import.meta.url),"utf8");
const ticketId="INC-1003";
const workspaceId="5fa983e2-25b4-4a27-a359-9986551cf62f";
const analysis={
 summary:"Ticket describes a printer connectivity issue.",
 likely_causes:["Network path unavailable","Printer queue offline"],
 recommended_checks:["Confirm the printer is powered on.","Check documented connectivity without changing systems."],
 recommended_category:"Network",recommended_priority:"P3",
 draft_work_note:"Suggested: verify printer status and network path before resolution.",
 limitations:"No live device diagnostics have been performed."
};
function harness(config={}){
 let handler,providerCalls=0,quotaCalls=0,lastProviderBody=null;
 const fakeService={
   auth:{getUser:async(token)=>({data:{user:config.invalidAuth?null:{id:"USER-1"}},error:config.invalidAuth?{message:"unauthorized"}:null})},
   from(table){
     assert.equal(table,"opsfusion_workspaces");
     const query={select(){return this;},eq(){return this;},
       async maybeSingle(){return {data:config.foreignWorkspace?null:{
         id:workspaceId,owner_id:"USER-1",
         state:{incidents:config.missingTicket?[]:[{id:ticketId,title:"Printer failure",description:"Please diagnose",
           type:"Incident",status:"New",category:"Network",priority:"P3",
           activities:[{action:"Work note",note:"No live tests completed."}]}]}
       },error:null};}
     };
     return query;
   },
   async rpc(name,args){
     assert.equal(name,"opsfusion_ai_consume_quota");
     assert.equal(args.p_user_id,"USER-1");
     quotaCalls++;
     return {data:config.quotaDenied?false:true,error:null};
   }
 };
 const env=(key)=>({SUPABASE_URL:"https://project.supabase.co",
 SUPABASE_SERVICE_ROLE_KEY:"server-key",
 OPENAI_API_KEY:config.noKey?undefined:"private-api-key"})[key];
 const fakeFetch=async(url,options)=>{
   assert.equal(url,"https://api.openai.com/v1/responses");
   assert.equal(options.headers.Authorization,"Bearer private-api-key");
   providerCalls++;lastProviderBody=JSON.parse(options.body);
   return {ok:true,json:async()=>({status:"completed",output:[
     {type:"message",content:[{type:"output_text",text:JSON.stringify(analysis)}]}
   ]})};
 };
 const source=edge.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";\s*/,"");
 assert.doesNotMatch(source,/^import /m);
 runInNewContext(source,{
   Deno:{env:{get:env},serve:(fn)=>{handler=fn;}},
   createClient:()=>fakeService,
   fetch:fakeFetch,
   Response,AbortSignal
 });
 assert.equal(typeof handler,"function");
 const invoke=async({method="POST",origin="https://opsfusion-it.vercel.app",
   authorization="Bearer valid-test-user-jwt",body={workspace_id:workspaceId,ticket_id:ticketId}}={})=>{
   const req={method,headers:new Headers({origin,authorization,"content-type":"application/json"}),
     json:async()=>body};
   const response=await handler(req);
   return {status:response.status,body:response.status===204?null:await response.json()};
 };
 return {invoke,calls:()=>({providerCalls,quotaCalls,lastProviderBody})};
}
test("Edge function rejects requests without an authentication token",async()=>{
 const h=harness();
 const out=await h.invoke({authorization:""});
 assert.equal(out.status,401);
 assert.equal(h.calls().providerCalls,0);
});
test("Edge function rejects unapproved browser origins",async()=>{
 const h=harness();
 const out=await h.invoke({origin:"https://evil.example"});
 assert.equal(out.status,403);
 assert.equal(h.calls().providerCalls,0);
});
test("Edge function rejects invalid or forged input fields",async()=>{
 const h=harness();
 const out=await h.invoke({body:{workspace_id:workspaceId,ticket_id:ticketId,description:"attack"}});
 assert.equal(out.status,400);
 const another=await h.invoke({body:{workspace_id:"invalid",ticket_id:ticketId}});
 assert.equal(another.status,400);
 assert.equal(h.calls().providerCalls,0);
});
test("Edge function rejects expired authentication",async()=>{
 const h=harness({invalidAuth:true});
 assert.equal((await h.invoke()).status,401);
});
test("Edge function denies access to another account's workspace",async()=>{
 const h=harness({foreignWorkspace:true});
 const out=await h.invoke();
 assert.equal(out.status,403);
 assert.equal(h.calls().providerCalls,0);
 assert.equal(h.calls().quotaCalls,0);
});
test("Edge function requires a real ticket in the authorized workspace",async()=>{
 const h=harness({missingTicket:true});
 assert.equal((await h.invoke()).status,404);
 assert.equal(h.calls().providerCalls,0);
});
test("Missing secret disables AI safely without using quota",async()=>{
 const h=harness({noKey:true});
 const out=await h.invoke();
 assert.equal(out.status,503);
 assert.equal(out.body.code,"AI_NOT_CONFIGURED");
 assert.equal(h.calls().quotaCalls,0);
 assert.equal(h.calls().providerCalls,0);
});
test("Hourly quota denial prevents provider costs",async()=>{
 const h=harness({quotaDenied:true});
 const out=await h.invoke();
 assert.equal(out.status,429);
 assert.equal(h.calls().providerCalls,0);
});
test("Authenticated owner obtains provider-generated suggestions without mutating workspace",async()=>{
 const h=harness();
 const out=await h.invoke();
 assert.equal(out.status,200);
 assert.equal(out.body.ticket_id,ticketId);
 assert.equal(out.body.analysis.summary,analysis.summary);
 assert.equal(out.body.analysis.recommended_priority,"P3");
 assert.match(out.body.disclosure,/No ticket or endpoint was changed/);
 assert.equal(h.calls().providerCalls,1);
 assert.equal(h.calls().quotaCalls,1);
 assert.equal(h.calls().lastProviderBody.store,false);
 assert.equal(h.calls().lastProviderBody.model,"gpt-4.1-mini");
 assert.equal(h.calls().lastProviderBody.text.format.strict,true);
 assert.equal(h.calls().lastProviderBody.input[0].role,"user");
 assert.match(h.calls().lastProviderBody.instructions,/untrusted text/);
 assert.doesNotMatch(JSON.stringify(h.calls().lastProviderBody),/private-api-key/);
});
test("AI quota is restricted to service-role API access and atomic per user",()=>{
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.opsfusion_ai_consume_quota\(uuid\) FROM PUBLIC, anon, authenticated/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.opsfusion_ai_consume_quota\(uuid\) TO service_role/);
 assert.match(migration,/ON CONFLICT \(user_id,bucket_start\)/);
 assert.match(migration,/WHERE opsfusion_private\.ai_request_quotas\.used < 15/);
});
test("Frontend passes only ticket and workspace IDs to AI endpoint",()=>{
 const first=client.indexOf("  async function analyzeTicket(ticketId)");
 assert.ok(first>=0);
 const method=client.slice(first,client.indexOf("  function isCloudActive()",first));
 assert.match(method,/workspaceOwnerId !== session\.user\?\.id/);
 assert.match(method,/body:\{workspace_id:expectedWorkspace,ticket_id:ticketId\}/);
 assert.match(method,/Account changed while AI was processing/);
});
test("AI draft requires an explicit action and is not auto-committed",()=>{
 const first=app.indexOf('if ($("mTicketAiAnalyze"))');
 assert.ok(first>=0);
 const src=app.slice(first,app.indexOf('if($("mTicketRespond"))',first));
 assert.match(src,/window\.OpsFusionCloud\.analyzeTicket\(id\)/);
 assert.match(src,/mTicketAiInsert/);
 assert.match(src,/note\.value=String\(data\.draft_work_note/);
 assert.doesNotMatch(src,/commitWorkspaceChange/);
 assert.doesNotMatch(src,/saveState\(/);
});
