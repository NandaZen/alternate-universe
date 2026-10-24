// Animasi buka app: app membesar dari posisi ikonnya di home screen (seperti iOS).
// Kalau ikon tidak ditemukan (mis. dibuka dari notifikasi), app hanya zoom-in halus.
import { subscribe } from '../state.js';
import { $ } from '../utils.js';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function openFrom(name, tries = 0) {
  const el = $(`#app-${name}`);
  const screen = $('#phone-screen');
  if (!el || !screen) return;
  if (el.hidden) {
    if (tries < 3) requestAnimationFrame(() => openFrom(name, tries + 1));
    return;
  }

  const sr = screen.getBoundingClientRect();
  const btn = [...document.querySelectorAll('.ios-icon')].find((b) => b.dataset.app === name);
  const ir = (btn?.querySelector('.app-tile') || btn)?.getBoundingClientRect();

  let from;
  if (ir && ir.width > 0 && sr.width > 0) {
    const s = ir.width / sr.width;
    const dx = ir.left + ir.width / 2 - (sr.left + sr.width / 2);
    const dy = ir.top + ir.height / 2 - (sr.top + sr.height / 2);
    from = { transform: `translate(${dx}px, ${dy}px) scale(${s})`, borderRadius: `${14 / s}px`, opacity: 0.6 };
  } else {
    from = { transform: 'scale(.92)', borderRadius: '24px', opacity: 0 };
  }

  el.animate([from, { transform: 'none', borderRadius: '0px', opacity: 1 }], {
    duration: 420,
    easing: 'cubic-bezier(.2, .9, .25, 1)',
  });
}

export function initTransitions() {
  subscribe((s, changed) => {
    if (!changed.includes('activeApp') || !s.activeApp || reduced()) return;
    const name = s.activeApp;
    queueMicrotask(() => openFrom(name)); // sebelum frame berikutnya digambar, jadi tidak berkedip
  });
}