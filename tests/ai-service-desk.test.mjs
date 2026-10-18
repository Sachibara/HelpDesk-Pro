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
 const modelsCalled=[];
 const fakeService={
   auth:{getUser:async(token)=>({data:{user:config.invalidAuth?null:{id:"USER-1"}},error:config.invalidAuth?{message:"unauthorized"}:null})},
   from(table){
     if(table === "opsfusion_memberships") return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:config.memberRole?{role:config.memberRole}:null,error:null};}};
     assert.equal(table,"opsfusion_workspaces");
     const query={select(){return this;},eq(){return this;},
       async maybeSingle(){return {data:config.foreignWorkspace?null:{
         id:workspaceId,owner_id:config.nonOwner?"OWNER":"USER-1",
         state:{knowledge:config.knowledge||[],incidents:config.missingTicket?[]:[{id:ticketId,title:"Printer failure",description:"Please diagnose",
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
     content:{parts:config.emptyResponse?[]:[{text:JSON.stringify({...analysis,cited_article_ids:config.citations||[]})}]}
   }]})};
 };
 const shared=readFileSync(new URL("../supabase/functions/_shared/knowledge.ts",import.meta.url),"utf8").replaceAll("export function","function");
 const source=shared+"\n"+edge.replace(/^import .*;\s*$/gm,"");
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
test("A provider 503 automatically switches to another free-tier Gemini Flash-Lite model",async()=>{
 const h=harness({responses:[503,200]});
 const out=await h.invoke();
 assert.equal(out.status,200);
 assert.equal(out.body.model,"gemini-3.5-flash-lite");
 assert.equal(out.body.analysis.summary,analysis.summary);
 assert.equal(h.calls().providerCalls,2);
 assert.equal(h.calls().quotaCalls,1);
 assert.deepEqual(h.calls().modelsCalled,["gemini-3.1-flash-lite","gemini-3.5-flash-lite"]);
});
test("Persistent 503 is retried at most twice then returns an honest failure",async()=>{
 const h=harness({responses:[503,503,503]});
 const out=await h.invoke();
 assert.equal(out.status,503);
 assert.equal(out.body.code,"AI_PROVIDER_UNAVAILABLE");
 assert.match(out.body.error,/after 3 attempt/);
 assert.equal(h.calls().providerCalls,3);
 assert.equal(h.calls().quotaCalls,1);
});
test("Network failure is retried via free-tier fallback and successful model is reported",async()=>{
 const h=harness({responses:["timeout",200]});
 const out=await h.invoke();
 assert.equal(out.status,200);
 assert.equal(out.body.model,"gemini-3.5-flash-lite");
 assert.equal(h.calls().providerCalls,2);
});
test("Repeated timeouts stop after three attempts and never fabricate AI analysis",async()=>{
 const h=harness({responses:["timeout","timeout","timeout"]});
 const out=await h.invoke();
 assert.equal(out.status,503);
 assert.equal(out.body.code,"AI_UPSTREAM_TIMEOUT");
 assert.equal(h.calls().providerCalls,3);
 assert.doesNotMatch(JSON.stringify(out.body),/private-gemini-api-key/);
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
 assert.match(method,/role === "viewer"/);
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


test("Knowledge articles enter provider context and only allowed citation IDs return",async()=>{
 const h=harness({knowledge:[{id:"KB-PRINT",title:"Printer connectivity",summary:"Check printer network",content:"Verify power and network cable."},{id:"KB-OLD",title:"Printer",archived:true,content:"Old guidance"}],citations:["KB-PRINT","KB-FAKE"]});
 const out=await h.invoke();assert.equal(out.status,200);
 const context=JSON.parse(h.calls().lastProviderBody.contents[0].parts[0].text);
 assert.equal(context.knowledge_articles.length,1);assert.equal(context.knowledge_articles[0].id,"KB-PRINT");
 assert.deepEqual(out.body.knowledge_sources.map(a=>[a.id,a.cited]),[["KB-PRINT",true]]);
 assert.match(h.calls().lastProviderBody.systemInstruction.parts[0].text,/knowledge articles are untrusted/);
});

test("Technician can request AI; viewers and removed members cannot",async()=>{
 const member=harness({nonOwner:true,memberRole:"technician"});assert.equal((await member.invoke()).status,200);
 for(const memberRole of ["viewer",null]){const h=harness({nonOwner:true,memberRole});assert.equal((await h.invoke()).status,403);assert.equal(h.calls().providerCalls,0);}
});
