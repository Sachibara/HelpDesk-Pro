import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const edge=readFileSync(new URL("../supabase/functions/opsfusion-ai-tools/index.ts",import.meta.url),"utf8");
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
 const modelsCalled=[];
 const fakeService={
   auth:{getUser:async(token)=>({data:{user:config.invalidAuth?null:{id:"USER-1"}},error:config.invalidAuth?{message:"unauthorized"}:null})},
   from(table){
     if(table === "opsfusion_tool_proposals") return {
       insert(value){ config.stored=value; return this; }, select(){return this;},
       async single(){return {data:{id:"proposal-1",...config.stored,status:"pending"},error:null};}
     };
     assert.equal(table,"opsfusion_workspaces");
     const query={select(){return this;},eq(){return this;},
       async maybeSingle(){return {data:config.foreignWorkspace?null:{
         id:workspaceId,owner_id:"USER-1",
         updated_at:"2026-10-13T00:00:00Z",state:{incidents:config.missingTicket?[]:[{id:ticketId,title:"Printer failure",description:"Please diagnose",
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
 GEMINI_API_KEY:config.noKey?undefined:"private-gemini-api-key"})[key];
 const fakeFetch=async(url,options)=>{
   assert.match(url,/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.(?:1|5)-flash-lite:generateContent$/);
   assert.equal(options.headers["x-goog-api-key"],"private-gemini-api-key");
   providerCalls++;lastProviderBody=JSON.parse(options.body);
   modelsCalled.push(url.match(/models\/([^:]+):/)[1]);
   const status=Array.isArray(config.responses)?(config.responses[providerCalls-1]||200):(config.providerStatus||200);
   if(status==="timeout") throw new Error("simulated timeout");
   if(status!==200) return {ok:false,status};
   return {ok:true,json:async()=>({candidates:[{
     finishReason:config.blocked?"SAFETY":"STOP",
     content:{parts:config.emptyResponse?[]:(config.parts || [{functionCall:{name:"add_work_note",args:{note:"Proposed: check camera permissions."}}}])}
   }]})};
 };
 const source=edge.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.117\.0";\s*/,"");
 assert.doesNotMatch(source,/^import /m);
 runInNewContext(source,{
   Deno:{env:{get:env},serve:(fn)=>{handler=fn;}},
   createClient:()=>fakeService,
   fetch:fakeFetch,
   Response,AbortSignal,console:{warn:()=>{}},setTimeout:(fn)=>{fn();return 1;}
 });
 assert.equal(typeof handler,"function");
 const invoke=async({method="POST",origin="https://opsfusion-it.vercel.app",
   authorization="Bearer valid-test-user-jwt",body={workspace_id:workspaceId,ticket_id:ticketId}}={})=>{
   const req={method,headers:new Headers({origin,authorization,"content-type":"application/json"}),
     json:async()=>body};
   const response=await handler(req);
   return {status:response.status,body:response.status===204?null:await response.json()};
 };
 return {invoke,calls:()=>({providerCalls,quotaCalls,lastProviderBody,modelsCalled})};
}

for(const [name,config,status] of [
 ["owner receives immutable pending proposal",{},200],
 ["foreign workspace cannot request proposal",{foreignWorkspace:true},403],
 ["expired sign-in denied",{invalidAuth:true},401],
 ["missing ticket denied",{missingTicket:true},404],
 ["quota enforced",{quotaDenied:true},429],
 ["unknown tool rejected",{parts:[{functionCall:{name:"delete_ticket",args:{note:"x"}}}]},503],
 ["extra arguments rejected",{parts:[{functionCall:{name:"add_work_note",args:{note:"x",ticket_id:"INC-OTHER"}}}]},503],
 ["multiple calls rejected",{parts:[{functionCall:{name:"add_work_note",args:{note:"x"}}},{functionCall:{name:"add_work_note",args:{note:"y"}}}]},503],
 ["empty call rejected",{emptyResponse:true},503],
 ["blocked output rejected",{blocked:true},503],
 ["overlong note rejected",{parts:[{functionCall:{name:"add_work_note",args:{note:"x".repeat(1001)}}}]},503]
]) test("Approval tools: "+name,async()=>{
 const h=harness(config);const out=await h.invoke();assert.equal(out.status,status);
 if(status===200){
  assert.equal(out.body.proposal.status,"pending");
  assert.equal(config.stored.tool_name,"add_work_note");
  assert.equal(config.stored.expected_updated_at,"2026-10-13T00:00:00Z");
  assert.equal(config.stored.ticket_id,ticketId);
  assert.equal(h.calls().lastProviderBody.toolConfig.functionCallingConfig.mode,"ANY");
 }else assert.equal(config.stored,undefined);
});
