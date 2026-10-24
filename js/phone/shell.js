// Cangkang iPhone: status bar, dynamic island, back (swipe kiri), home indicator,
// Notification Center (kiri atas) dan Control Center (kanan atas) ala iOS.
// Ganti karakter/tanggal ada di app Settings, bukan di sini.
import { getState, subscribe } from '../state.js';
import { registerAction, navigate } from '../navigation.js';
import { $, esc, formatDayLong } from '../utils.js';
import { buildNotifications, notifCenterHtml, playBanners, clearBanners, minOf } from './notifications.js';
import { initClock, onTick, getNowMin, fmt } from './clock.js';
import { isDnd, setDnd, onPrefs } from './prefs.js';
import { getControls, setControl, toggleControl, onControls } from '../apps/controls.js';

let openSheet = null;
const backStack = [];
const cleared = new Set(); // notifikasi yang sudah dihapus pembaca (hanya sesi ini)

/* ---------- API untuk aplikasi ---------- */
/** Daftarkan handler back (mis. dari layar dalam ke daftar). Return fungsi untuk melepas. */
export function pushBack(fn) {
  backStack.push(fn);
  return () => { const i = backStack.indexOf(fn); if (i >= 0) backStack.splice(i, 1); };
}
export function goBack() {
  if (closeSheets()) return;
  const fn = backStack[backStack.length - 1];
  if (fn && fn() !== false) return;
  const s = getState();
  if (s.view === 'home' && s.activeApp) navigate('home');
}
export function goHome() {
  closeSheets();
  backStack.length = 0;
  navigate('home');
}

/* ---------- ikon ---------- */
const ic = (body, size = 22, sw = 1.8) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const SIGNAL = '<svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
const WIFI = '<svg width="17" height="12" viewBox="0 0 17 12" aria-hidden="true"><path d="M8.5 2.2c2.4 0 4.6.9 6.2 2.5l1-1.1A10.4 10.4 0 0 0 8.5.7 10.4 10.4 0 0 0 1.3 3.6l1 1.1a8.8 8.8 0 0 1 6.2-2.5Zm0 3.6c1.4 0 2.6.5 3.6 1.4l1-1.1a7 7 0 0 0-9.2 0l1 1.1c1-.9 2.2-1.4 3.6-1.4Zm0 3.5c.6 0 1.2.2 1.6.7L8.5 12 6.9 10c.4-.5 1-.7 1.6-.7Z"/></svg>';
const BATTERY = '<svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2"/><path d="M25 4.5v4c.8-.3 1.5-1.1 1.5-2s-.7-1.7-1.5-2Z" opacity=".5"/></svg>';
const PLANE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 15v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5.5z"/></svg>';
const MOON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>';

const CC_ICON = {
  airplane: ic('<path d="M21 15v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5.5z" fill="currentColor" stroke="none"/>', 22),
  cellular: ic('<path d="M4 20V14M9 20V10M14 20V6M19 20V3" stroke-width="2.6"/>', 22),
  wifi: ic('<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>', 22, 2),
  bluetooth: ic('<path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9"/>', 22, 2),
  orientation: ic('<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M12 8.5v3.5M12 14.5v.1"/>', 22),
  mirror: ic('<rect x="3" y="5" width="12" height="9" rx="1.5"/><rect x="11" y="10" width="10" height="8" rx="1.5"/>', 22),
  moon: ic('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" fill="currentColor"/>', 24, 1),
  flashlight: ic('<path d="M8 3h8v3l-1.5 2.5V20a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 9.500 20V8.5L8 6z"/><path d="M12 12v2"/>', 24),
  timer: ic('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.500v4l2.500 1.500M9.500 3h5"/>', 24),
  calc: ic('<rect x="5" y="3" width="14" height="18" rx="2.500"/><path d="M8.500 7.500h7M9 12h.1M12 12h.1M15 12h.1M9 16h.1M12 16h.1M15 16h.1" stroke-width="2.200"/>', 24),
  camera: ic('<path d="M4 8h3l1.500-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.500"/>', 24),
  sun: ic('<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.200 5.200L7 7M17 17l1.800 1.800M18.800 5.200L17 7M7 17l-1.800 1.800"/>', 24),
  volume: ic('<path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500z" fill="currentColor"/><path d="M15.500 9a4.500 4.500 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11"/>', 24),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100"/>', 22),
  play: ic('<path d="M7 5l12 7-12 7z" fill="currentColor"/>', 20, 1),
};

