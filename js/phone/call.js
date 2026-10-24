// Layar panggilan masuk: berdering → diangkat (ceritanya selalu diangkat) → timer.
import { getMessage, getCharacter, getNarration, avatarHtml } from '../data/store.js';
import { registerAction } from '../navigation.js';
import { esc, $ } from '../utils.js';

let el = null;
let tick = null;

const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function close() {
  clearInterval(tick);
  tick = null;
  el?.remove();
  el = null;
  delete document.body.dataset.call;
}

function connected(m, who) {
  const total = Number(m.duration) || 0;
  const note = m.narrationId ? getNarration(m.narrationId) : null;
  const noteText = note?.text || note?.body || '';
  let sec = 0;

  el.innerHTML = `
    <div class="call__top">
      ${avatarHtml(who, 110)}
      <h2>${esc(who?.name || 'Unknown')}</h2>
      <p class="call__status" id="call-time">00:00</p>
    </div>
    ${noteText ? `<p class="call__note">${esc(noteText)}</p>` : ''}
    <div class="call__actions call__actions--end">
      <button type="button" class="call__btn call__btn--decline" data-call="end" aria-label="End call"><span>✕</span><small>End</small></button>
    </div>`;

  const label = $('#call-time', el);
  tick = setInterval(() => {
    sec += 1;
    label.textContent = clock(sec);
    if (total && sec >= total) finish();
  }, 1000);

  function finish() {
    clearInterval(tick);
    label.textContent = `Call ended · ${clock(sec)}`;
    setTimeout(close, 1400);
  }
  $('[data-call="end"]', el).addEventListener('click', finish);
}

function ringing(m, who) {
  const kind = m.callKind === 'video' ? 'video' : 'voice';
  el.innerHTML = `
    <div class="call__top">
      ${avatarHtml(who, 110, 'call__avatar')}
      <h2>${esc(who?.name || 'Unknown')}</h2>
      <p class="call__status">WhatsApp ${kind} call…</p>
    </div>
    <p class="call__hint" id="call-hint" hidden>In this story, the call was answered.</p>
    <div class="call__actions">
      <button type="button" class="call__btn call__btn--decline" data-call="decline" aria-label="Decline"><span>✕</span><small>Decline</small></button>
      <button type="button" class="call__btn call__btn--accept" data-call="accept" aria-label="Accept"><span>✆</span><small>Accept</small></button>
    </div>`;

  $('[data-call="accept"]', el).addEventListener('click', () => connected(m, who));
  $('[data-call="decline"]', el).addEventListener('click', () => {
    const btn = $('[data-call="decline"]', el);
    btn.classList.remove('is-shake');
    void btn.offsetWidth;            // restart animasi
    btn.classList.add('is-shake');
    $('#call-hint', el).hidden = false;
    navigator.vibrate?.(60);
  });
}

export function showCall(id) {
  const m = getMessage(id);
  const screen = $('#phone-screen');
  if (!m || !screen) return;
  close();
  el = document.createElement('div');
  el.className = 'call';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Incoming call');
  screen.appendChild(el);
  document.body.dataset.call = '1';
  ringing(m, getCharacter(m.senderId));
}

export function initCalls() {
  registerAction('open-call', (target) => showCall(target.dataset.id));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el) close(); });
}