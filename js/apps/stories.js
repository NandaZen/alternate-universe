// Stories app: membaca stories → chapters → blocks dari Firestore (hasil Story CMS).

import { registerApp, openApp } from '../navigation.js';
import { esc } from '../utils.js';
import { renderStoryBlocks, initStoryLinks, chapterAlign } from './storyblocks.js';
import { collection, getDocs, orderBy, query } from '../data/fsdk.js';
import { db } from '../firebase.js';

let root;
let stories = []; // [{ id, title, subtitle, description, coverUrl, status, chapters: [...] }]
let currentRef = null; // { storyId, chapterId }
let loading = false;
let loaded = false;
let loadError = '';
let pendingOpen = null;
const blockCache = new Map(); // `${storyId}/${chapterId}` -> blocks[]

const getStory = (id) => stories.find((s) => s.id === id) || null;
const getChapter = (storyId, chapterId) => getStory(storyId)?.chapters.find((c) => c.id === chapterId) || null;
const readable = (c) => c.status === 'published';
const dateLabel = (v) => (typeof v === 'string' ? v : '');

async function loadStories() {
  if (loading) return;
  loading = true;
  loadError = '';
  renderStoryList();
  try {
    const snap = await getDocs(collection(db, 'stories'));
    const list = snap.docs
      .map((d) => ({ ...d.data(), id: d.id }))
      .filter((s) => s.status === 'published')
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    for (const s of list) {
      const cs = await getDocs(query(collection(db, 'stories', s.id, 'chapters'), orderBy('order', 'asc')));
      s.chapters = cs.docs.map((d) => ({ ...d.data(), id: d.id })).filter((c) => c.status !== 'draft');
    }
    stories = list;
    loaded = true;
  } catch (error) {
    console.error('Gagal mengambil cerita dari Firebase:', error);
    loadError = 'Cerita gagal dimuat. Periksa koneksi Firebase dan Firestore Rules.';
  } finally {
    loading = false;
    if (pendingOpen && loaded) {
      const p = pendingOpen;
      pendingOpen = null;
      openChapter(p.storyId, p.chapterId);
    } else renderStoryList();
  }
}

