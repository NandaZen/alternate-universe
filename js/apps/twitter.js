// X (gaya iOS, mode gelap): banyak akun per karakter, akun private, tweet / repost / quote / reply,
// foto, dan drawer ganti akun. Semua data dari Firestore (posts + karakter.twitterAccounts).
// Like hanya UI pembaca.

import { getState, subscribe, consumeFocus, setCharacter } from '../state.js';
import { registerApp } from '../navigation.js';
import {
  startStore, onStoreChange, isStoreReady, storeError, getCharacter, getPlayable, avatarHtml, getTimeline,
  accountsOf, getAccount, getPost, postsOfAccount, repliesTo, repostCount, canViewPost, postImages, eventLinks,
} from '../data/store.js';
import { icon } from '../icons.js';
import { esc, formatStamp, linkMentions, plural } from '../utils.js';
import { emptyState, linkChips } from '../ui.js';

let root;
const liked = new Set(); // like pembaca (UI saja, bukan data cerita)
const expanded = new Set();
const activeAccountOf = {}; // characterId -> accountId
let highlightPostId = null;
let drawerOpen = false;
let fresh = false; // true setelah ganti akun: scroll ke atas + fade-in

const first = (s) => String(s || '').split(' ')[0];

const safeLinks = (...args) => {
  try {
    return eventLinks(...args) || [];
  } catch {
    return [];
  }
};

/** Event cerita dicari dari timeline Firestore (event harus punya field id). */
function getEvent(id) {
  if (!id) return null;
  for (const day of getTimeline()) {
    const e = (day.events || []).find((x) => x.id === id);
    if (e) return e;
  }
  return null;
}

/* ---------- ikon ---------- */

const svg = (body, size = 24, sw = 1.8) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const X = {
  logo: (s = 26) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  home: (s = 26) => svg('<path d="M4 11l8-7 8 7v8.5a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>', s, 2),
  search: (s = 26) => svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', s, 2),
  bell: (s = 26) => svg('<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>', s, 2),
  mail: (s = 26) => svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>', s, 2),
  feather: (s = 26) => svg('<path d="M12 5v14M5 12h14"/>', s, 2.4),
  check: (s = 20) => svg('<path d="M5 12.5l4.5 4.5L19 7"/>', s, 2.6),
};

const lockIcon = (a) => (a?.private ? `<span class="xi-lock" title="Protected account" aria-label="Protected account">${icon('lock', 13)}</span>` : '');

/* ---------- akun ---------- */

function currentAccount(me) {
  const list = accountsOf(me.id);
  return list.find((a) => a.id === activeAccountOf[me.id]) || list[0] || null;
}

const ownerOf = (c, a) => ({ ...(c || {}), avatar: a?.avatarUrl || c?.avatar, name: a?.displayName || c?.name || '?' });

/* ---------- drawer ganti akun ---------- */

function accountRow(c, a, on) {
  const owner = ownerOf(c, a);
  return `<li><button type="button" class="xi-acct ${on ? 'is-on' : ''}" data-action="x-switch" data-char="${esc(c.id)}" data-id="${esc(a?.id || '')}" aria-pressed="${on}">
    ${avatarHtml(owner, 44)}
    <span class="xi-acct__txt">
      <strong>${esc(owner.name)} ${lockIcon(a)}</strong>
      <small>${a ? `@${esc(a.handle)}` : 'No X account'} · ${esc(first(c.name))}</small>
    </span>
    ${on ? `<span class="xi-acct__check">${X.check()}</span>` : ''}
  </button></li>`;
}

function drawerHtml(me, acct) {
  const rows = getPlayable()
    .flatMap((c) => {
      const list = accountsOf(c.id);
      if (!list.length) return [accountRow(c, null, c.id === me.id)];
      return list.map((a) => accountRow(c, a, c.id === me.id && !!acct && a.id === acct.id));
    })
    .join('');
  const owner = ownerOf(me, acct);
  return `<div class="xi-scrim" data-action="x-drawer"></div>
    <aside class="xi-drawer" aria-label="Accounts" aria-hidden="${!drawerOpen}">
      <div class="xi-drawer__me">
        ${avatarHtml(owner, 56)}
        <h2>${esc(owner.name)} ${lockIcon(acct)}</h2>
        <p>${acct ? `@${esc(acct.handle)}` : `@${esc(me.username || '')}`}</p>
        ${acct ? `<p class="xi-drawer__counts"><strong>${acct.following || 0}</strong> Following <strong>${acct.followers || 0}</strong> Followers</p>` : ''}
      </div>
      <p class="xi-drawer__label">Accounts</p>
      <ul class="xi-accts">${rows}</ul>
      <p class="xi-drawer__foot">Reading as ${esc(first(me.name))}</p>
    </aside>`;
}

