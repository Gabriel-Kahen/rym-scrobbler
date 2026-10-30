'use strict';
const form = document.getElementById('review-form');
const list = document.getElementById('tracks');
const status = document.getElementById('status');
const submit = document.getElementById('submit');
const cancel = document.getElementById('cancel');
const finishTime = document.getElementById('finish-time');
const album = document.getElementById('album');
const artist = document.getElementById('artist');
const clean = value => (value || '').replace(/\s+/g, ' ').trim();
const inputs = [];
let selected = [];
function updateSelection() {
  const count = inputs.filter(fields => fields.include.checked).length;
  document.getElementById('selection-count').textContent = `${count} of ${inputs.length} selected`;
  for (const fields of inputs) {
    const disabled = !fields.include.checked;
    for (const input of [fields.track, fields.start]) input.disabled = disabled;
    fields.group.classList.toggle('unselected', disabled);
  }
  if (status.textContent === 'Select at least one track to scrobble.') status.textContent = '';
}
document.getElementById('select-all').addEventListener('click', () => { inputs.forEach(fields => { fields.include.checked = true; }); updateSelection(); });
document.getElementById('clear-selection').addEventListener('click', () => { inputs.forEach(fields => { fields.include.checked = false; }); updateSelection(); });
// Keep the containing pop-up snug to its content. The parent verifies the
// extension origin and the sending frame before accepting resize messages.
if (window.parent !== window) {
  const main = document.querySelector('main');
  const reportSize = () => window.parent.postMessage({type:'RYM_SCROBBLER_RESIZE', height:main.getBoundingClientRect().height}, '*');
  new ResizeObserver(reportSize).observe(main);
}
function localTime(date) {
  const two = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth()+1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}
