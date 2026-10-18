import { createClient } from "npm:@supabase/supabase-js@2.117.0";
const origin="https://opsfusion-it.vercel.app";
const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.headers.get('origin') && req.headers.get('origin')!==origin)return reply(403,{error:'Origin denied'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 try {
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await service.auth.getUser(token);
  if(authError||!auth.user)return reply(401,{error:'Sign in required'});
  const raw=await req.text();if(raw.length>3000)return reply(413,{error:'Request too large'});
  const {workspace_id,email,password,name}=JSON.parse(raw);
  if(!/^[a-f\d-]{36}$/i.test(workspace_id||'')||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<12||password.length>128||typeof name!=='string'||!name.trim()||name.length>100)return reply(400,{error:'Enter a valid email, name and password of 12–128 characters.'});
  const {data:w,error:we}=await service.from('opsfusion_workspaces').select('id').eq('id',workspace_id).eq('owner_id',auth.user.id).maybeSingle();
  if(we||!w)return reply(403,{error:'Workspace owner required'});
  const {count,error:ce}=await service.from('opsfusion_memberships').select('user_id',{count:'exact',head:true}).eq('workspace_id',workspace_id);
  if(ce||count===null||count>=100)return reply(409,{error:'Member limit reached or membership unavailable.'});
  // Owner-provisioned credentials, never overwrite an existing Auth account or password.
  const {data:created,error:createError}=await service.auth.admin.createUser({email:email.trim().toLowerCase(),password,email_confirm:true,user_metadata:{display_name:name.trim()}});
  if(createError||!created.user)return reply(409,{error:'Account could not be created. If it already exists, use Add Existing Account. Otherwise check the password requirements.'});
  const caller=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {error:grantError}=await caller.rpc('opsfusion_staff_access',{p_action:'grant',p_workspace:workspace_id,p_payload:{email:email.trim(),role:'technician'}});
  if(grantError){await service.auth.admin.deleteUser(created.user.id);return reply(409,{error:'Membership could not be granted. No workspace access was added; retry or use Add Existing Account.'});}
  return reply(200,{ok:true});
 }catch{return reply(400,{error:'Unable to process account creation.'});}
});
