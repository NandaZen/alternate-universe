// WhatsApp: chat list, 1:1 and group conversations, stickers, contact/group info, account switching,
// and message narration (ⓘ).

import { getState, subscribe, consumeFocus } from '../state.js';
import { registerApp } from '../navigation.js';
import { startStore, onStoreChange, isStoreReady, storeError, chatsFor, getPlayable, getCharacter, getSticker, avatarHtml } from '../data/store.js';
import { brand, icon } from '../icons.js';
import { esc, formatTime, formatDayLong, dateKey, truncate } from '../utils.js';
import { emptyState, openModal } from '../ui.js';
import { openNarration } from './narrationModal.js';

let root;
let openChatId = null;
let highlightMessageId = null;

const firstName = (id) => getCharacter(id)?.name.split(' ')[0] || id;

function accountSwitcher(state) {
  return `<div class="account-switch" role="group" aria-label="WhatsApp account">
    ${getPlayable()
      .map(
        (c) => `<button type="button" class="account-switch__btn ${c.id === state.activeCharacterId ? 'is-active' : ''}" data-action="set-character" data-id="${esc(c.id)}" aria-pressed="${c.id === state.activeCharacterId}">
          ${avatarHtml(c, 24)}<span>${esc(c.name.split(' ')[0])}</span>
        </button>`
      )
      .join('')}
  </div>`;
}

/** Sticker image; a broken/missing file is swapped for a labelled placeholder by the handler in ui.js. */
function stickerHtml(stickerId) {
  const sticker = getSticker(stickerId);
  if (!sticker) return `<span class="sticker-fallback" role="img" aria-label="Sticker">Sticker</span>`;
  return `<img class="sticker" src="${esc(sticker.file)}" alt="Sticker: ${esc(sticker.label)}" data-label="${esc(sticker.label)}" loading="lazy" decoding="async">`;
}

const isCall = (m) => m.type === 'call' || m.type === 'missed_call';

function callLabel(m, mine) {
  const kind = m.callKind === 'video' ? 'video' : 'voice';
  if (m.type === 'missed_call') return mine ? `${kind[0].toUpperCase()}${kind.slice(1)} call · no answer` : `Missed ${kind} call`;
  return `${mine ? 'Outgoing' : 'Incoming'} ${kind} call${m.duration ? ` · ${esc(m.duration)}` : ''}`;
}

function previewHtml(chat) {
  const m = chat.last;
  const mine = m.senderId === chat.characterId;
  const group = chat.contact.isGroup;
  const who = group ? `${mine ? 'You' : esc(firstName(m.senderId))}: ` : '';
  const tick = !group && mine ? icon('doubleCheck', 14, { className: 'ticks' }) : '';
  if (isCall(m)) return `${tick}${who}${icon('phone', 13)} ${callLabel(m, mine)}`;
  const sticker = m.stickerId ? `${icon('image', 13)} Sticker${m.text ? ' · ' : ''}` : '';
  return `${tick}${who}${sticker}${esc(truncate(m.text || '', 48))}`;
}

function chatRow(chat, active) {
  return `<li><button type="button" class="chat-row ${active ? 'is-active' : ''}" data-action="open-chat" data-id="${esc(chat.id)}">
    ${avatarHtml(chat.contact, 48)}
    <span class="chat-row__main">
      <span class="chat-row__top"><strong>${chat.contact.isGroup ? `${icon('users', 14, { className: 'group-ico' })} ` : ''}${esc(chat.contact.name)}</strong><time>${esc(formatTime(chat.last.timestamp))}</time></span>
      <span class="chat-row__last">${previewHtml(chat)}</span>
    </span>
  </button></li>`;
}

function bubble(m, chat) {
  const mine = m.senderId === chat.characterId;
  const group = chat.contact.isGroup;
  const sender = group && !mine ? getCharacter(m.senderId) : null;
  const stickerOnly = m.stickerId && !m.text;
  const call = isCall(m);
  const classes = ['msg', mine ? 'msg--out' : 'msg--in', stickerOnly ? 'msg--sticker' : '', call ? 'msg--call' : '', m.id === highlightMessageId ? 'is-highlight' : ''];
  return `<div class="${classes.filter(Boolean).join(' ')}" id="msg-${esc(m.id)}">
    <div class="msg__bubble">
      ${sender ? `<span class="msg__name" style="color:${esc(sender.accent || '#128c7e')}">${esc(sender.name)}</span>` : ''}
      ${call ? `<p class="msg__call ${m.type === 'missed_call' && !mine ? 'msg__call--missed' : ''}"><span class="msg__call-ico">${icon('phone', 16)}</span> <span>${callLabel(m, mine)}</span></p>` : ''}
      ${m.stickerId && !call ? stickerHtml(m.stickerId) : ''}
      ${m.text ? `<p>${esc(m.text)}</p>` : ''}
      <span class="msg__meta">
        ${m.narrationId ? `<button type="button" class="narr-btn" data-action="open-narration" data-id="${esc(m.narrationId)}" aria-label="Read the story behind this message" title="Story behind this message">${icon('info', 15)}</button>` : ''}
        <time>${esc(formatTime(m.timestamp))}</time>${mine ? icon('doubleCheck', 14, { className: 'ticks' }) : ''}
      </span>
    </div>
  </div>`;
}