/* ---------- markup ---------- */
const GRAB = '<button type="button" class="sheet__grab" data-action="phone-close-sheets" aria-label="Close"><span></span></button>';

function shellHtml() {
  return `
    <div class="phone__island" aria-hidden="true"></div>
    <header class="statusbar">
      <button type="button" class="statusbar__zone statusbar__zone--l" data-zone="notif" aria-label="Notification Center"><time id="sb-time">9:41</time><span class="sb-ind" id="sb-ind"></span></button>
      <button type="button" class="statusbar__zone statusbar__zone--r" data-zone="control" aria-label="Control Center"><span class="sb-icons" id="sb-icons"></span></button>
    </header>
    <div id="notif-banner" class="banner-host" aria-live="polite"></div>
    <div class="phone__edge" data-zone="edge" aria-hidden="true"></div>
    <div class="sheet-scrim" data-action="phone-close-sheets" hidden></div>
    <section id="sheet-notif" class="sheet sheet--notif" hidden aria-label="Notification Center"></section>
    <section id="sheet-control" class="sheet sheet--control" hidden aria-label="Control Center"></section>
    <div id="phone-torch" class="phone__torch" aria-hidden="true"></div>
    <div id="phone-dim" class="phone__dim" aria-hidden="true"></div>
    <button type="button" class="phone__home" data-zone="home" aria-label="Home"><span></span></button>`;
}

/* ---------- status bar ---------- */
function renderStatus() {
  const c = getControls();
  const parts = [];
  if (c.airplane) parts.push(PLANE);
  else {
    if (c.cellular) parts.push(SIGNAL);
    if (c.wifi) parts.push(WIFI);
  }
  parts.push(BATTERY);
  const icons = $('#sb-icons');
  if (icons) icons.innerHTML = parts.join('');
  const ind = $('#sb-ind');
  if (ind) ind.innerHTML = isDnd() ? MOON : '';
}

function applyControls() {
  const c = getControls();
  const dim = $('#phone-dim');
  if (dim) dim.style.opacity = String((1 - c.brightness) * 0.65);
  $('#phone-torch')?.classList.toggle('is-on', !!c.flashlight);
}

const refreshClock = () => {
  const t = fmt(getNowMin());
  const a = $('#sb-time');
  if (a) a.textContent = t;
  const b = $('#nc-time');
  if (b) b.textContent = t;
};

/* ---------- Notification Center ---------- */
const nkey = (n) => `${n.ts}|${n.title}|${n.body}`;
const visibleNotifs = () => buildNotifications(getState(), Math.floor(getNowMin())).filter((n) => !cleared.has(nkey(n)));

function renderNotifSheet() {
  const s = getState();
  const list = visibleNotifs();
  $('#sheet-notif').innerHTML = `<div class="sheet__body">
      <div class="nc-clock"><p>${esc(formatDayLong(s.activeStoryDate))}</p><time id="nc-time">${esc(fmt(getNowMin()))}</time></div>
      <div class="sheet__head"><h2>Notifications</h2>${list.length ? '<button type="button" class="nc-clear" data-action="phone-clear-notifs" aria-label="Clear all notifications">✕</button>' : ''}</div>
      <div class="sheet__list">${notifCenterHtml(list)}</div>
    </div>${GRAB}`;
}

/* ---------- Control Center ---------- */
const round = (key, on, label) =>
  `<button type="button" class="cc-round cc-round--${key} ${on ? 'is-on' : ''}" data-action="cc-toggle" data-key="${key}" aria-pressed="${on}" aria-label="${label}">${CC_ICON[key]}</button>`;
