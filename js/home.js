// Home screen: greeting, day summary, and app icons.

import { getState, subscribe } from './state.js';
import { getCharacter, countsFor } from './data/store.js';
import { getDay } from './data/timeline.js';
import { APP_META } from './icons.js';
import { esc, $, formatDayLong } from './utils.js';
import { avatarImg } from './ui.js';

const ORDER = ['notes', 'whatsapp', 'gallery', 'twitter', 'stories'];

export function renderHome() {
  const root = $('#home-content');
  if (!root) return;

  const s = getState();
  const character = getCharacter(s.activeCharacterId);
  if (!character) {
    root.innerHTML = '';
    return;
  }
  const day = getDay(s.activeStoryDate);
  const counts = countsFor(s);

  root.innerHTML = `
    <header class="home__head">
      <div class="home__who">
        ${avatarImg(character, 56)}
        <div>
          <p class="eyebrow">${esc(formatDayLong(s.activeStoryDate))}</p>
          <h1>${esc(character.name)}'s phone</h1>
        </div>
      </div>
      ${day ? `<p class="home__summary"><strong>${esc(day.title)}.</strong> ${esc(day.summary)}</p>` : ''}
    </header>

    <nav class="home__grid" aria-label="Apps">
      ${ORDER.map((id) => {
        const meta = APP_META[id];
        if (!meta) return '';
        const n = counts[id];
        return `
          <button type="button" class="home-app" data-action="open-app" data-app="${id}" aria-label="${esc(meta.title)}${n ? `, ${n} new today` : ''}">
            <span class="app-tile">
              ${meta.tile}
              ${n ? `<span class="badge" aria-hidden="true">${n}</span>` : ''}
            </span>
            <span class="home-app__label">${esc(meta.title)}</span>
          </button>`;
      }).join('')}
    </nav>

    <p class="home__hint">Switch accounts inside WhatsApp or X, or from the profile button. Everything stays in sync.</p>
  `;
}

export function initHome() {
  renderHome();
  subscribe((state, changed) => {
    if (changed.some((key) => key === 'activeCharacterId' || key === 'activeStoryDate')) renderHome();
  });
}