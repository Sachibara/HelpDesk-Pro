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
  const form=el('form',undefined,'access-form'),email=el('input'),role=el('select'),save=el('button','Grant / Update Staff Access','btn primary'),rows=el('div',undefined,'access-enrollments');
  email.type='email';email.required=true;email.autocomplete='email';email.placeholder='Confirmed staff account email';email.id='staffAccountEmail';role.id='staffRoleSelect';
  [['technician','Technician — edit shared workspace records'],['viewer','Viewer — read-only shared workspace'],['admin','Administrator — edit shared workspace records']].forEach(([value,text])=>{const o=el('option',text);o.value=value;role.append(o);});
  const emailLabel=el('label',undefined,'field'),roleLabel=el('label',undefined,'field');emailLabel.append(el('span','Staff account email'),email);roleLabel.append(el('span','Workspace role'),role);save.type='submit';form.append(emailLabel,roleLabel,save);
  body.append(el('p','The staff member first registers and confirms an account through the portal. Registration alone grants no access. Enter that confirmed email here. Revoke employee enrollment in this workspace before granting staff access.'),el('p','Administrators and technicians can edit shared records. Viewers can read the whole IT workspace, including internal notes. Staff membership, AI tools and automation controls remain owner-managed.'),form,rows);
  let busy=false;const validate=()=>{save.disabled=busy||!email.checkValidity()||!current();email.disabled=busy;role.disabled=busy;};email.addEventListener('input',validate);
  const refresh=async()=>{const members=await rpc('list');publish(members,key);rows.replaceChildren(el('h3','Authorized staff'));members.forEach(m=>{const row=el('div',undefined,'access-enrollment');row.append(el('span',(m.name||m.email)+' · '+m.email+' · '+m.role));if(m.role!=='owner'){const revoke=el('button','Revoke','btn secondary');revoke.type='button';revoke.onclick=async()=>{if(busy)return;busy=true;validate();revoke.disabled=true;try{await rpc('revoke',{user_id:m.user_id});await refresh();status.textContent='Staff access revoked. Subsequent server requests are denied.';}catch(e){status.textContent=e.message;}finally{busy=false;revoke.disabled=false;validate();}};row.append(revoke);}rows.append(row);});};
  form.onsubmit=async e=>{e.preventDefault();if(busy||!email.checkValidity())return;busy=true;validate();let saved=false;try{await rpc('grant',{email:email.value.trim(),role:role.value});saved=true;email.value='';await refresh();status.textContent='Staff access saved. Ask the staff member to sign in again to load their role.';}catch(e){status.textContent=saved?'Access saved, but the list could not refresh. Reopen this dialog to check it.':e.message;}finally{busy=false;validate();}};
  validate();try{await refresh();status.textContent='Owner access is protected and cannot be removed here.';}catch(e){status.textContent=e.message;}
 };
 $('staffAccessClose').onclick=()=>$('staffAccessDialog').close();
})();
