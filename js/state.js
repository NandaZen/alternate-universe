// One global state shared by every app.
//   activeCharacterId – whose POV the reader is in
//   activeStoryDate   – 'YYYY-MM-DD' from the timeline
//   activeApp         – null | 'notes' | 'whatsapp' | 'gallery' | 'twitter' | 'stories'
// Extra: view ('landing' | 'home'), scope ('day' | 'upto'), focus (one-shot "open this item").
// Hanya activeCharacterId, activeStoryDate, scope yang disimpan ke localStorage.

import { getPlayable } from './data/store.js';
import { storyDates } from './data/timeline.js';

const STORAGE_KEY = 'au-story:v1';
const PERSISTED = ['activeCharacterId', 'activeStoryDate', 'scope'];

const state = {
  activeCharacterId: '',
  activeStoryDate: storyDates[0],
  activeApp: null,
  view: 'landing',
  scope: 'day',
  focus: null,
};

const listeners = new Set();

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeSaved() {
  try {
    const out = {};
    for (const key of PERSISTED) out[key] = state[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* storage disabled: tetap jalan, hanya tidak mengingat pilihan */
  }
}

/** Panggil SETELAH `await startStore()`. */
export function initState() {
  const saved = readSaved();
  const ids = getPlayable().map((c) => c.id);
  state.activeCharacterId = ids.includes(saved.activeCharacterId) ? saved.activeCharacterId : ids[0] || '';
  if (storyDates.includes(saved.activeStoryDate)) state.activeStoryDate = saved.activeStoryDate;
  if (saved.scope === 'day' || saved.scope === 'upto') state.scope = saved.scope;
  return state;
}

export const getState = () => state;

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch, { silent = false } = {}) {
  const changed = [];
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] !== value) {
      state[key] = value;
      changed.push(key);
    }
  }
  if (!changed.length) return false;
  if (changed.some((key) => PERSISTED.includes(key))) writeSaved();
  if (!silent) for (const listener of [...listeners]) listener(state, changed);
  return true;
}

export function setCharacter(id) {
  if (!getPlayable().some((c) => c.id === id)) return false;
  return setState({ activeCharacterId: id });
}

export function setDate(date) {
  if (!storyDates.includes(date)) return false;
  return setState({ activeStoryDate: date });
}

export function stepDate(delta) {
  const index = storyDates.indexOf(state.activeStoryDate) + delta;
  if (index < 0 || index >= storyDates.length) return false;
  return setState({ activeStoryDate: storyDates[index] });
}

export const canStep = (delta) => {
  const index = storyDates.indexOf(state.activeStoryDate) + delta;
  return index >= 0 && index < storyDates.length;
};

export const setScope = (scope) => (scope === 'day' || scope === 'upto') && setState({ scope });

/** Apps call this after acting on a focus request, so it fires only once. */
export const consumeFocus = () => setState({ focus: null }, { silent: true });