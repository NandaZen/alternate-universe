// X (Twitter): banyak akun per karakter, akun private, tweet / repost / quote / reply, foto.
// Semua data dari Firestore (koleksi posts + karakter.twitterAccounts). Like hanya UI pembaca.

import { getState, subscribe, consumeFocus } from '../state.js';
import { registerApp } from '../navigation.js';
import {
  startStore, onStoreChange, isStoreReady, storeError, getCharacter, getPlayable, avatarHtml,
  accountsOf, getAccount, getPost, postsOfAccount, repliesTo, repostCount, canViewPost, postImages, eventLinks,
} from '../data/store.js';
import { getEvent } from '../data/timeline.js';
import { brand, icon } from '../icons.js';
import { esc, formatFullStamp, formatStamp, linkMentions, plural } from '../utils.js';
import { emptyState, linkChips } from '../ui.js';

let root;
const liked = new Set(); // like pembaca (UI saja, bukan data cerita)
const expanded = new Set();
const activeAccountOf = {}; // characterId -> accountId
let highlightPostId = null;

const safeLinks = (...args) => {
  try {
    return eventLinks(...args) || [];
  } catch {
    return [];
  }
};

const lockIcon = (a) => (a?.private ? `<span class="x-lock" title="Protected account" aria-label="Protected account">${icon('lock', 13)}</span>` : '');

function currentAccount(me) {
  const list = accountsOf(me.id);
  return list.find((a) => a.id === activeAccountOf[me.id]) || list[0] || null;
}

function switchers(state, me, acct) {
  const chars = getPlayable()
    .map(
      (c) => `<button type="button" class="account-switch__btn ${c.id === state.activeCharacterId ? 'is-active' : ''}" data-action="set-character" data-id="${esc(c.id)}" aria-pressed="${c.id === state.activeCharacterId}">
          ${avatarHtml(c, 24)}<span>${esc(c.name.split(' ')[0])}</span>
        </button>`
    )
    .join('');
  const accts = accountsOf(me.id);
  const acctRow =
    accts.length > 1
      ? `<div class="account-switch account-switch--accounts" role="group" aria-label="X accounts of ${esc(me.name)}">${accts
          .map(
            (a) => `<button type="button" class="account-switch__btn ${acct && a.id === acct.id ? 'is-active' : ''}" data-action="set-x-account" data-id="${esc(a.id)}" aria-pressed="${!!acct && a.id === acct.id}">
              ${avatarHtml({ ...me, avatar: a.avatarUrl, name: a.displayName }, 24)}<span>@${esc(a.handle)}</span>${lockIcon(a)}
            </button>`
          )
          .join('')}</div>`
      : '';
  return `<div class="account-switch account-switch--x" role="group" aria-label="Character">${chars}</div>${acctRow}`;
}

function profileHeader(me, a) {
  const from = a.bannerFrom || me.accent || '#316342';
  const to = a.bannerTo || from;
  const avatarOwner = { ...me, avatar: a.avatarUrl, name: a.displayName };
  return `<section class="x-profile">
    <div class="x-profile__banner" style="background:linear-gradient(120deg,${esc(from)},${esc(to)})"></div>
    <div class="x-profile__row">${avatarHtml(avatarOwner, 84, 'avatar--ring')}<span class="x-profile__btn">${a.private ? 'Protected' : 'Following'}</span></div>
    <h2>${esc(a.displayName)} ${lockIcon(a)}</h2>
    <p class="x-profile__user">@${esc(a.handle)}</p>
    <p class="x-profile__bio">${esc(a.bio || '')}</p>
    <p class="x-profile__meta">${me.location ? `${icon('pin', 14)} ${esc(me.location)} &nbsp;` : ''}${a.joined ? `${icon('calendar', 14)} Joined ${esc(a.joined)}` : ''}</p>
    <p class="x-profile__counts"><strong>${a.following || 0}</strong> Following <strong>${a.followers || 0}</strong> Followers</p>
  </section>`;
}

function mediaHtml(p) {
  const imgs = postImages(p).slice(0, 4);
  if (!imgs.length) return '';
  return `<div class="x-media x-media--${imgs.length}">${imgs
    .map((src) => `<img class="x-post__media" src="${esc(src)}" alt="" loading="lazy" decoding="async">`)
    .join('')}</div>`;
}

