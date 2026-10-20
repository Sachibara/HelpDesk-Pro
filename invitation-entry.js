// Support Auth's configured root fallback without exposing tokens to another origin.
(() => {
 const type=new URLSearchParams(location.hash.slice(1)).get('type');
 if(['magiclink','invite','signup'].includes(type))location.replace('/invitations'+location.hash);
 document.addEventListener('DOMContentLoaded',()=>{const gate=document.getElementById('employeePortalBtn');if(!gate)return;const link=document.createElement('a');link.href='/invitations';link.textContent='Review workspace invitations';link.className='btn secondary';gate.parentElement.append(link);});
})();
