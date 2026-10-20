import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('Retired owner-password endpoint cannot create or change accounts',async()=>{
 let handler;runInNewContext(readFileSync(new URL('../supabase/functions/opsfusion-staff-account/index.ts',import.meta.url),'utf8'),{Deno:{serve:fn=>handler=fn},Response});
 const r=await handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({password:'not-used'})}));assert.equal(r.status,410);assert.match((await r.json()).error,/Use Send Invitation/);
});
