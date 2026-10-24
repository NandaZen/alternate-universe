// Lock Screen ala iOS: muncul saat masuk ke ponsel (dan saat tombol samping ditekan).
// Swipe ke atas / tombol "Swipe up to unlock" / Enter untuk membuka.
// Notifikasi mengikuti jam cerita; ketuk notifikasi membuka app-nya.
import { getState, subscribe } from '../state.js';
import { getCharacter, onStoreChange } from '../data/store.js';
import { buildNotifications, notifHtml } from './notifications.js';
import { onTick, getNowMin, fmt } from './clock.js';
import { getControls, toggleControl, onControls } from '../apps/controls.js';
import { $, formatDayLong } from '../utils.js';

const TORCH = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8v3l-1.5 2.5V20a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 9.5 20V8.5L8 6z"/><path d="M12 12v2"/></svg>';
const CAMERA = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';

const MAX_NOTIFS = 4;
let el = null;
let locked = false;
let hideTimer = null;

const wall = (url) => `url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`;

function build() {
  el = document.createElement('div');
  el.className = 'lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Lock Screen');
  el.innerHTML = `
    <div class="lock__clock"><p class="lock__date"></p><time class="lock__time"></time></div>
    <div class="lock__notifs" aria-live="polite"></div>
    <div class="lock__bar">
      <button type="button" class="lock__btn" data-lock="torch" aria-label="Flashlight">${TORCH}</button>
      <button type="button" class="lock__btn" data-lock="camera" aria-label="Camera">${CAMERA}</button>
    </div>
    <button type="button" class="lock__hint" data-lock="unlock">Swipe up to unlock</button>`;
  $('#phone-screen').appendChild(el);
  bind();
}

function renderNotifs() {
  if (!el) return;
  const list = buildNotifications(getState(), Math.floor(getNowMin()));
  const shown = list.slice(0, MAX_NOTIFS);
  const more = list.length - shown.length;
  $('.lock__notifs', el).innerHTML =
    shown.map((n) => notifHtml(n)).join('') + (more > 0 ? `<p class="lock__more">+${more} more notifications</p>` : '');
}

function refresh() {
  if (!el) return;
  const s = getState();
  $('.lock__date', el).textContent = formatDayLong(s.activeStoryDate);
  $('.lock__time', el).textContent = fmt(getNowMin());
  const url = getCharacter(s.activeCharacterId)?.wallpaper || '';
  if (url) el.style.setProperty('--lock-wallpaper', wall(url));
  else el.style.removeProperty('--lock-wallpaper');
  $('[data-lock="torch"]', el).classList.toggle('is-on', !!getControls().flashlight);
  renderNotifs();
}

function lock() {
  if (locked || getState().view !== 'home') return;
  if (!el) build();
  clearTimeout(hideTimer);
  locked = true;
  el.hidden = false;
  el.classList.remove('is-unlocking', 'is-drag');
  el.style.transform = '';
  document.body.dataset.locked = '1';
  refresh();
}

function unlock() {
  if (!locked || !el) return;
  locked = false;
  delete document.body.dataset.locked;
  el.classList.remove('is-drag');
  el.style.transform = '';
  el.classList.add('is-unlocking');
  const node = el;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!locked) {
      node.hidden = true;
      node.classList.remove('is-unlocking');
    }
  }, 480);
}

function hardHide() {
  clearTimeout(hideTimer);
  locked = false;
  delete document.body.dataset.locked;
  if (el) {
    el.hidden = true;
    el.classList.remove('is-unlocking', 'is-drag');
    el.style.transform = '';
  }
}

function bind() {
  let startY = null;
  let dy = 0;
  let moved = false;

  el.addEventListener('pointerdown', (e) => {
    moved = false;
    if (!locked || e.target.closest('.lock__btn')) return;
    startY = e.clientY;
    dy = 0;
  });
  // Tanpa pointer capture, supaya ketukan pada notifikasi tetap menjadi klik biasa.
  window.addEventListener('pointermove', (e) => {
    if (startY == null) return;
    dy = Math.min(0, e.clientY - startY);
    if (dy < -8) {
      moved = true;
      el.classList.add('is-drag');
      el.style.transform = `translateY(${dy}px)`;
    }
  });
  const end = () => {
    if (startY == null) return;
    const d = dy;
    startY = null;
    if (!moved) return;
    if (d < -100) unlock();
    else {
      el.classList.remove('is-drag');
      el.style.transform = '';
    }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  el.addEventListener(
    'click',
    (e) => {
      if (moved) {            // klik susulan setelah drag diabaikan
        e.preventDefault();
        e.stopPropagation();
        moved = false;
        return;
      }
      if (e.target.closest('.notif')) { unlock(); return; } // biarkan klik lanjut ke handler open-app / open-call
      const btn = e.target.closest('[data-lock]');
      if (!btn) return;
      e.stopPropagation();
      const kind = btn.dataset.lock;
      if (kind === 'unlock') unlock();
      else if (kind === 'torch') toggleControl('flashlight');
      else if (kind === 'camera') btn.animate([{ transform: 'scale(.88)' }, { transform: 'none' }], { duration: 220 });
    },
    true
  );
}

export function initLock() {
  // Tombol samping (kanan frame): kunci ponsel.
  const frame = $('.phone__frame');
  if (frame) {
    frame.insertAdjacentHTML('beforeend', '<button type="button" class="phone__side" aria-label="Side button: lock"></button>');
    frame.querySelector('.phone__side').addEventListener('click', lock);
  }

  document.addEventListener('keydown', (e) => {
    if (locked && (e.key === 'Enter' || e.key === 'ArrowUp')) {
      e.preventDefault();
      unlock();
    }
  });

  subscribe((s, changed) => {
    if (changed.includes('view')) {
      if (s.view === 'home' && !s.activeApp) lock();
      else if (s.view !== 'home') hardHide();
    }
    if (locked && changed.includes('activeApp') && s.activeApp) unlock(); // app dibuka dari banner
    if (locked && (changed.includes('activeCharacterId') || changed.includes('activeStoryDate'))) refresh();
  });
  onStoreChange(() => { if (locked) refresh(); });
  onControls((key) => {
    if (locked && key === 'flashlight' && el) $('[data-lock="torch"]', el).classList.toggle('is-on', !!getControls().flashlight);
  });
  onTick((prev, now, reset) => {
    if (!locked || !el) return;
    $('.lock__time', el).textContent = fmt(now);
    if (reset || Math.floor(prev) !== Math.floor(now)) renderNotifs();
  });

  const s = getState();
  if (s.view === 'home' && !s.activeApp) lock();
}