finishTime.value = localTime(new Date());
function recalculate() {
  let cursor = Math.floor(new Date(finishTime.value).getTime() / 1000);
  if (!Number.isFinite(cursor)) return;
  for (let i=selected.length-1; i>=0; i--) {
    cursor -= selected[i].duration || 180;
    if (!inputs[i].overridden) inputs[i].start.value = localTime(new Date(cursor * 1000));
  }
}
finishTime.addEventListener('input', recalculate);
function field(label, value, parent) {
  const wrap = document.createElement('label');
  const caption = document.createElement('span'); caption.textContent = label;
  const input = document.createElement('input'); input.value = value; input.required = true; input.maxLength = 300;
  wrap.append(caption, input); parent.append(wrap); return input;
}
function showReview(tracks) {
  selected = tracks;
  album.value = tracks[0].album || '';
  artist.value = tracks[0].artist || '';
  document.getElementById('title').textContent = tracks.length === 1 ? 'Scrobble song' : `Scrobble album · ${tracks.length} tracks`;
  tracks.forEach((item, index) => {
    const group = document.createElement('fieldset');
    group.className = 'track-row';
    const row = document.createElement('div'); row.className = 'track-summary';
    const choice = document.createElement('label'); choice.className = 'track-choice';
    const include = document.createElement('input'); include.type = 'checkbox'; include.checked = true;
    include.setAttribute('aria-label', `Include track ${index + 1}: ${item.track}`);
    include.addEventListener('change', updateSelection);
    const choiceText = document.createElement('span'); choiceText.className = 'track-title'; choiceText.textContent = item.track;
    choice.append(include, choiceText);
    const duration = document.createElement('span'); duration.className = 'track-duration';
    duration.textContent = item.duration ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2,'0')}` : '—';
    duration.title = item.duration ? 'Track duration' : 'Duration unavailable; 3 minutes will be used for timing.';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'edit-track'; edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit track ${index + 1}: ${item.track}`);
    edit.setAttribute('aria-expanded', 'false');
    const editor = document.createElement('div'); editor.className = 'track-editor'; editor.id = `track-editor-${index}`; editor.hidden = true;
    edit.setAttribute('aria-controls', editor.id);
    const setExpanded = expanded => { editor.hidden = !expanded; edit.setAttribute('aria-expanded', String(expanded)); edit.textContent = expanded ? 'Done' : 'Edit'; };
    edit.addEventListener('click', () => setExpanded(editor.hidden));
    row.append(choice, duration, edit); group.append(row, editor);
    const fields = {track:field('Song',item.track,editor), overridden:false};
    fields.include = include; fields.group = group; fields.setExpanded = setExpanded;
    fields.track.addEventListener('input', () => { choiceText.textContent = fields.track.value || item.track; });
    const startLabel = document.createElement('label'); startLabel.className = 'track-start';
    const caption = document.createElement('span'); caption.textContent = 'Track started';
    fields.start = document.createElement('input'); fields.start.type = 'datetime-local'; fields.start.step = '1'; fields.start.required = true;
    fields.start.addEventListener('input', () => { fields.overridden = true; });
    startLabel.append(caption, fields.start); editor.append(startLabel); inputs.push(fields);
    list.append(group);
  });
  recalculate(); updateSelection(); submit.disabled = false;
}
function closeReview() {
  // An embedded review asks its hosting content script to remove the overlay.
  // The sender's extension origin and iframe identity are checked by the host.
  if (window.parent !== window) {
    // No private data is sent. The content script verifies the iframe identity
    // and extension origin before honoring this close-only message.
    window.parent.postMessage({type:'RYM_SCROBBLER_CLOSE'}, '*');
  } else window.close();
}
cancel.addEventListener('click', closeReview);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !cancel.disabled) closeReview(); });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!event.isTrusted || submit.disabled) return;
  if (!inputs.some(fields => fields.include.checked)) { status.textContent = 'Select at least one track to scrobble.'; return; }
  const invalid = inputs.find(fields => fields.include.checked && [fields.track, fields.start].some(input => !input.validity.valid));
  if (invalid) invalid.setExpanded(true);
  if (!form.reportValidity()) return;
  const finished = Math.floor(new Date(finishTime.value).getTime() / 1000);
  if (!Number.isFinite(finished) || finished > Math.floor(Date.now() / 1000)) { status.textContent = 'Choose a valid finish time that is not in the future.'; return; }
  const tracks = selected.map((item, i) => inputs[i].include.checked ? ({artist:clean(artist.value), track:clean(inputs[i].track.value), album:clean(album.value), duration:item.duration || 180, timestamp:Math.floor(new Date(inputs[i].start.value).getTime() / 1000)}) : null).filter(Boolean);
  if (tracks.some(t => !t.artist || !t.track || !t.album)) { status.textContent = 'Please fill in the album, artist, and selected song names.'; return; }
  if (tracks.some(t => !Number.isFinite(t.timestamp) || t.timestamp < 1 || t.timestamp > finished) || tracks.some((t, i) => i > 0 && t.timestamp < tracks[i-1].timestamp)) {
    status.textContent = 'Track start times must be valid, in track order, and no later than the finish time.'; return;
  }
  submit.disabled = true; cancel.disabled = true; status.textContent = 'Sending scrobbles…';
  chrome.runtime.sendMessage({type:'SCROBBLE', tracks}, response => {
    cancel.disabled = false;
    const runtimeError = chrome.runtime.lastError?.message;
    const error = runtimeError || (!response?.ok && (response?.error || 'The extension did not respond.'));
    const uncertain = Boolean(runtimeError || response?.uncertain || !response);
    const accepted = Number(response?.accepted ?? response?.count) || 0;
    const ignored = Number(response?.ignored) || 0;
    const details = Array.isArray(response?.details) ? response.details.map(d => typeof d === 'string' ? d : (d.message || d.reason || '')).filter(Boolean).join('; ') : (typeof response?.details === 'string' ? response.details : '');
    if (error) {
      status.textContent = accepted > 0 ? `${error} ${accepted} scrobble(s) already accepted${ignored ? `; ${ignored} ignored` : ''}. Check Last.fm before retrying to avoid duplicates.${details ? ` Details: ${details}` : ''}` : error;
      if (uncertain && !accepted) status.textContent += ' The batch may have been submitted. Check Last.fm before retrying to avoid duplicates.';
      if (accepted > 0 || uncertain) { submit.remove(); cancel.textContent = 'Close'; } else submit.disabled = false;
      return;
    }
    status.textContent = `Last.fm accepted ${response.accepted ?? response.count ?? tracks.length} scrobble(s)${ignored ? `; ${ignored} ignored` : ''}.` + (details ? ` Details: ${details}` : '');
    submit.remove(); cancel.textContent = 'Close';
  });
});
const id = new URL(location.href).searchParams.get('id');
chrome.runtime.sendMessage({type:'REVIEW_DATA', id}, response => {
  const error = chrome.runtime.lastError?.message || (!response?.ok && (response?.error || 'The review could not be opened.'));
  if (error) { status.textContent = error; return; }
  if (!Array.isArray(response.tracks) || !response.tracks.length) { status.textContent = 'No tracks to review.'; return; }
  showReview(response.tracks);
});
