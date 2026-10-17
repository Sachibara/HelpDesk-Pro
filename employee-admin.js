(() => {
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
 let accounts=[],accountScope='',refreshVersion=0;
 const scope=()=>{const c=window.OpsFusionCloud;return c?.isWorkspaceOwner()?c.getWorkspaceId()+':'+c.getUser()?.id:'';};
 const publish=(rows,key)=>{accounts=rows;accountScope=key;window.dispatchEvent(new Event('opsfusion:employee-access-updated'));};
 window.OpsFusionEmployeeAccounts={
  emailFor:id=>accountScope&&accountScope===scope()?accounts.find(a=>a.identity_id===id)?.email||'':'',
  refresh:async()=>{const key=scope(),version=++refreshVersion;if(!key){publish([],'');return;}try{const c=window.OpsFusionCloud,{data,error}=await c.client.rpc('opsfusion_employee_portal',{p_action:'access_list',p_workspace:c.getWorkspaceId(),p_payload:{}});if(error)throw error;if(key===scope()&&version===refreshVersion)publish(data||[],key);}catch{if(key===scope()&&version===refreshVersion)publish([],key);}}
 };
 $('employeeAccessOpen').onclick=async()=>{
  const cloud=window.OpsFusionCloud,dialog=$('employeeAccessDialog'),body=$('employeeAccessBody');body.replaceChildren();dialog.showModal();
  if(!cloud?.isWorkspaceOwner()){body.append(el('p','Sign in as the workspace owner to manage employee access.'));return;}
  const workspace=cloud.getWorkspaceId(),key=scope();
  const current=()=>key===scope()&&dialog.open;
  const message=el('p','Loading employee access…','access-status');message.setAttribute('role','status');body.append(message);
  const rpc=async(action,payload={})=>{if(!current())throw Error('Workspace session changed');const {data,error}=await cloud.client.rpc('opsfusion_employee_portal',{p_action:action,p_workspace:workspace,p_payload:payload});if(!current())throw Error('Workspace session changed');if(error)throw error;return data;};
  try{
   const f=el('form',undefined,'access-form'),email=el('input'),select=el('select'),button=el('button','Grant Employee Access','btn primary'),reload=el('button','Refresh identities','btn secondary');
   email.id='employeeAccountEmail';email.type='email';email.required=true;email.autocomplete='email';email.placeholder='Confirmed employee account email';
   select.id='employeeIdentitySelect';select.required=true;select.setAttribute('aria-describedby','employeeIdentityHint');button.type='submit';reload.type='button';
   const emailLabel=el('label',undefined,'field');emailLabel.append(el('span','Employee account email'),email);
   const identityLabel=el('label',undefined,'field');identityLabel.append(el('span','Employee identity'),select);
   const hint=el('p','','access-hint');hint.id='employeeIdentityHint';
   const actions=el('div',undefined,'access-actions');actions.append(button,reload);f.append(emailLabel,identityLabel,hint,actions);
   body.append(el('p','Ask the employee to register and confirm their email in the Employee Support Portal, then link that account to an active identity here.'),f);
   const rows=el('div',undefined,'access-enrollments');body.append(rows);let identities=[],busy=false;
   const validate=()=>{button.disabled=busy||!current()||!select.value||!email.checkValidity();reload.disabled=busy;select.disabled=busy||!identities.length;email.disabled=busy;};
   email.addEventListener('input',validate);select.addEventListener('change',validate);
   const refresh=async()=>{
    const previous=select.value;
    const {data,error}=await cloud.client.from('opsfusion_workspaces').select('state').eq('id',workspace).single();if(error)throw error;if(!current())return;
    const access=await rpc('access_list');publish(access||[],key);
    const active=(data.state.identities||[]).filter(u=>u.status==='Active');
    identities=active.filter(u=>!(access||[]).some(a=>a.identity_id===u.id));
    select.replaceChildren();const placeholder=el('option',identities.length?'Choose an employee identity':active.length?'All active identities are already enrolled':'No active identities — add one in Identity & Access');placeholder.value='';placeholder.disabled=true;placeholder.selected=true;select.append(placeholder);
    identities.forEach(u=>{const option=el('option',u.displayName);option.value=u.id;select.append(option);});
    select.value=identities.some(u=>u.id===previous)?previous:'';
    hint.textContent=identities.length?'Select the employee record that belongs to the account email.':active.length?'Use Revoke below before linking an enrolled identity to a different account.':'Create an Active identity in Identity & Access, then refresh this list.';
    rows.replaceChildren(el('h3','Enrolled employees'));
    if(!access.length)rows.append(el('p','No employees enrolled.'));
    access.forEach(a=>{const row=el('div',undefined,'access-enrollment'),revoke=el('button','Revoke','btn secondary');revoke.type='button';row.append(el('span',((data.state.identities||[]).find(u=>u.id===a.identity_id)?.displayName||'Employee')+' · '+a.email),revoke);revoke.onclick=async()=>{if(busy)return;busy=true;validate();revoke.disabled=true;try{await rpc('revoke',{identity_id:a.identity_id});await refresh();message.textContent='Employee access revoked.';}catch(e){message.textContent=e.message;}finally{busy=false;revoke.disabled=false;validate();}};rows.append(row);});validate();
   };
   reload.onclick=async()=>{busy=true;validate();try{await refresh();message.textContent='Employee identities refreshed.';}catch(e){message.textContent=e.message;}finally{busy=false;validate();}};
   f.onsubmit=async e=>{e.preventDefault();if(busy||!select.value||!email.checkValidity())return;busy=true;validate();let saved=false;try{await rpc('grant',{identity_id:select.value,email:email.value.trim()});saved=true;email.value='';await refresh();message.textContent='Employee access granted. The employee can now refresh their portal.';}catch(e){message.textContent=saved?'Access was granted, but the list could not refresh. Refresh identities to check it.':e.message;}finally{busy=false;validate();}};
   await refresh();message.textContent='Employees can see only their own requests and public replies.';
  }catch(e){message.textContent=e.message;}
 };
 $('employeeAccessClose').onclick=()=>$('employeeAccessDialog').close();
})();
