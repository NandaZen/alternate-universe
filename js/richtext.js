import { esc } from './utils.js';

const ALIGN_RE = /^:(left|center|right|justify):[ \t]*/;
const MUSIC_RE = /^\[\[music:\s*(https?:\/\/[^\s|\]]+)\s*(?:\|\s*([^\]]*?))?\s*\]\]$/;

const inline = (s) =>
  esc(s)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

function musicCard(url, title) {
  return `<div class="rt-music">
    <div class="rt-music__head"><span class="rt-music__ico" aria-hidden="true">🎵</span><span class="rt-music__title">${esc(title || 'Putar musik')}</span></div>
    <audio controls preload="none" src="${esc(url)}"></audio>
  </div>`;
}

/** Teks → <p> per paragraf. Paragraf dipisah baris kosong; awalan :center: dst. mengatur rata teks. */
export function richText(text, defaultAlign = 'left', cls = 'rt-p') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const music = p.match(MUSIC_RE);
      if (music) return musicCard(music[1], music[2]);
      let al = defaultAlign;
      const m = p.match(ALIGN_RE);
      if (m) {
        al = m[1];
        p = p.slice(m[0].length);
      }
      return `<p class="${cls} align-${al}" style="text-align:${al}">${inline(p)}</p>`;
    })
    .join('');
}