function authorOf(p) {
  const c = getCharacter(p.characterId);
  const a = getAccount(p.characterId, p.accountId);
  return { c, a, owner: { ...(c || {}), avatar: a?.avatarUrl || c?.avatar, name: a?.displayName || c?.name || '?' } };
}

function headHtml(p) {
  const { a, owner } = authorOf(p);
  return `<p class="x-post__head"><strong>${esc(owner.name)}</strong> ${lockIcon(a)} <span>@${esc(a?.handle || '?')} · ${esc(formatStamp(p.timestamp))}</span></p>`;
}

/** Kartu kutipan / repost untuk postingan lain; menghormati akun private. */
function embedHtml(ref, viewerId) {
  if (!ref) return `<div class="x-quote x-quote--gone"><p class="muted">This post is unavailable.</p></div>`;
  if (!canViewPost(ref, viewerId)) {
    return `<div class="x-quote x-quote--gone">${icon('lock', 14)} <span>This post is from a protected account.</span></div>`;
  }
  const { a, owner } = authorOf(ref);
  return `<div class="x-quote">
    <p class="x-quote__head">${avatarHtml(owner, 20)} <strong>${esc(owner.name)}</strong> ${lockIcon(a)} <span>@${esc(a?.handle || '?')} · ${esc(formatStamp(ref.timestamp))}</span></p>
    <p>${linkMentions(esc(ref.text || ''))}</p>
    ${mediaHtml(ref)}
  </div>`;
}

function replyThread(parentId, state, viewerId, depth = 0) {
  const replies = repliesTo(parentId, state).filter((r) => canViewPost(r, viewerId));
  if (!replies.length || depth > 3) return '';
  return `<ul class="x-replies">${replies
    .map((r) => {
      const { owner } = authorOf(r);
      return `<li class="x-reply">
        ${avatarHtml(owner, 36)}
        <div>${headHtml(r).replace('x-post__head', 'x-reply__head')}
          <p>${linkMentions(esc(r.text || ''))}</p>
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
    ? `<p class="x-repost-label">${icon('repost', 14)} ${esc(myAcct?.displayName || me?.name || '')} reposted</p>`
    : entry.kind === 'reply'
      ? (() => {
          const parent = getPost(entry.replyToId);
          const pa = parent ? getAccount(parent.characterId, parent.accountId) : null;
          return pa ? `<p class="x-reply-to">Replying to <span class="mention">@${esc(pa.handle)}</span></p>` : '';
        })()
      : '';

  if (isRepost && (!shown || !canViewPost(shown, viewerId))) {
    return `<article class="x-post" id="post-${esc(entry.id)}"><div class="x-post__main">${label}${embedHtml(shown, viewerId)}</div></article>`;
  }

  const { owner, a } = authorOf(shown);
  const isLiked = liked.has(shown.id);
  const open = expanded.has(shown.id);
  const replies = repliesTo(shown.id, state).filter((r) => canViewPost(r, viewerId));
  const reposts = repostCount(shown, state);
  const ev = shown.eventId ? getEvent(shown.eventId) : null;
  const links = ev ? safeLinks(shown.eventId, shown.characterId, { type: 'tweet', id: shown.id }) : [];
  const quote = shown.kind === 'quote' ? embedHtml(getPost(shown.refPostId), viewerId) : '';

  return `<article class="x-post ${entry.id === highlightPostId ? 'is-highlight' : ''}" id="post-${esc(entry.id)}">
    ${avatarHtml(owner, 44)}
    <div class="x-post__main">
      ${label}
      ${headHtml(shown)}
      ${shown.text ? `<p class="x-post__text">${linkMentions(esc(shown.text))}</p>` : ''}
      ${mediaHtml(shown)}
      ${quote}
      <p class="x-post__time">${esc(formatFullStamp(shown.timestamp))}${a?.private ? ` · ${icon('lock', 12)} Protected` : ''}</p>
      <div class="x-post__actions">
        <button type="button" data-action="toggle-replies" data-id="${esc(shown.id)}" aria-expanded="${open}" aria-label="${plural(replies.length, 'reply', 'replies')}">${icon('comment', 17)} ${replies.length}</button>
        <span class="x-act">${icon('repost', 17)} ${reposts}</span>
        <button type="button" class="${isLiked ? 'is-liked' : ''}" data-action="toggle-like" data-id="${esc(shown.id)}" aria-pressed="${isLiked}" aria-label="Like">${icon('heart', 17, { fill: isLiked })} ${(shown.likes || 0) + (isLiked ? 1 : 0)}</button>
        ${shown.narrationId ? `<button type="button" class="narr-btn" data-action="open-narration" data-id="${esc(shown.narrationId)}" aria-label="Story behind this post" title="Story behind this post">${icon('info', 15)}</button>` : ''}
      </div>
      ${open ? replyThread(shown.id, state, viewerId) : ''}
      ${ev && links.length ? `<div class="related"><p class="eyebrow">Behind this post: ${esc(ev.title)}</p>${linkChips(links)}</div>` : ''}
    </div>
  </article>`;
}