/* ---------- profil & post ---------- */

function profileHeader(me, a) {
  const from = a.bannerFrom || me.accent || '#316342';
  const to = a.bannerTo || from;
  const owner = ownerOf(me, a);
  return `<section class="xi-profile">
    <div class="xi-banner" style="background:linear-gradient(120deg,${esc(from)},${esc(to)})"></div>
    <div class="xi-profile__row">${avatarHtml(owner, 80, 'xi-ring')}<span class="xi-pill">${a.private ? 'Protected' : 'Following'}</span></div>
    <h2>${esc(a.displayName)} ${lockIcon(a)}</h2>
    <p class="xi-handle">@${esc(a.handle)}</p>
    ${a.bio ? `<p class="xi-bio">${esc(a.bio)}</p>` : ''}
    <p class="xi-meta">${me.location ? `${icon('pin', 14)} ${esc(me.location)} &nbsp;` : ''}${a.joined ? `${icon('calendar', 14)} Joined ${esc(a.joined)}` : ''}</p>
    <p class="xi-counts"><strong>${a.following || 0}</strong> Following <strong>${a.followers || 0}</strong> Followers</p>
  </section>`;
}

function mediaHtml(p) {
  const imgs = postImages(p).slice(0, 4);
  if (!imgs.length) return '';
  return `<div class="xi-media xi-media--${imgs.length}">${imgs
    .map((src) => `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`)
    .join('')}</div>`;
}

function authorOf(p) {
  const c = getCharacter(p.characterId);
  const a = getAccount(p.characterId, p.accountId);
  return { c, a, owner: ownerOf(c, a) };
}

function headHtml(p) {
  const { a, owner } = authorOf(p);
  return `<p class="xi-head"><strong>${esc(owner.name)}</strong>${lockIcon(a)}<span>@${esc(a?.handle || '?')} · ${esc(formatStamp(p.timestamp))}</span></p>`;
}

/** Kartu kutipan / repost untuk postingan lain; menghormati akun private. */
function embedHtml(ref, viewerId) {
  if (!ref) return `<div class="xi-quote xi-quote--gone"><p>This post is unavailable.</p></div>`;
  if (!canViewPost(ref, viewerId)) {
    return `<div class="xi-quote xi-quote--gone">${icon('lock', 14)} <span>This post is from a protected account.</span></div>`;
  }
  const { a, owner } = authorOf(ref);
  return `<div class="xi-quote">
    <p class="xi-quote__head">${avatarHtml(owner, 20)} <strong>${esc(owner.name)}</strong>${lockIcon(a)} <span>@${esc(a?.handle || '?')} · ${esc(formatStamp(ref.timestamp))}</span></p>
    <p>${linkMentions(esc(ref.text || ''))}</p>
    ${mediaHtml(ref)}
  </div>`;
}

function replyThread(parentId, state, viewerId, depth = 0) {
  const replies = repliesTo(parentId, state).filter((r) => canViewPost(r, viewerId));
  if (!replies.length || depth > 3) return '';
  return `<ul class="xi-replies">${replies
    .map((r) => {
      const { owner } = authorOf(r);
      return `<li class="xi-reply">
        ${avatarHtml(owner, 34)}
        <div>${headHtml(r)}
          <p class="xi-text">${linkMentions(esc(r.text || ''))}</p>
          ${mediaHtml(r)}
          ${replyThread(r.id, state, viewerId, depth + 1)}
        </div>
      </li>`;
    })
    .join('')}</ul>`;
}