function renderStoryList() {
  if (!root) return;
  currentRef = null;

  if (loading) {
    root.innerHTML = `<div class="stories-app"><p class="stories-coming">Loading stories...</p></div>`;
    return;
  }
  if (loadError) {
    root.innerHTML = `
      <div class="stories-app">
        <h1>Stories</h1>
        <p>${esc(loadError)}</p>
        <button type="button" class="stories-read" data-action="reload-stories">Try again</button>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="stories-app">
      <header class="stories-header">
        <p class="eyebrow">YOUR READING SPACE</p>
        <h1>Stories</h1>
        <p>Read the story, one part at a time.</p>
      </header>
      ${
        stories.length
          ? stories
              .map(
                (s) => `<section class="stories-library">
        <article class="stories-book">
          <div class="stories-book__cover" aria-hidden="true">${
            s.coverUrl ? `<img src="${esc(s.coverUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<span>${esc((s.title || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 4).toUpperCase())}</span>`
          }</div>
          <div class="stories-book__info">
            <p class="stories-book__label">SERIAL STORY</p>
            <h2>${esc(s.title || 'Untitled')}</h2>
            <p>${esc(s.description || s.subtitle || 'A story told in parts.')}</p>
            <span class="stories-book__count">${s.chapters.length} parts</span>
          </div>
        </article>
        <div class="stories-chapters">
          <h2>Contents</h2>
          ${
            s.chapters.length
              ? s.chapters
                  .map((c, i) => {
                    const available = readable(c);
                    const num = String(c.part || '').match(/\d+/)?.[0] || String(i + 1);
                    return `<div class="stories-chapter">
                      <div class="stories-chapter__number">${esc(num.padStart(2, '0'))}</div>
                      <div class="stories-chapter__info">
                        <h3>${esc(c.title || 'Untitled')}</h3>
                        <p>${esc(c.subtitle || '')}</p>
                        ${available ? '' : '<span class="stories-coming">Coming Soon</span>'}
                      </div>
                      ${
                        available
                          ? `<button type="button" class="stories-read" data-action="read-story-page" data-story="${esc(s.id)}" data-chapter="${esc(c.id)}">Read <span aria-hidden="true">↗</span></button>`
                          : '<span class="stories-locked">Soon</span>'
                      }
                    </div>`;
                  })
                  .join('')
              : '<p class="stories-coming">No parts yet.</p>'
          }
        </div>
      </section>`
              )
              .join('')
          : '<p class="stories-coming">No stories available yet.</p>'
      }
    </div>`;
}

async function openChapter(storyId, chapterId) {
  if (!loaded) {
    pendingOpen = { storyId, chapterId };
    return loadStories();
  }
  const story = getStory(storyId);
  if (!story) return renderStoryList();
  // Tanpa chapterId (mis. dari narasi/foto lama): buka bab terbit pertama.
  const chapter = (chapterId && getChapter(storyId, chapterId)) || story.chapters.find(readable);
  if (!chapter || !readable(chapter)) return renderStoryList();

  currentRef = { storyId: story.id, chapterId: chapter.id };
  const key = `${story.id}/${chapter.id}`;
  if (!blockCache.has(key)) {
    root.innerHTML = `<div class="stories-app"><p class="stories-coming">Loading chapter...</p></div>`;
    try {
      const snap = await getDocs(query(collection(db, 'stories', story.id, 'chapters', chapter.id, 'blocks'), orderBy('order', 'asc')));
      blockCache.set(key, snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    } catch (error) {
      console.error('Gagal memuat bab:', error);
      root.innerHTML = `<div class="stories-app"><h1>Stories</h1><p>Bab gagal dimuat. Periksa koneksi dan Firestore Rules.</p>
        <button type="button" class="stories-read" data-action="back-to-stories">← All stories</button></div>`;
      return;
    }
  }
  if (!currentRef || currentRef.chapterId !== chapter.id) return; // pengguna sudah pindah
  renderChapterPage(story, chapter, blockCache.get(key));
}

function renderChapterPage(story, chapter, blocks) {
  const idx = story.chapters.findIndex((c) => c.id === chapter.id);
  const next = story.chapters.slice(idx + 1).find(readable);
  root.innerHTML = `
    <div class="stories-app stories-app--reader">
      <nav class="stories-reader-nav">
        <button type="button" class="stories-back" data-action="back-to-stories">
          <span aria-hidden="true">←</span><span>All stories</span>
        </button>
        <span class="stories-reader-nav__part">${esc((chapter.part || '').toUpperCase())}</span>
      </nav>

      <article class="stories-reader">
        <header class="stories-reader__header" style="text-align:${chapterAlign(chapter)}">
          <p class="eyebrow">${esc((story.title || '').toUpperCase())}</p>
          <h1>${esc(chapter.title || '')}</h1>
          ${chapter.subtitle ? `<p class="stories-reader__sub">${esc(chapter.subtitle)}</p>` : ''}
          ${chapter.date ? `<p class="stories-reader__sub">${esc(dateLabel(chapter.date))}</p>` : ''}
        </header>

        ${blocks.length ? renderStoryBlocks(chapter, blocks) : '<p class="stories-coming">This part has no content yet.</p>'}

        <footer class="stories-reader__footer">
          ${next ? `<button type="button" class="stories-read" data-action="read-story-page" data-story="${esc(story.id)}" data-chapter="${esc(next.id)}">Next: ${esc(next.title || 'Untitled')} →</button>` : ''}
          <button type="button" class="stories-back" data-action="back-to-stories">← Back to contents</button>
        </footer>
      </article>
    </div>`;
  root.scrollTop = 0;
}

/** Dipakai foto/narasi: buka app Stories langsung di bab tertentu. */
export function openStoryChapter(storyId, chapterId) {
  pendingOpen = { storyId, chapterId };
  document.querySelector('.modal-backdrop .modal__close')?.click();
  openApp('stories');
  if (loaded) {
    const p = pendingOpen;
    pendingOpen = null;
    openChapter(p.storyId, p.chapterId);
  } else if (!loading) loadStories();
}

export function initStories(registerAction) {
  root = document.getElementById('app-stories');
  if (!root) return;

  registerAction('read-story-page', (el) => openChapter(el.dataset.story, el.dataset.chapter));
  registerAction('open-story-chapter', (el) => openStoryChapter(el.dataset.story, el.dataset.chapter));
  registerAction('back-to-stories', () => renderStoryList());
  registerAction('reload-stories', () => loadStories());

  initStoryLinks(registerAction);

  registerApp('stories', {
    root,
    render: () => {
      if (currentRef && getChapter(currentRef.storyId, currentRef.chapterId) && blockCache.has(`${currentRef.storyId}/${currentRef.chapterId}`)) {
        renderChapterPage(getStory(currentRef.storyId), getChapter(currentRef.storyId, currentRef.chapterId), blockCache.get(`${currentRef.storyId}/${currentRef.chapterId}`));
      } else if (!currentRef) renderStoryList();
    },
  });

  loadStories();
}