const square = (key, on, label, extra = '') =>
  `<button type="button" class="cc-sq cc-sq--${key} ${on ? 'is-on' : ''} ${extra}" ${extra.includes('static') ? '' : `data-action="cc-toggle" data-key="${key}" aria-pressed="${on}"`} aria-label="${label}">${CC_ICON[key]}</button>`;

function renderControlSheet() {
  const c = getControls();
  const dnd = isDnd();
  $('#sheet-control').innerHTML = `<div class="sheet__body">
      <div class="cc">
        <div class="cc-block cc-conn">${round('airplane', c.airplane, 'Airplane mode')}${round('cellular', c.cellular, 'Cellular data')}${round('wifi', c.wifi, 'Wi-Fi')}${round('bluetooth', c.bluetooth, 'Bluetooth')}</div>
        <div class="cc-block cc-media"><small>Not Playing</small><span class="cc-media__ctl">${CC_ICON.play}</span></div>
        ${square('orientation', c.orientation, 'Orientation lock')}
        ${square('mirror', false, 'Screen mirroring', 'static')}
        <div class="cc-slider" data-slider="brightness" style="--v:${c.brightness}" role="slider" aria-label="Brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(c.brightness * 100)}"><span class="cc-slider__fill"></span><span class="cc-slider__ico">${CC_ICON.sun}</span></div>
        <div class="cc-slider" data-slider="volume" style="--v:${c.volume}" role="slider" aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(c.volume * 100)}"><span class="cc-slider__fill"></span><span class="cc-slider__ico">${CC_ICON.volume}</span></div>
        <button type="button" class="cc-focus ${dnd ? 'is-on' : ''}" data-action="phone-dnd" aria-pressed="${dnd}">${CC_ICON.moon}<span><b>${dnd ? 'Do Not Disturb' : 'Focus'}</b>${dnd ? '<small>On</small>' : ''}</span></button>
        ${square('flashlight', c.flashlight, 'Flashlight')}
        ${square('timer', false, 'Timer', 'static')}
        ${square('calc', false, 'Calculator', 'static')}
        ${square('camera', false, 'Camera', 'static')}
        <button type="button" class="cc-settings" data-action="open-app" data-app="settings">${CC_ICON.gear}<span>Settings</span></button>
      </div>
    </div>${GRAB}`;
}

/* ---------- sheets ---------- */
function showSheet(name) {
  closeSheets(true);
  if (name === 'notif') renderNotifSheet(); else renderControlSheet();
  $(`#sheet-${name}`).hidden = false;
  $('.sheet-scrim').hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => $(`#sheet-${name}`).classList.add('is-open')));
  openSheet = name;
}
function closeSheets(silent) {
  if (!openSheet) return false;
  const el = $(`#sheet-${openSheet}`);
  el.classList.remove('is-open');
  const done = () => { if (!el.classList.contains('is-open')) el.hidden = true; };
  silent ? done() : setTimeout(done, 340);
  $('.sheet-scrim').hidden = true;
  openSheet = null;
  return !silent;
}
const toggleSheet = (name) => (openSheet === name ? closeSheets() : showSheet(name));

/* ---------- banner ---------- */
function refreshBanners() {
  const host = $('#notif-banner');
  if (host && (isDnd() || getState().view !== 'home')) clearBanners(host);
}

/** Dipanggil tiap tick jam cerita: munculkan notifikasi yang waktunya baru saja terlewati. */
function onClockTick(prev, now, reset) {
  refreshClock();
  const host = $('#notif-banner');
  if (reset) { clearBanners(host); return; }
  const a = Math.floor(prev), b = Math.floor(now);
  if (b === a) return;
  const fresh = buildNotifications(getState(), b)
    .filter((n) => { const m = minOf(n.ts); return m > a && m <= b; })
    .reverse(); // paling lama dulu
  if (!fresh.length) return;
  if (openSheet === 'notif') renderNotifSheet();
  if (!isDnd()) playBanners(host, fresh);
}

