import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto, createHash} from 'node:crypto';
import worker from '../src/index.js';
const subtle = new Proxy(webcrypto.subtle, { get(target, prop) { if(prop==='digest') return async (algorithm,data) => algorithm==='MD5' ? Uint8Array.from(createHash('md5').update(data).digest()).buffer : target.digest(algorithm,data); const value=target[prop]; return typeof value==='function' ? value.bind(target) : value; } });
Object.defineProperty(globalThis,'crypto',{value:{subtle,getRandomValues:webcrypto.getRandomValues.bind(webcrypto)}, configurable:true});
const env={LASTFM_API_KEY:'a'.repeat(32),LASTFM_API_SECRET:'b'.repeat(32),SESSION_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),RATE_LIMITER:{limit:async()=>({success:true})}};
const req=(url, data)=>new Request('https://test.workers.dev'+url,{method:'POST',headers:{'content-type':'application/json','CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify(data)});
const track=(i=0)=>({artist:'Artist',track:'Song '+i,album:'Album',timestamp:Math.floor(Date.now()/1000)-120,duration:120});
let sent=[];
const realFetch=globalThis.fetch;
function mockLastFm() {
  sent=[];
  globalThis.fetch=async (url, options={}) => {
    const p=options.body || new URL(url).searchParams, fields=Object.fromEntries(p), signature=fields.api_sig;
    const sorted=Object.keys(fields).filter(k=>k!=='api_sig' && k!=='format').sort().map(k=>k+fields[k]).join('')+env.LASTFM_API_SECRET;
    assert.equal(signature,createHash('md5').update(sorted).digest('hex'));
    sent.push(fields);
    if(fields.method==='auth.getToken') return Response.json({token:'token1'});
    if(fields.method==='auth.getSession') return Response.json({session:{name:'listener',key:'secret-session-key'}});
    if(fields.method==='track.scrobble') {
      const count=Object.keys(fields).filter(k=>k.startsWith('track[')).length;
      return Response.json({scrobbles:{'@attr':{accepted:count,ignored:0},scrobble:[]}});
    }
    throw Error('unexpected method');
  };
}
async function connect(){let start=await (await worker.fetch(req('/auth/start',{}),env)).json(); assert.equal(start.ok,true); let finish=await (await worker.fetch(req('/auth/finish',{token:start.token}),env)).json(); assert.equal(finish.ok,true); return finish;}
test('connects, encrypts session, signs and batches scrobbles in ASCII order',async()=>{
  mockLastFm(); const finish=await connect(); assert.equal(finish.username,'listener'); assert(!finish.session.includes('secret-session-key'));
  const result=await (await worker.fetch(req('/scrobble',{session:finish.session,tracks:Array.from({length:51},(_,i)=>track(i))}),env)).json();
  assert.equal(result.ok,true); assert.equal(result.accepted,51); assert.equal(result.ignored,0); assert.equal(sent.filter(x=>x.method==='track.scrobble').length,2); assert.equal(sent[2]['sk'],'secret-session-key');
});
test('rejects tampered session and bad tracks without submitting',async()=>{
  mockLastFm(); const finish=await connect(); const changed=(finish.session[0]==='A'?'B':'A')+finish.session.slice(1);
  let res=await worker.fetch(req('/scrobble',{session:changed,tracks:[track()]}),env); assert.equal(res.status,400); assert.equal(sent.length,2);
  res=await worker.fetch(req('/scrobble',{session:finish.session,tracks:[{...track(),timestamp:Math.floor(Date.now()/1000)+100}]}),env); assert.equal(res.status,400); assert.equal(sent.length,2);
});
test('network failure after an accepted batch reports uncertainty',async()=>{
  mockLastFm(); const finish=await connect(); const initial=globalThis.fetch; let count=0;
  globalThis.fetch=async (url,opts)=>{if(opts?.method==='POST' && ++count===2) throw Error('network failure'); return initial(url,opts);};
  const result=await (await worker.fetch(req('/scrobble',{session:finish.session,tracks:Array.from({length:51},(_,i)=>track(i))}),env)).json();
  assert.equal(result.ok,false); assert.equal(result.accepted,50); assert.equal(result.uncertain,true);
});
test('rate limiter denies before any Last.fm call',async()=>{
  mockLastFm(); const result=await worker.fetch(req('/auth/start',{}),{...env,RATE_LIMITER:{limit:async()=>({success:false})}}); assert.equal(result.status,429); assert.equal(sent.length,0);
});
test.after(()=>{globalThis.fetch=realFetch});
