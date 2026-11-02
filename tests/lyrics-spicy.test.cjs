// Spicy Lyrics path of lyrics.js: line + syllable syncs, attribution rule, LRCLIB fallback.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function element() {
  return { open: true, hidden: false, textContent: '', children: [], handlers: {}, attrs: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.handlers[k] = f; },
    replaceChildren(...kids) { this.children = kids; }, append(el) { this.children.push(el); } };
}
const elements = Object.fromEntries(['lyrics', 'lyricsText', 'lyricsRetry', 'lyricsStatus', 'lyricsCredit'].map(id => [id, element()]));
const calls = [];
let reply;
const context = { window: {}, document: { getElementById: id => elements[id], createElement: element },
  URLSearchParams, AbortController, setTimeout, clearTimeout,
  fetch: async (url, init) => { calls.push([url, init?.headers?.Authorization]); const [status, data] = reply(new URL(url)); return { status, ok: status === 200, json: async () => data }; } };
const source = readFileSync(join(__dirname, '../lyrics.js'), 'utf8').replace(/const SPICY_PROXY = '[^']*';/, "const SPICY_PROXY = '';").replace("const SPICY_KEY = '';", "const SPICY_KEY = 'sl_pk_test';");
vm.runInNewContext(source, context);
const api = context.window.MyBioLyrics;
const flush = () => new Promise(resolve => setImmediate(resolve));
const creditText = () => elements.lyricsCredit.children.map(c => typeof c === 'string' ? c : c.textContent).join('');
const id = '1QV6tiMFM6fSOKOGLMHYYg';
(async () => {
  // line-level sync from Apple Music: provider only
  reply = url => url.hostname === 'api.spicylyrics.org' ? [200, { Body: { Type: 'Line', source: 'apple_music', id,
    Content: [{ Type: 'Vocal', Text: 'One', StartTime: 1 }, { Type: 'Vocal', Text: 'Two', StartTime: 2 }, { Type: 'Vocal', Text: 'Three', StartTime: 3 }] } }] : [500, null];
  api.setTrack({ title: 'Song', artist: 'Artist', spotifyId: id, start: 0, end: 100000 });
  api.setPosition(2.2); await flush();
  assert.equal(calls[0][0], `https://api.spicylyrics.org/v1/lyrics/${id}`);
  assert.equal(calls[0][1], 'Bearer sl_pk_test');
  assert.deepEqual(elements.lyricsText.children.map(el => el.textContent), ['One', 'Two', 'Three']);
  assert.equal(creditText(), 'Текст: Apple Music', 'commercial source: provider only, no empty credits');

  // word-level community sync: words joined, background in parentheses, uploader + maker credited
  calls.length = 0;
  reply = url => url.hostname === 'api.spicylyrics.org' ? [200, { Body: { Type: 'Syllable', source: 'spicy_lyrics', id: 'aaaaaaaaaaaaaaaaaaaaaa',
    UploadAttribution: { Uploader: { username: 'spikerko', url: 'https://spicylyrics.org/uid/1' }, Maker: { username: 'gc', url: 'https://spicylyrics.org/uid/2' } },
    Content: [{ Type: 'Vocal', Lead: { StartTime: 1, Syllables: [{ Text: 'Hel', IsPartOfWord: true, StartTime: 1 }, { Text: 'lo', StartTime: 1.2 }, { Text: 'world', StartTime: 1.5 }] },
      Background: [{ Syllables: [{ Text: 'oh', StartTime: 1.6 }] }] },
      { Type: 'Vocal', Lead: { StartTime: 3, Syllables: [{ Text: 'Bye', StartTime: 3 }] } }] } }] : [500, null];
  api.setTrack({ title: 'Other', artist: 'Artist', spotifyId: 'aaaaaaaaaaaaaaaaaaaaaa', start: 0, end: 100000 });
  api.setPosition(1.3); await flush();
  assert.equal(elements.lyricsText.children[1].textContent, 'Hello world (oh)');
  assert.equal(creditText(), 'Текст: Spicy Lyrics · загрузил spikerko, сделал gc');

  // Spicy has nothing -> LRCLIB answers and is credited
  calls.length = 0;
  reply = url => url.hostname === 'api.spicylyrics.org' ? [404, { Body: { error: 'lyrics_not_found' } }]
    : url.pathname.endsWith('/get') ? [200, { syncedLyrics: '[00:01.00]L1\n[00:02.00]L2' }] : [404, null];
  api.setTrack({ title: 'Third', artist: 'Artist', spotifyId: 'bbbbbbbbbbbbbbbbbbbbbb', start: 0, end: 100000 });
  api.setPosition(1.5); await flush();
  assert.ok(calls.some(([u]) => u.includes('lrclib.net')), 'falls back to LRCLIB');
  assert.equal(elements.lyricsText.children[1].textContent, 'L1');
  assert.equal(creditText(), 'Текст: LRCLIB');

  // TIDAL & co (no Spotify id): Spicy is not asked at all
  calls.length = 0;
  api.setTrack({ title: 'Fourth', artist: 'Artist', start: 0, end: 100000 }); await flush();
  assert.ok(calls.every(([u]) => !u.includes('spicylyrics')), 'no Spotify id -> no Spicy request');
  console.log('PASS: spicy line sync, syllable sync + community credit, LRCLIB fallback, no-id skip');
})().catch(error => { console.error(error); process.exitCode = 1; });
