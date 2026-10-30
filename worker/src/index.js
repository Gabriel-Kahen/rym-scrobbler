// Last.fm uses MD5 for legacy request signatures; session protection uses AES-GCM.
const API = 'https://ws.audioscrobbler.com/2.0/';
const AUTH = 'https://www.last.fm/api/auth/';
const AAD = new TextEncoder().encode('rym-scrobbler-session-v1');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_BODY = 120_000;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type', 'X-Content-Type-Options': 'nosniff'
}});
const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function base64ToBytes(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str) || str.length > 4096) throw Error('Invalid session');
  const s = str.replaceAll('-','+').replaceAll('_','/');
  return Uint8Array.from(atob(s + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
}
async function encryptionKey(env) {
  const bytes = base64ToBytes(String(env.SESSION_ENCRYPTION_KEY || '').replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''));
  if (bytes.length !== 32) throw Error('Server configuration error');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);
}
async function seal(sessionKey, username, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = encoder.encode(JSON.stringify({key:sessionKey, username}));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD}, await encryptionKey(env), body));
  const result = new Uint8Array(iv.length + encrypted.length); result.set(iv); result.set(encrypted, iv.length);
  return bytesToBase64(result);
}
async function unseal(value, env) {
  try {
    const bytes = base64ToBytes(value); if (bytes.length < 29) throw Error();
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:AAD}, await encryptionKey(env), bytes.slice(12));
    const data = JSON.parse(decoder.decode(plain));
    if (typeof data.key !== 'string' || !data.key || typeof data.username !== 'string' || !data.username) throw Error();
    return data;
  } catch { throw new InputError('Your Last.fm connection is invalid. Please reconnect.'); }
}
class InputError extends Error {}
class ApiError extends Error {}
async function signed(method, params, env, post = false) {
  if (!/^[a-f\d]{32}$/i.test(env.LASTFM_API_KEY || '') || !/^[a-f\d]{32}$/i.test(env.LASTFM_API_SECRET || '')) throw Error('Server configuration error');
  const fields = {method, api_key:env.LASTFM_API_KEY, ...params};
  const message = Object.keys(fields).sort().map(k => k + fields[k]).join('') + env.LASTFM_API_SECRET;
  const digest = new Uint8Array(await crypto.subtle.digest('MD5', encoder.encode(message)));
  const sig = Array.from(digest, x => x.toString(16).padStart(2,'0')).join('');
  const body = new URLSearchParams({...fields, api_sig:sig, format:'json'});
  const response = await fetch(post ? API : `${API}?${body}`, post ? {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body} : {});
  let value; try { value = await response.json(); } catch { throw Error('Last.fm returned an unreadable response.'); }
  if (!response.ok || value.error) throw new ApiError(value.message || `Last.fm returned an error (${response.status}).`);
  return value;
}
const field = (v, name, required = true) => {
  if (!required && (v === undefined || v === null || v === '')) return '';
  if (typeof v !== 'string' || !v.trim() || v.length > 300) throw new InputError(`Invalid ${name}.`);
  return v.trim();
};
function validateTracks(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 500) throw new InputError('Choose between 1 and 500 tracks.');
  const now = Math.floor(Date.now()/1000);
  return items.map(t => {
    if (!t || typeof t !== 'object') throw new InputError('Invalid track.');
    const artist = field(t.artist, 'artist'), track = field(t.track, 'track'), album = field(t.album, 'album', false);
    if (!Number.isInteger(t.timestamp) || t.timestamp < 1 || t.timestamp > now) throw new InputError('A track has an invalid timestamp.');
    if (t.duration != null && (!Number.isInteger(t.duration) || t.duration <= 0 || t.duration > 86400)) throw new InputError('A track has an invalid duration.');
    return {artist,track,album,timestamp:t.timestamp,duration:t.duration};
  });
}
async function body(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InputError('Expected JSON.');
  const declared = Number(request.headers.get('content-length')); if (declared > MAX_BODY) throw new InputError('Request too large.');
  if (!request.body) throw new InputError('Invalid JSON.');
  const reader = request.body.getReader(); const chunks = []; let length = 0;
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    length += value.length;
    if (length > MAX_BODY) { await reader.cancel(); throw new InputError('Request too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  let val; try { val = JSON.parse(decoder.decode(bytes)); } catch { throw new InputError('Invalid JSON.'); }
  if (!val || typeof val !== 'object' || Array.isArray(val)) throw new InputError('Invalid request.');
  return val;
}
async function scrobble(items, session, env) {
  let accepted = 0, ignored = 0; const details = [];
  for (let offset = 0; offset < items.length; offset += 50) {
    const batch = items.slice(offset,offset+50), fields = {sk:session.key};
    batch.forEach((t,i) => {
      fields[`artist[${i}]`] = t.artist; fields[`track[${i}]`] = t.track; fields[`timestamp[${i}]`] = t.timestamp;
      if (t.album) fields[`album[${i}]`] = t.album;
      if (t.duration) fields[`duration[${i}]`] = t.duration;
    });
    let result;
    try { result = await signed('track.scrobble', fields, env, true); }
    catch (e) { return {ok:false,error:e instanceof ApiError ? e.message : 'Last.fm did not confirm the batch. Check your profile before retrying.',accepted,ignored,details,uncertain:!(e instanceof ApiError)}; }
    const summary = result.scrobbles?.['@attr'];
    if (!summary || !Number.isInteger(Number(summary.accepted)) || !Number.isInteger(Number(summary.ignored))) return {ok:false,error:'Last.fm did not confirm the batch. Check your profile before retrying.',accepted,ignored,details,uncertain:true};
    accepted += Number(summary.accepted); ignored += Number(summary.ignored);
    const records = Array.isArray(result.scrobbles.scrobble) ? result.scrobbles.scrobble : [result.scrobbles.scrobble];
    records.forEach((item,i) => { const reason = item?.ignoredMessage || item?.ignoredmessage; if (Number(reason?.code)) details.push({index:offset+i,track:batch[i]?.track,code:Number(reason.code),reason:reason['#text'] || ''}); });
  }
  return {ok:true,accepted,ignored,details};
}
export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'}});
      if (request.method !== 'POST') return json({ok:false,error:'Method not allowed.'},405);
      const path = new URL(request.url).pathname;
      if (!['/auth/start','/auth/finish','/scrobble'].includes(path)) return json({ok:false,error:'Not found.'},404);
      if (!env.RATE_LIMITER) throw Error('Server rate limiter is not configured.');
      const client = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (!(await env.RATE_LIMITER.limit({key:client})).success) return json({ok:false,error:'Too many requests. Try again shortly.'},429);
      const data = await body(request);
      if (path === '/auth/start') {
        const result = await signed('auth.getToken',{},env);
        if (typeof result.token !== 'string' || !result.token) throw Error('Last.fm did not return a token.');
        const url = new URL(AUTH); url.searchParams.set('api_key',env.LASTFM_API_KEY); url.searchParams.set('token',result.token);
        return json({ok:true,token:result.token,authorizationUrl:url.href});
      }
      if (path === '/auth/finish') {
        const token = field(data.token, 'authorization token');
        const result = await signed('auth.getSession',{token},env);
        if (!result.session?.key || !result.session?.name) throw Error('Last.fm did not return a session.');
        return json({ok:true,session:await seal(result.session.key,result.session.name,env),username:result.session.name});
      }
      const items = validateTracks(data.tracks); const session = await unseal(data.session,env);
      return json(await scrobble(items,session,env));
    } catch (e) {
      if (e instanceof InputError) return json({ok:false,error:e.message},400);
      if (e instanceof ApiError) return json({ok:false,error:e.message},502);
      return json({ok:false,error:'The service could not complete the request. Please try again.'},500);
    }
  }
};
