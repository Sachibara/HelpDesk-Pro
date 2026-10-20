// Retired: owners must never choose or transmit another member's password.
const headers={'Access-Control-Allow-Origin':'https://opsfusion-it.vercel.app','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
Deno.serve(req=>req.method==='OPTIONS'?new Response(null,{status:204,headers}):new Response(JSON.stringify({error:'Owner-created passwords are retired. Use Send Invitation in workspace settings.'}),{status:410,headers}));
