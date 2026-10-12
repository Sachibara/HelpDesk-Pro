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
 GEMINI_API_KEY:config.noKey?undefined:"private-gemini-api-key"})[key];
 const fakeFetch=async(url,options)=>{
   assert.equal(url,"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
   assert.equal(options.headers["x-goog-api-key"],"private-gemini-api-key");
   providerCalls++;lastProviderBody=JSON.parse(options.body);
   if(config.providerStatus) return {ok:false,status:config.providerStatus};
   return {ok:true,json:async()=>({candidates:[{
     finishReason:config.blocked?"SAFETY":"STOP",
     content:{parts:config.emptyResponse?[]:[{text:JSON.stringify(analysis)}]}
   }]})};
 };
 const source=edge.replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";\s*/,"");
 assert.doesNotMatch(source,/^import /m);
 runInNewContext(source,{
   Deno:{env:{get:env},serve:(fn)=>{handler=fn;}},
   createClient:()=>fakeService,
   fetch:fakeFetch,
   Response,AbortSignal,console:{warn:()=>{}}
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
 assert.equal(h.calls().lastProviderBody.generationConfig.responseMimeType,"application/json");
 assert.equal(h.calls().lastProviderBody.generationConfig.responseJsonSchema.properties.recommended_priority.type,"string");
 assert.equal(h.calls().lastProviderBody.contents[0].role,"user");
 assert.match(h.calls().lastProviderBody.systemInstruction.parts[0].text,/untrusted text/);
 assert.equal(out.body.model,"gemini-3.1-flash-lite");
 assert.equal(out.body.provider,"Google Gemini");
 assert.doesNotMatch(JSON.stringify(h.calls().lastProviderBody),/private-gemini-api-key/);
});
test("Gemini free-tier quota errors produce an actionable response",async()=>{
 const h=harness({providerStatus:429});
 const out=await h.invoke();
 assert.equal(out.status,429);
 assert.equal(out.body.code,"AI_PROVIDER_RATE_LIMIT");
 assert.equal(h.calls().providerCalls,1);
});
test("Model access 404 shows an actionable and key-safe error",async()=>{
 const h=harness({providerStatus:404});
 const out=await h.invoke();
 assert.equal(out.status,503);
 assert.equal(out.body.code,"AI_MODEL_UNAVAILABLE");
 assert.match(out.body.error,/Google AI Studio/);
 assert.doesNotMatch(JSON.stringify(out.body),/private-gemini-api-key/);
});
test("Malformed Gemini request 400 is distinct from authentication and quota failures",async()=>{
 const h=harness({providerStatus:400});
 const out=await h.invoke();
 assert.equal(out.status,503);
 assert.equal(out.body.code,"AI_REQUEST_INVALID");
 assert.match(out.body.error,/HTTP 400/);
});
test("Gemini invalid key does not expose credentials",async()=>{
 const h=harness({providerStatus:403});
 const out=await h.invoke();
 assert.equal(out.status,503);
 assert.match(out.body.error,/GEMINI_API_KEY/);
 assert.equal(out.body.code,"AI_KEY_DENIED");
 assert.doesNotMatch(JSON.stringify(out.body),/private-gemini-api-key/);
});
test("Gemini safety refusal does not fabricate advice",async()=>{
 const h=harness({blocked:true});
 const out=await h.invoke();
 assert.equal(out.status,503);
 assert.equal(out.body.code,"AI_INCOMPLETE");
});
test("Empty Gemini response does not fabricate advice",async()=>{
 const h=harness({emptyResponse:true});
 assert.equal((await h.invoke()).status,503);
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