export function renderTwitter() {
  const state = getState();
  const me = getCharacter(state.activeCharacterId);
  if (!me) {
    root.innerHTML = emptyState({ iconName: 'comment', title: isStoreReady() ? 'No character' : 'Loading…', text: storeError || 'Fetching accounts.' });
    return;
  }

  if (state.focus && state.focus.type === 'tweet') {
    const target = getPost(state.focus.id);
    if (target) {
      const owner = target.characterId === me.id ? target : null;
      if (owner) activeAccountOf[me.id] = getAccount(me.id, target.accountId)?.id;
      highlightPostId = target.id;
      expanded.add(target.id);
    }
    consumeFocus();
  }

  const acct = currentAccount(me);
  const posts = acct ? postsOfAccount(state, me.id, acct.id) : [];
  if (!posts.some((p) => p.id === highlightPostId)) highlightPostId = null;
  const scrollY = root.querySelector('.x-body')?.scrollTop || 0;

  const feed = !isStoreReady()
    ? emptyState({ iconName: 'comment', title: 'Loading…', text: 'Fetching posts.' })
    : storeError && !posts.length
      ? emptyState({ iconName: 'comment', title: 'Could not load posts', text: storeError })
      : posts.length
        ? `<div class="x-feed">${posts.map((p) => post(p, state)).join('')}</div>`
        : emptyState({ iconName: 'comment', title: 'No posts', text: `@${acct?.handle || me.username} didn't post ${state.scope === 'day' ? 'on this day' : 'by this day'}.` });

  root.innerHTML = `
    <header class="x-top">
      <div class="x-top__title"><span class="x-logo">${brand('x', 20)}</span><h1>X</h1></div>
      ${switchers(state, me, acct)}
    </header>
    <div class="x-body">
      <div class="x-col">
        ${acct ? profileHeader(me, acct) : `<section class="x-profile"><h2>${esc(me.name)}</h2><p class="x-profile__bio">No X account yet.</p></section>`}
        <div class="x-tabs"><span>Posts</span><div class="segmented">
          <button type="button" class="segmented__btn ${state.scope === 'day' ? 'is-active' : ''}" data-action="set-scope" data-scope="day">This day</button>
          <button type="button" class="segmented__btn ${state.scope === 'upto' ? 'is-active' : ''}" data-action="set-scope" data-scope="upto">Up to this day</button>
        </div></div>
        ${feed}
      </div>
    </div>`;

  const body = root.querySelector('.x-body');
  const target = highlightPostId && root.querySelector(`#post-${CSS.escape(highlightPostId)}`);
  if (target) target.scrollIntoView({ block: 'center' });
  else if (body) body.scrollTop = scrollY;
}

export function initTwitter(registerAction) {
  root = document.getElementById('app-twitter');
  registerAction('toggle-like', (el) => {
    const id = el.dataset.id;
    liked.has(id) ? liked.delete(id) : liked.add(id);
    renderTwitter();
  });
  registerAction('toggle-replies', (el) => {
    const id = el.dataset.id;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    highlightPostId = null;
    renderTwitter();
  });
  registerAction('set-x-account', (el) => {
    const me = getCharacter(getState().activeCharacterId);
    if (me) activeAccountOf[me.id] = el.dataset.id;
    highlightPostId = null;
    renderTwitter();
  });
  registerApp('twitter', { root, render: renderTwitter });
  startStore();
  renderTwitter();
  subscribe(() => renderTwitter());
  onStoreChange(() => renderTwitter());
}
