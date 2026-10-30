'use strict';
const $ = id => document.getElementById(id);
async function send(type) {
  const result = await chrome.runtime.sendMessage({type});
  if (!result?.ok) throw new Error(result?.error || 'The extension could not complete that request.');
  return result;
}
function notice(text, success = false) { $('status').textContent = text; $('status').className = success ? 'success' : ''; }
async function refresh() {
  const status = await send('STATUS');
  $('connected').hidden = !status.connected; $('setup').hidden = status.connected;
  $('authSteps').hidden = !status.pending; $('username').textContent = status.username;
}
async function run(button, fn) {
  button.disabled = true; notice('');
  try { await fn(); } catch(error) { notice(error.message); } finally { button.disabled = false; }
}
$('authorize').addEventListener('click', () => run($('authorize'), async () => {
  if (!$('consent').checked) throw new Error('Please agree to the data use before connecting.');
  await send('BEGIN_AUTH'); await refresh(); notice('Approve access on Last.fm, then return here and finish connecting.',true);
}));
$('finish').addEventListener('click', () => run($('finish'), async () => {
  await send('FINISH_AUTH'); await refresh(); notice('Connected. You can now scrobble from an RYM release page.',true);
}));
$('disconnect').addEventListener('click', () => run($('disconnect'), async () => {
  await send('DISCONNECT'); await refresh(); notice('Disconnected from this browser. You can also revoke access in Last.fm settings.',true);
}));
refresh().catch(error => notice(error.message));
