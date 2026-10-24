// Home screen ala iOS: wallpaper, widget tanggal & hari cerita, grid app, dock.

import { getState, subscribe } from './state.js';
import { getCharacter, countsFor, onStoreChange } from './data/store.js';
import { getDay } from './data/timeline.js';
import { APP_META } from './icons.js';
import { esc, $, formatWeekday, formatDayNumber, formatMonthShort } from './utils.js';

const GRID = ['notes', 'stories'];
const DOCK = ['whatsapp', 'twitter', 'gallery', 'settings'];

function appButton(id, counts, dock) {
  const meta = APP_META[id];
  if (!meta) return '';
  const n = counts[id];
  return `<button type="button" class="ios-icon" data-action="open-app" data-app="${id}" aria-label="${esc(meta.title)}${n ? `, ${n} new today` : ''}">
    <span class="app-tile">${meta.tile}${n ? `<span class="badge" aria-hidden="true">${n}</span>` : ''}</span>
    ${dock ? '' : `<span class="ios-icon__label">${esc(meta.title)}</span>`}
  </button>`;
}

export function renderHome() {
  const root = $('#home-content');
  if (!root) return;
  const s = getState();
  if (!getCharacter(s.activeCharacterId)) { root.innerHTML = ''; return; }
  const day = getDay(s.activeStoryDate);
  const counts = countsFor(s);

  root.innerHTML = `
    <div class="ios-home">
      <div class="ios-widgets">
        <div class="widget widget--date">
          <small>${esc(formatWeekday(s.activeStoryDate))}</small>
          <b>${esc(formatDayNumber(s.activeStoryDate))}</b>
          <span>${esc(formatMonthShort(s.activeStoryDate))}</span>
        </div>
        <div class="widget widget--day">
          <small>${esc(day?.label || 'Today')}</small>
          <strong>${esc(day?.title || '')}</strong>
          <span>${esc(day?.summary || '')}</span>
        </div>
      </div>
      <nav class="ios-grid" aria-label="Apps">${GRID.map((id) => appButton(id, counts, false)).join('')}</nav>
      <div class="ios-dots" aria-hidden="true"><i class="on"></i><i></i></div>
      <nav class="ios-dock" aria-label="Dock">${DOCK.map((id) => appButton(id, counts, true)).join('')}</nav>
    </div>`;
}

export function initHome() {
  renderHome();
  onStoreChange(renderHome);
  subscribe((_state, changed) => {
    if (changed.some((k) => k === 'activeCharacterId' || k === 'activeStoryDate')) renderHome();
  });
}
