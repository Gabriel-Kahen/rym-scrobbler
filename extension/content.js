(() => {
  'use strict';
  const id = 'rym-scrobbler';
  const clean = v => (v || '').replace(/\s+/g, ' ').trim();
  const text = (node, selector) => clean(node?.querySelector(selector)?.textContent);
  function readPage() {
    const albumNode = document.querySelector('.album_title');
    const album = clean(albumNode?.firstChild?.textContent) || clean(albumNode?.textContent);
    const artistLinks = [...document.querySelectorAll("span[itemprop='byArtist'] > a")];
    let artist = artistLinks.map(link => clean([...link.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('')) || clean(link.textContent)).filter(Boolean).join(' / ');
    if (!artist) artist = clean(document.querySelectorAll('.credited_name')[1]?.textContent);
    const tracks = [...document.querySelectorAll('#tracks .tracklist_line')].filter(row => text(row, '.tracklist_num')).map(row => {
      const names = row.querySelectorAll('[itemprop="name"]');
      const source = names[names.length - 1] || row.querySelector('.rendered_text');
      const copy = source?.cloneNode(true);
      copy?.querySelectorAll('.artist').forEach(n => n.remove());
      const name = clean(copy?.textContent).replace(/^\s*[-–—]\s*/, '');
      const artists = [...row.querySelectorAll('.artist')].map(n => clean(n.textContent)).filter(Boolean);
      const parts = text(row, '.tracklist_duration').split(':').map(Number);
      const duration = parts.length >= 2 && parts.length <= 3 && parts.every(Number.isFinite) ? parts.reduce((sum, n) => sum * 60 + n, 0) : 0;
      return { row, track: name, artist: artist || artists.join(' / '), album, duration };
    }).filter(t => t.track);
    return { tracks };
  }
  function button(label, handler, extra = '') {
    const el = document.createElement('button'); el.type = 'button'; el.className = `rym-scrobble-button ${extra}`; el.textContent = label;
    el.addEventListener('click', event => { if (event.isTrusted) handler(event); }); return el;
  }
  let activeReview = null, preparing = false;
  function showReview(id, returnFocus) {
    const host = document.createElement('div');
    host.id = 'rym-scrobbler-overlay-host';
    const root = host.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; }
      .backdrop { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.72); padding: 16px; box-sizing: border-box; }
      iframe { display: block; width: min(720px,100%); height: min(580px, calc(100vh - 32px)); max-height: calc(100vh - 32px); border: 1px solid #4a4d55; border-radius: 12px; box-shadow: 0 18px 60px #000b; background: #111317; }
      @media(max-width: 480px) { .backdrop { padding: 8px; } iframe { width: 100%; max-height: calc(100vh - 16px); } }
    `;
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop'; backdrop.setAttribute('role','dialog');
    backdrop.setAttribute('aria-modal','true'); backdrop.setAttribute('aria-label','Review your scrobble');
    const frame = document.createElement('iframe'); frame.title = 'Review your scrobble';
    frame.src = chrome.runtime.getURL(`review.html?id=${encodeURIComponent(id)}`);
    backdrop.append(frame); root.append(style, backdrop); document.body.append(host);
    const extensionOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
    function close() {
      window.removeEventListener('message', onMessage);
      host.remove(); activeReview = null;
      if (returnFocus?.isConnected) returnFocus.focus();
    }
    function onMessage(event) {
      if (!event.isTrusted || event.origin !== extensionOrigin || event.source !== frame.contentWindow) return;
      if (event.data?.type === 'RYM_SCROBBLER_CLOSE') close();
      if (event.data?.type === 'RYM_SCROBBLER_RESIZE' && Number.isFinite(event.data.height)) {
        frame.style.height = `${Math.max(180, Math.min(1200, Math.ceil(event.data.height) + 2))}px`;
      }
    }
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', () => frame.focus(), {once:true});
    activeReview = {host, close};
  }
  function review(selected) {
    if (activeReview || preparing) return;
    preparing = true;
    const returnFocus = document.activeElement;
    const tracks = selected.map(({track, artist, album, duration}) => ({track, artist, album, duration}));
    chrome.runtime.sendMessage({type:'PREPARE_REVIEW', tracks}, response => {
      preparing = false;
      const error = chrome.runtime.lastError?.message || (!response?.ok && (response?.error || 'The extension did not respond.'));
      if (error) { alert(`Could not open the scrobble review: ${error}`); return; }
      if (typeof response.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(response.id)) { alert('Could not open the scrobble review.'); return; }
      showReview(response.id, returnFocus);
    });
  }
  function install() {
    const data = readPage(); if (!data.tracks.length) return;
    if (!document.getElementById(id + '-album')) {
      const host = document.querySelector('#tracks');
      const albumButton = button('Scrobble album', () => { const latest = readPage(); if (latest.tracks.length) review(latest.tracks); });
      albumButton.id = id + '-album'; host.parentElement.insertBefore(albumButton, host);
    }
  }
  install();
  let timer; const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(install, 400); });
  observer.observe(document.body, {childList:true, subtree:true});
})();