function post(entry, state) {
  const viewerId = state.activeCharacterId;
  const isRepost = entry.kind === 'retweet';
  const me = getCharacter(entry.characterId);
  const myAcct = getAccount(entry.characterId, entry.accountId);
  const shown = isRepost ? getPost(entry.refPostId) : entry;

  const label = isRepost
    ? `<p class="xi-label">${icon('repost', 14)} ${esc(myAcct?.displayName || me?.name || '')} reposted</p>`
    : entry.kind === 'reply'
      ? (() => {
          const parent = getPost(entry.replyToId);
          const pa = parent ? getAccount(parent.characterId, parent.accountId) : null;
          return pa ? `<p class="xi-label">Replying to <span class="mention">@${esc(pa.handle)}</span></p>` : '';
        })()
      : '';

  if (isRepost && (!shown || !canViewPost(shown, viewerId))) {
    return `<article class="xi-post" id="post-${esc(entry.id)}"><div class="xi-post__main">${label}${embedHtml(shown, viewerId)}</div></article>`;
  }

  const { owner } = authorOf(shown);
  const isLiked = liked.has(shown.id);
  const open = expanded.has(shown.id);
  const replies = repliesTo(shown.id, state).filter((r) => canViewPost(r, viewerId));
  const reposts = repostCount(shown, state);
  const likes = Number(shown.likes) || 0;
  const ev = shown.eventId ? getEvent(shown.eventId) : null;
  const links = ev ? safeLinks(shown.eventId, shown.characterId, { type: 'tweet', id: shown.id }) : [];
  const quote = shown.kind === 'quote' ? embedHtml(getPost(shown.refPostId), viewerId) : '';

  return `<article class="xi-post ${entry.id === highlightPostId ? 'is-highlight' : ''}" id="post-${esc(entry.id)}">
    ${avatarHtml(owner, 42)}
    <div class="xi-post__main">
      ${label}
      ${headHtml(shown)}
      ${shown.text ? `<p class="xi-text">${linkMentions(esc(shown.text))}</p>` : ''}
      ${mediaHtml(shown)}
      ${quote}
      <div class="xi-actions">
        <button type="button" class="xi-act ${open ? 'is-on' : ''}" data-action="toggle-replies" data-id="${esc(shown.id)}" aria-expanded="${open}" aria-label="${plural(replies.length, 'reply', 'replies')}">${icon('comment', 18)}<span>${replies.length}</span></button>
        <span class="xi-act">${icon('repost', 18)}<span>${reposts}</span></span>
        <button type="button" class="xi-act xi-like ${isLiked ? 'is-liked' : ''}" data-action="toggle-like" data-id="${esc(shown.id)}" data-base="${likes}" aria-pressed="${isLiked}" aria-label="Like">${icon('heart', 18, { fill: isLiked })}<span>${likes + (isLiked ? 1 : 0)}</span></button>
        ${shown.narrationId ? `<button type="button" class="xi-act xi-narr" data-action="open-narration" data-id="${esc(shown.narrationId)}" aria-label="Story behind this post" title="Story behind this post">${icon('info', 17)}</button>` : ''}
      </div>
      ${open ? replyThread(shown.id, state, viewerId) : ''}
      ${ev && links.length ? `<div class="xi-related"><p>Behind this post: ${esc(ev.title)}</p>${linkChips(links)}</div>` : ''}
    </div>
  </article>`;
}

/* ---------- render ---------- */

