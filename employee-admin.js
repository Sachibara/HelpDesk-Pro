(() => {
 const $=id=>document.getElementById(id),el=(tag,text)=>{const x=document.createElement(tag);x.textContent=text;return x;};
 $('employeeAccessOpen').onclick=async()=>{
  const cloud=window.OpsFusionCloud,dialog=$('employeeAccessDialog'),body=$('employeeAccessBody');body.replaceChildren();dialog.showModal();
  if(!cloud?.isWorkspaceOwner()){body.append(el('p','Sign in as the workspace owner to manage employee access.'));return;}
  const workspace=cloud.getWorkspaceId(),user=cloud.getUser()?.id;
  const current=()=>cloud.getWorkspaceId()===workspace&&cloud.getUser()?.id===user&&cloud.isWorkspaceOwner();
  const message=el('p','Loading employee access…');message.setAttribute('role','status');body.append(message);
  const rpc=async(action,payload={})=>{if(!current())throw Error('Workspace session changed');const {data,error}=await cloud.client.rpc('opsfusion_employee_portal',{p_action:action,p_workspace:workspace,p_payload:payload});if(!current())throw Error('Workspace session changed');if(error)throw error;return data;};
  try{
   const {data,error}=await cloud.client.from('opsfusion_workspaces').select('state').eq('id',workspace).single();if(error)throw error;if(!current())throw Error('Workspace session changed');
   const identities=(data.state.identities||[]).filter(u=>u.status==='Active');
   const f=document.createElement('form'),email=document.createElement('input'),select=document.createElement('select'),button=el('button','Grant Employee Access');button.className='btn primary';email.type='email';email.required=true;email.placeholder='Confirmed employee account email';
   const emailLabel=el('label','Employee account email');emailLabel.className='field';emailLabel.append(email);const identityLabel=el('label','Employee identity');identityLabel.className='field';identityLabel.append(select);
   identities.forEach(u=>{const o=el('option',u.displayName);o.value=u.id;select.append(o);});select.required=true;button.disabled=!identities.length;
   f.append(emailLabel,identityLabel,button);body.append(el('p','The employee registers and confirms their email at /employee. Link that account to an active Identity record here. This grants access only to requests submitted through that employee account.'),f);
   const rows=document.createElement('div');body.append(rows);
   const refresh=async()=>{const access=await rpc('access_list');rows.replaceChildren(el('h3','Enrolled employees'));if(!access.length)rows.append(el('p','No employees enrolled.'));access.forEach(a=>{const row=el('p',(identities.find(u=>u.id===a.identity_id)?.displayName||a.identity_id)+' · '+a.email+' '),revoke=el('button','Revoke');revoke.className='btn secondary';revoke.type='button';revoke.onclick=async()=>{revoke.disabled=true;try{await rpc('revoke',{identity_id:a.identity_id});await refresh();message.textContent='Employee access revoked.';}catch(e){message.textContent=e.message;revoke.disabled=false;}};row.append(revoke);rows.append(row);});};
   f.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await rpc('grant',{identity_id:select.value,email:email.value});await refresh();message.textContent='Employee access granted.';email.value='';}catch(e){message.textContent=e.message;}finally{button.disabled=false;}};
   await refresh();message.textContent='Employee accounts cannot view internal work notes or other employees’ requests.';
  }catch(e){message.textContent=e.message;}
 };
 $('employeeAccessClose').onclick=()=>$('employeeAccessDialog').close();
})();
