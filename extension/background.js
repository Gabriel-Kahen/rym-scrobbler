'use strict';
const BACKEND_ORIGIN = 'https://rym-scrobbler.gabekahen.workers.dev';
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
let sending = false;
async function request(path, payload) {
  if (!/^https:\/\/[a-z0-9][a-z0-9.-]*\.workers\.dev$/i.test(BACKEND_ORIGIN)) throw new Error('The service has not been configured yet.');
  let response;
  try { response = await fetch(BACKEND_ORIGIN + path, {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)}); }
  catch { throw new Error('Cannot reach the RYM Scrobbler service. Check your connection and try again.'); }
  let body; try { body = await response.json(); } catch { throw new Error('The service returned an unreadable response.'); }
  if (!response.ok && !body?.error) throw new Error(`Service unavailable (${response.status}).`);
  if (path === '/scrobble' && response.status >= 500 && body.uncertain !== false) body.uncertain = true;
  return body;
}
async function handle(message, sender) {
  await storageReady;
  const isPopup = sender.id === chrome.runtime.id && sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL('popup.html');
  const isReview = sender.id === chrome.runtime.id && sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL('review.html');
  const isRym = sender.id === chrome.runtime.id && sender.tab?.id != null && /^https:\/\/(?:www\.)?rateyourmusic\.com\/release\//i.test(sender.url || '');
  if (message.type === 'PREPARE_REVIEW' ? !isRym : ['REVIEW_DATA', 'SCROBBLE'].includes(message.type) ? !isReview : !isPopup) throw new Error('Request not permitted.');
  if (message.type === 'PREPARE_REVIEW') {
    if (!Array.isArray(message.tracks) || !message.tracks.length || message.tracks.length > 500) throw new Error('There are no valid tracks to review.');
    const tracks = message.tracks.map(t => {
      if (!t || typeof t !== 'object') throw new Error('Invalid track.');
      const fields = ['artist', 'track', 'album'].map(key => {
        if (typeof t[key] !== 'string' || t[key].length > 300) throw new Error('Invalid track details.');
        return t[key];
      });
      const duration = Number.isInteger(t.duration) && t.duration > 0 && t.duration <= 86400 ? t.duration : 0;
      return {artist:fields[0], track:fields[1], album:fields[2], duration};
    });
    const id = crypto.randomUUID(), key = `review:${id}`;
    await chrome.storage.session.set({[key]:{tracks, created:Date.now(), tabId:sender.tab.id}});
    return {ok:true, id};
  }
  if (message.type === 'REVIEW_DATA') {
    if (typeof message.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(message.id)) throw new Error('Invalid review.');
    const key = `review:${message.id}`, data = await chrome.storage.session.get(key), review = data[key];
    if (!review || !sender.tab || sender.tab.id !== review.tabId || !sender.frameId || Date.now() - review.created > 600000) throw new Error('This review has expired. Open it again from RYM.');
    await chrome.storage.session.remove(key);
    return {ok:true, tracks:review.tracks};
  }
  const data = await chrome.storage.local.get(['session', 'username', 'pendingToken']);
  if (message.type === 'STATUS') return {ok:true, connected: Boolean(data.session), username:data.username || '', pending:Boolean(data.pendingToken)};
  if (message.type === 'DISCONNECT') { await chrome.storage.local.remove(['session','username','pendingToken']); return {ok:true}; }
  if (message.type === 'BEGIN_AUTH') {
    const result = await request('/auth/start', {});
    if (!result.ok || typeof result.token !== 'string' || typeof result.authorizationUrl !== 'string') throw new Error(result.error || 'Could not start Last.fm authorization.');
    const url = new URL(result.authorizationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'www.last.fm' || url.pathname !== '/api/auth/') throw new Error('Invalid Last.fm authorization address.');
    await chrome.storage.local.set({pendingToken:result.token});
    await chrome.tabs.create({url:url.href});
    return {ok:true};
  }
  if (message.type === 'FINISH_AUTH') {
    if (!data.pendingToken) throw new Error('Start connecting first.');
    const result = await request('/auth/finish', {token:data.pendingToken});
    if (!result.ok || typeof result.session !== 'string' || typeof result.username !== 'string') throw new Error(result.error || 'Last.fm authorization is not complete.');
    await chrome.storage.local.set({session:result.session,username:result.username});
    await chrome.storage.local.remove('pendingToken');
    return {ok:true,username:result.username};
  }
  if (message.type === 'SCROBBLE') {
    if (!data.session) throw new Error('Open RYM Scrobbler and connect your Last.fm account first.');
    if (sending) throw new Error('A scrobble request is already in progress.');
    if (!Array.isArray(message.tracks) || !message.tracks.length || message.tracks.length > 500) throw new Error('There are no valid tracks to scrobble.');
    sending = true;
    try {
      return await request('/scrobble', {session:data.session, tracks:message.tracks});
    } catch(error) {
      return {ok:false, error:`${error.message} Check Last.fm before retrying; the request may have been submitted.`, uncertain:true};
    } finally { sending = false; }
  }
  throw new Error('Unknown request.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message || {}, sender).then(respond, error => respond({ok:false,error:error.message || 'Something went wrong.'}));
  return true;
});