export function renderTwitter() {
  const state = getState();
  const me = getCharacter(state.activeCharacterId);
  if (!me) {
    root.innerHTML = `<div class="xi">${emptyState({ iconName: 'comment', title: isStoreReady() ? 'No character' : 'Loading…', text: storeError || 'Fetching accounts.' })}</div>`;
    return;
  }

  if (state.focus && state.focus.type === 'tweet') {
    const target = getPost(state.focus.id);
    if (target) {
      if (target.characterId === me.id) activeAccountOf[me.id] = getAccount(me.id, target.accountId)?.id;
      highlightPostId = target.id;
      expanded.add(target.id);
    }
    consumeFocus();
  }

  const acct = currentAccount(me);
  const posts = acct ? postsOfAccount(state, me.id, acct.id) : [];
  if (!posts.some((p) => p.id === highlightPostId)) highlightPostId = null;
  const scrollY = fresh ? 0 : root.querySelector('.xi-scroll')?.scrollTop || 0;
  const fade = fresh ? ' xi-fade' : '';
  fresh = false;

  const feed = !isStoreReady()
    ? emptyState({ iconName: 'comment', title: 'Loading…', text: 'Fetching posts.' })
    : storeError && !posts.length
      ? emptyState({ iconName: 'comment', title: 'Could not load posts', text: storeError })
      : posts.length
        ? `<div class="xi-feed">${posts.map((p) => post(p, state)).join('')}</div>`
        : emptyState({ iconName: 'comment', title: 'No posts', text: `@${acct?.handle || me.username || ''} didn't post ${state.scope === 'day' ? 'on this day' : 'by this day'}.` });

  const topAvatar = ownerOf(me, acct);

  root.innerHTML = `<div class="xi ${drawerOpen ? 'is-drawer' : ''}">
    <header class="xi-top">
      <button type="button" class="xi-me" data-action="x-drawer" aria-label="Switch account" aria-haspopup="true">${avatarHtml(topAvatar, 32)}</button>
      <span class="xi-logo">${X.logo(24)}</span>
      <span class="xi-top__space"></span>
    </header>
    <div class="xi-scroll${fade}">
      ${acct ? profileHeader(me, acct) : `<section class="xi-profile xi-profile--empty"><h2>${esc(me.name)}</h2><p class="xi-bio">No X account yet.</p></section>`}
      <div class="xi-tabs" role="tablist">
        <button type="button" role="tab" class="xi-tab ${state.scope === 'day' ? 'is-on' : ''}" aria-selected="${state.scope === 'day'}" data-action="set-scope" data-scope="day">This day</button>
        <button type="button" role="tab" class="xi-tab ${state.scope === 'upto' ? 'is-on' : ''}" aria-selected="${state.scope === 'upto'}" data-action="set-scope" data-scope="upto">Up to this day</button>
      </div>
      ${feed}
    </div>
    <span class="xi-fab" aria-hidden="true">${X.feather(26)}</span>
    <nav class="xi-bar" aria-hidden="true">${X.home()}${X.search()}${X.bell()}${X.mail()}</nav>
    ${drawerHtml(me, acct)}
  </div>`;

  const scroller = root.querySelector('.xi-scroll');
  const target = highlightPostId && root.querySelector(`#post-${CSS.escape(highlightPostId)}`);
  if (target) target.scrollIntoView({ block: 'center' });
  else if (scroller) scroller.scrollTop = scrollY;
}

/* ---------- init ---------- */

export function initTwitter(registerAction) {
  root = document.getElementById('app-twitter');

  // Like diperbarui langsung di tombolnya: tanpa render ulang, tanpa kedip, scroll tidak lompat.
  registerAction('toggle-like', (el) => {
    const id = el.dataset.id;
    const on = !liked.has(id);
    if (on) liked.add(id);
    else liked.delete(id);
    el.classList.toggle('is-liked', on);
    el.setAttribute('aria-pressed', String(on));
    el.innerHTML = `${icon('heart', 18, { fill: on })}<span>${(Number(el.dataset.base) || 0) + (on ? 1 : 0)}</span>`;
  });

  registerAction('toggle-replies', (el) => {
    const id = el.dataset.id;
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    highlightPostId = null;
    renderTwitter();
  });

  // Buka/tutup drawer lewat class saja, supaya transisi CSS berjalan mulus.
  registerAction('x-drawer', () => {
    drawerOpen = !drawerOpen;
    const box = root.querySelector('.xi');
    box?.classList.toggle('is-drawer', drawerOpen);
    box?.querySelector('.xi-drawer')?.setAttribute('aria-hidden', String(!drawerOpen));
  });

  // Ganti akun: pilih karakter + akun X-nya sekaligus.
  registerAction('x-switch', (el) => {
    const charId = el.dataset.char;
    if (!charId) return;
    if (el.dataset.id) activeAccountOf[charId] = el.dataset.id;
    drawerOpen = false;
    highlightPostId = null;
    fresh = true;
    if (!setCharacter(charId)) renderTwitter(); // karakter sama → render manual
  });

  registerApp('twitter', { root, render: renderTwitter });
  startStore();
  renderTwitter();
  subscribe(() => renderTwitter());
  onStoreChange(() => renderTwitter());
}