/* ---------- gestur ---------- */
function gesture(el, onEnd) {
  let sx = 0, sy = 0, id = null;
  el.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; id = e.pointerId; el.setPointerCapture?.(id); });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== id) return;
    id = null;
    onEnd(e.clientX - sx, e.clientY - sy);
  });
  el.addEventListener('pointercancel', () => { id = null; });
}
const isTap = (dx, dy) => Math.abs(dx) < 8 && Math.abs(dy) < 8;

function bindGestures() {
  const phone = $('#phone-screen');
  gesture(phone.querySelector('[data-zone="notif"]'), (dx, dy) => { if (isTap(dx, dy) || dy > 30) toggleSheet('notif'); });
  gesture(phone.querySelector('[data-zone="control"]'), (dx, dy) => { if (isTap(dx, dy) || dy > 30) toggleSheet('control'); });
  gesture(phone.querySelector('[data-zone="edge"]'), (dx) => { if (dx > 70) goBack(); });
  gesture(phone.querySelector('[data-zone="home"]'), (dx, dy) => { if (isTap(dx, dy) || dy < -30) goHome(); });
}

/** Swipe ke atas di handle bawah menutup sheet; tap notifikasi menutup sheet; slider bisa digeser. */
function bindSheets() {
  for (const id of ['sheet-notif', 'sheet-control']) {
    const el = $(`#${id}`);
    let startY = null;
    el.addEventListener('pointerdown', (e) => { startY = e.target.closest('.sheet__grab') ? e.clientY : null; });
    el.addEventListener('pointerup', (e) => {
      if (startY != null && e.clientY - startY < -30) closeSheets();
      startY = null;
    });
  }
  $('#sheet-notif').addEventListener('click', (e) => { if (e.target.closest('.notif')) closeSheets(); });

  const cc = $('#sheet-control');
  let active = null;
  const apply = (el, e) => {
    const r = el.getBoundingClientRect();
    const raw = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    const key = el.dataset.slider;
    setControl(key, key === 'brightness' ? Math.max(0.15, raw) : raw);
    el.style.setProperty('--v', String(getControls()[key]));
  };
  cc.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.cc-slider');
    if (!el) return;
    active = el;
    el.setPointerCapture?.(e.pointerId);
    apply(el, e);
  });
  cc.addEventListener('pointermove', (e) => { if (active) apply(active, e); });
  const end = () => { active = null; };
  cc.addEventListener('pointerup', end);
  cc.addEventListener('pointercancel', end);
}

/* ---------- init ---------- */
export function initPhone() {
  const screen = $('#phone-screen');
  if (!screen) return;
  screen.insertAdjacentHTML('beforeend', shellHtml());

  registerAction('phone-close-sheets', () => closeSheets());
  registerAction('phone-dnd', () => setDnd(!isDnd()));
  registerAction('cc-toggle', (el) => toggleControl(el.dataset.key));
  registerAction('phone-clear-notifs', () => {
    visibleNotifs().forEach((n) => cleared.add(nkey(n)));
    renderNotifSheet();
  });

  bindGestures();
  bindSheets();
  renderStatus();
  applyControls();
  refreshClock();

  onControls((key) => {
    renderStatus();
    applyControls();
    if (openSheet === 'control' && key !== 'brightness' && key !== 'volume') renderControlSheet();
  });
  onPrefs(() => { renderStatus(); if (openSheet === 'control') renderControlSheet(); refreshBanners(); });
  onTick(onClockTick);
  initClock();

  subscribe((_s, changed) => {
    if (changed.includes('activeApp') || changed.includes('view')) closeSheets(true);
    if (changed.includes('view')) refreshBanners();
    if (openSheet === 'notif' && (changed.includes('activeCharacterId') || changed.includes('activeStoryDate'))) renderNotifSheet();
  });
}