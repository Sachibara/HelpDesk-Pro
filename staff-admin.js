(() => {
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let roster=[],rosterScope='',version=0;
 const scope=()=>{const c=window.OpsFusionCloud;return c?.isCloudActive()?c.getWorkspaceId()+':'+c.getUser()?.id:'';};
 const publish=(rows,key)=>{roster=rows;rosterScope=key;window.dispatchEvent(new Event('opsfusion:staff-updated'));};
 window.OpsFusionStaff={members:()=>rosterScope===scope()?roster:[],refresh:async()=>{const key=scope(),v=++version;if(!key){publish([],'');return;}try{const c=window.OpsFusionCloud,{data,error}=await c.client.rpc('opsfusion_staff_access',{p_action:'list',p_workspace:c.getWorkspaceId(),p_payload:{}});if(error)throw error;if(key===scope()&&v===version)publish(data||[],key);}catch{if(key===scope()&&v===version)publish([],key);}}};
 $('staffAccessOpen').onclick=async()=>{
  const cloud=window.OpsFusionCloud,dialog=$('staffAccessDialog'),body=$('staffAccessBody');body.replaceChildren();dialog.showModal();
  if(!cloud?.isWorkspaceOwner()){body.append(el('p','Only the workspace owner can manage staff access.'));return;}
  const key=scope(),workspace=cloud.getWorkspaceId(),current=()=>key===scope()&&dialog.open;
  const status=el('p','Loading staff…');status.setAttribute('role','status');body.append(status);
  const rpc=async(action,payload={})=>{if(!current())throw Error('Workspace session changed');const {data,error}=await cloud.client.rpc('opsfusion_staff_access',{p_action:action,p_workspace:workspace,p_payload:payload});if(error)throw error;if(!current())throw Error('Workspace session changed');return data;};
  const rows=el('div',undefined,'access-enrollments'),invite=el('button','Invite IT Member','btn primary');
  invite.type='button';invite.onclick=()=>{dialog.close();window.OpsFusionInvitations.open('staff');};
  body.append(el('p','Invite members by email. They verify their address and choose their own password; access starts only after acceptance. The owner never sets or shares member passwords.'),invite,rows);
  let busy=false;const validate=()=>{invite.disabled=busy||!current();};
  const refresh=async()=>{const members=await rpc('list');publish(members,key);rows.replaceChildren(el('h3','Authorized staff'));members.forEach(m=>{const row=el('div',undefined,'access-enrollment');row.append(el('span',(m.name||m.email)+' · '+m.email+' · '+m.role));if(m.role!=='owner'){const revoke=el('button','Remove Member','btn secondary');revoke.type='button';revoke.onclick=async()=>{if(busy)return;busy=true;validate();revoke.disabled=true;try{await rpc('revoke',{user_id:m.user_id});await refresh();status.textContent='Staff access revoked. Subsequent server requests are denied.';}catch(e){status.textContent=e.message;}finally{busy=false;revoke.disabled=false;validate();}};row.append(revoke);}rows.append(row);});};
  validate();try{await refresh();status.textContent='Owner access is protected and cannot be removed here.';}catch(e){status.textContent=e.message;}
 };
 $('staffAccessClose').onclick=()=>$('staffAccessDialog').close();
})();
