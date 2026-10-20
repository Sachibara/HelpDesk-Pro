import { createClient } from "npm:@supabase/supabase-js@2.117.0";
const origin='https://opsfusion-it.vercel.app';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,{error:'Origin denied'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 try{
  const raw=await req.text();if(raw.length>2000)return reply(413,{error:'Request too large'});
  const body=JSON.parse(raw),token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await service.auth.getUser(token);
  if(authError||!auth.user)return reply(401,{error:'Sign in required'});
  if(!['create','resend'].includes(body.action))return reply(400,{error:'Invalid invitation action'});
  const caller=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  // Database checks current ownership, reserves the invitation, and throttles concurrent requests.
  const {data:inv,error}=await caller.rpc('opsfusion_invitations_manage',{p_action:body.action,p_workspace:body.workspace_id||null,p_payload:{id:body.id,email:body.email,kind:body.kind,identity_id:body.identity_id}});
  if(error)return reply(400,{error:error.message});
  // Auth owns the single-use email proof. No credentials or login links are returned to the owner.
  let delivered=false;
  try{const sent=await service.auth.signInWithOtp({email:inv.email,options:{shouldCreateUser:true,emailRedirectTo:origin+'/invitations',data:{create_workspace:false}}});delivered=!sent.error;}catch{/* preserve retryable delivery state */}
  const {data:marked,error:markError}=await service.from('opsfusion_invitations').update({delivery:delivered?'sent':'failed'}).eq('id',inv.id).eq('status','pending').eq('attempts',inv.attempt).select('id');
  if(markError||!marked?.length)return reply(409,{error:'Invitation changed or delivery status could not be confirmed. Refresh the list before retrying.'});
  if(!delivered)return reply(502,{error:'Invitation saved, but the email provider did not confirm sending. Check delivery settings or resend after 60 seconds.'});
  return reply(200,{ok:true,id:inv.id,message:'Invitation email requested. Access remains pending until the recipient accepts.'});
 }catch{return reply(400,{error:'Unable to process invitation. Refresh the invitation list before retrying.'});}
});