function conversation(chat) {
  const contact = chat.contact;
  let lastDay = '';
  const bubbles = chat.messages
    .map((m) => {
      const day = dateKey(m.timestamp);
      const sep = day !== lastDay ? `<div class="day-sep"><span>${esc(formatDayLong(day))}</span></div>` : '';
      lastDay = day;
      return sep + bubble(m, chat);
    })
    .join('');
  const subtitle = contact.isGroup
    ? ['You', ...contact.members.filter((c) => c.id !== chat.characterId).map((c) => c.name.split(' ')[0])].join(', ')
    : 'tap for contact info';
  return `<div class="conv__head">
      <button type="button" class="conv__back" data-action="close-chat" aria-label="Back to chats">${icon('chevronLeft', 20)}</button>
      <button type="button" class="conv__contact" data-action="${contact.isGroup ? 'open-group' : 'open-contact'}" data-id="${esc(contact.isGroup ? chat.id : contact.id)}">${avatarHtml(contact, 40)}<span><strong>${esc(contact.name)}</strong><small>${esc(subtitle)}</small></span></button>
    </div>
    <div class="conv__scroll" id="conv-scroll">${bubbles}</div>
    <div class="conv__compose" aria-hidden="true"><span>Message</span>${icon('arrowRight', 16)}</div>`;
}

export function renderWhatsApp() {
  const state = getState();
  const chats = chatsFor(state);
  const me = getCharacter(state.activeCharacterId);

  if (state.focus && state.focus.type === 'message') {
    const target = chats.find((c) => c.messages.some((m) => m.id === state.focus.id));
    if (target) {
      openChatId = target.id;
      highlightMessageId = state.focus.id;
    }
    consumeFocus();
  }
  if (!chats.some((c) => c.id === openChatId)) {
    openChatId = null;
    highlightMessageId = null;
  }
  const chat = chats.find((c) => c.id === openChatId) || null;

  const list = !isStoreReady()
    ? emptyState({ iconName: 'comment', title: 'Loading…', text: 'Fetching chats.' })
    : storeError && !chats.length
      ? emptyState({ iconName: 'comment', title: 'Could not load chats', text: storeError })
      : chats.length
    ? `<ul class="chat-list">${chats.map((c) => chatRow(c, c.id === openChatId)).join('')}</ul>`
    : emptyState({ iconName: 'comment', title: 'No chats yet', text: `${(me?.name || '').split(' ')[0]} hasn't sent or received any messages by this day.` });

  root.innerHTML = `
    <header class="wa-top">
      <div class="wa-top__title"><span class="wa-logo">${brand('whatsapp', 22)}</span><h1>WhatsApp</h1></div>
      ${accountSwitcher(state)}
    </header>
    <div class="wa ${chat ? 'has-open' : ''}">
      <aside class="wa__list"><p class="wa__who">Chats as <strong>${esc(me?.name || '')}</strong> <small>${esc(me?.phone || '')}</small></p>${list}</aside>
      <section class="wa__conv">${
        chat ? conversation(chat) : `<div class="conv-empty">${emptyState({ iconName: 'comment', title: 'Select a chat', text: 'Tap ⓘ on a message to read the thoughts behind it.' })}</div>`
      }</section>
    </div>`;

  const scroll = root.querySelector('#conv-scroll');
  if (scroll) {
    const target = highlightMessageId && root.querySelector(`#msg-${CSS.escape(highlightMessageId)}`);
    if (target) target.scrollIntoView({ block: 'center' });
    else scroll.scrollTop = scroll.scrollHeight;
    // Images load after layout; keep the latest message in view once they do.
    if (!target) scroll.querySelectorAll('img.sticker').forEach((img) => img.addEventListener('load', () => (scroll.scrollTop = scroll.scrollHeight), { once: true }));
  }
}

function contactModal(id) {
  const c = getCharacter(id);
  if (!c) return;
  openModal({
    className: 'modal--contact',
    label: `Contact info for ${c.name}`,
    html: `<div class="contact">
      ${avatarHtml(c, 96, 'avatar--xl')}
      <h2>${esc(c.name)}</h2>
      <p class="contact__user">@${esc(c.username)}</p>
      <p class="contact__about">${esc(c.about || '')}</p>
      <dl><dt>${icon('phone', 14)} Phone</dt><dd>${esc(c.phone || '-')}</dd><dt>${icon('pin', 14)} Area</dt><dd>${esc(c.location)}</dd><dt>${icon('info', 14)} Bio</dt><dd>${esc(c.bio)}</dd></dl>
    </div>`,
  });
}

function groupModal(chatId) {
  const state = getState();
  const chat = chatsFor(state).find((c) => c.id === chatId);
  if (!chat) return;
  const g = chat.contact;
  openModal({
    className: 'modal--contact modal--group',
    label: `Group info for ${g.name}`,
    html: `<div class="contact">
      ${avatarHtml(g, 96, 'avatar--xl')}
      <h2>${esc(g.name)}</h2>
      <p class="contact__user">Group · ${g.members.length} participants</p>
      ${g.description ? `<p class="contact__about">${esc(g.description)}</p>` : ''}
      <ul class="members">${g.members
        .map(
          (m) => `<li>${avatarHtml(m, 40)}<span><strong>${esc(m.name)}${m.id === chat.characterId ? ' <em>(You)</em>' : ''}</strong><small>${esc(m.bio)}</small></span></li>`
        )
        .join('')}</ul>
    </div>`,
  });
}

export function initWhatsApp(registerAction) {
  root = document.getElementById('app-whatsapp');
  registerAction('open-chat', (el) => {
    openChatId = el.dataset.id;
    highlightMessageId = null;
    renderWhatsApp();
  });
  registerAction('close-chat', () => {
    openChatId = null;
    highlightMessageId = null;
    renderWhatsApp();
  });
  registerAction('open-narration', (el) => openNarration(el.dataset.id));
  registerAction('open-contact', (el) => contactModal(el.dataset.id));
  registerAction('open-group', (el) => groupModal(el.dataset.id));
  registerApp('whatsapp', { root, render: renderWhatsApp });
  startStore();
  renderWhatsApp();
  subscribe(() => renderWhatsApp());
  onStoreChange(() => renderWhatsApp());
}