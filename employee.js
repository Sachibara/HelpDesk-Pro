(() => {
 'use strict';
 const $=id=>document.getElementById(id),say=text=>{$('message').textContent=text;};
 if(!window.supabase){say('Unable to load sign-in service. Refresh the page.');return;}
 const client=window.supabase.createClient('https://qyizwyvgbywkextsekpj.supabase.co','sb_publishable_lfqzmccDSsdjlHbMD2MJ2w_r8g3sYni');
 let session=null,epoch=0,tickets=[],selected='';
 const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
 async function rpc(action,payload={},workspace=$('workspace').value||null){
  const started=epoch;const {data,error}=await client.rpc('opsfusion_employee_portal',{p_action:action,p_workspace:workspace,p_payload:payload});
  if(started!==epoch)throw Error('Session changed. Sign in again.');if(workspace && workspace!==$('workspace').value)throw Error('Workspace changed. Refresh your requests.');if(error)throw error;return data;
 }
 async function busy(button,fn){button.disabled=true;try{await fn();}catch(e){say(e.message||'Request failed. Please retry.');}finally{button.disabled=false;}}
 async function loadTickets(){
  const workspace=$('workspace').value,started=epoch;$('detail').hidden=true;tickets=[];$('tickets').replaceChildren();
  if(!workspace)return;const data=await rpc('tickets',{},workspace);if(workspace!==$('workspace').value||started!==epoch)return;
  tickets=data||[];
  if(!tickets.length)$('tickets').append(el('p','No requests yet. Submit your first support request above.'));
  tickets.forEach(t=>{const b=el('button',t.id+' · '+t.title);b.className='ticket';b.append(el('small',t.status+' · '+t.priority+' · '+new Date(t.createdAt).toLocaleString()));b.onclick=()=>showTicket(t.id);$('tickets').append(b);});
 }
 function showTicket(id){
  selected=id;const t=tickets.find(t=>t.id===id);if(!t)return;const box=$('detail');box.replaceChildren(el('h2',t.title),el('p',t.id+' · '+t.status+' · '+t.priority));
  const desc=el('p',t.description);desc.className='description';box.append(desc,el('h3','Conversation with IT support'));
  (t.messages||[]).forEach(m=>{const p=el('p',m.author+' · '+new Date(m.at).toLocaleString()+'\n'+m.body);p.className='conversation';box.append(p);});
  if(!['Resolved','Closed'].includes(t.status)){const f=document.createElement('form'),label=el('label','Reply'),input=document.createElement('textarea'),b=el('button','Send reply');input.required=true;input.maxLength=2000;input.rows=3;label.append(input);f.append(label,b);f.onsubmit=e=>{e.preventDefault();busy(b,async()=>{await rpc('comment',{ticket_id:id,body:input.value});await loadTickets();showTicket(id);say('Reply sent.');});};box.append(f);}else box.append(el('p','This request is resolved or closed. Submit a new request if you need more help.'));
  box.hidden=false;
 }
 async function start(){
  const started=++epoch;const {data,error}=await client.auth.getSession();if(started!==epoch)return;if(error)throw error;session=data.session;
  tickets=[];$('tickets').replaceChildren();$('detail').hidden=true;$('auth').hidden=!!session;$('portal').hidden=!session;$('workspaceContent').hidden=true;
  if(!session)return;const workspaces=await rpc('workspaces',{},null);if(started!==epoch)return;
  $('workspace').replaceChildren();workspaces.forEach(w=>{const o=el('option',w.name);o.value=w.id;$('workspace').append(o);});
  $('enrollment').hidden=workspaces.length>0;$('workspaceContent').hidden=!workspaces.length;$('refresh').disabled=!workspaces.length;await loadTickets();
 }
 $('authForm').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;$('password').value='';say('Signed in.');await start();});};
 $('register').onclick=()=>busy($('register'),async()=>{if(!$('authForm').reportValidity())return;if($('password').value.length<12)throw Error('Use at least 12 characters for your password.');const {error}=await client.auth.signUp({email:$('email').value.trim(),password:$('password').value,options:{emailRedirectTo:location.origin+'/employee'}});if(error)throw error;$('password').value='';say('If registration is available, check your email to confirm your account. Then ask your workspace owner to enable employee access.');await start();});
 $('signOut').onclick=()=>busy($('signOut'),async()=>{epoch++;const {error}=await client.auth.signOut();if(error)throw error;await start();say('Signed out.');});
 $('workspace').onchange=()=>busy($('refresh'),loadTickets);
 $('refresh').onclick=()=>busy($('refresh'),loadTickets);
 $('ticketForm').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{const data=await rpc('create',{title:$('title').value,description:$('description').value});$('ticketForm').reset();await loadTickets();showTicket(data.ticket_id);say('Request submitted: '+data.ticket_id);});};
 client.auth.onAuthStateChange((event,next)=>{if(event==='SIGNED_IN' && session?.user?.id && next?.user?.id!==session.user.id){epoch++;session=next;tickets=[];$('workspaceContent').hidden=true;$('tickets').replaceChildren();$('detail').replaceChildren();setTimeout(()=>start().catch(e=>say(e.message)),0);}if(event==='SIGNED_OUT'){epoch++;session=null;tickets=[];$('portal').hidden=true;$('auth').hidden=false;$('tickets').replaceChildren();$('detail').replaceChildren();}});
 start().catch(e=>say(e.message));
})();
