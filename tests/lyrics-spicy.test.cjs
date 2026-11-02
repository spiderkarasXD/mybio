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
  assert.deepEqual(elements.lyricsText.children.map(el => el.attrs['aria-label']), ['Two'], 'only the current line');
  assert.equal(creditText(), 'Текст: Apple Music', 'commercial source: provider only, no empty credits');

  // word-level community sync: words joined, background in parentheses, uploader + maker credited
  calls.length = 0;
  reply = url => url.hostname === 'api.spicylyrics.org' ? [200, { Body: { Type: 'Syllable', source: 'spicy_lyrics', id: 'aaaaaaaaaaaaaaaaaaaaaa',
    UploadAttribution: { Uploader: { username: 'spikerko', url: 'https://spicylyrics.org/uid/1' }, Maker: { username: 'gc', url: 'https://spicylyrics.org/uid/2' } },
    Content: [{ Type: 'Vocal', Lead: { StartTime: 1, Syllables: [{ Text: 'Hel', IsPartOfWord: true, StartTime: 1, EndTime: 1.2 }, { Text: 'lo', StartTime: 1.2, EndTime: 1.5 }, { Text: 'world', StartTime: 1.5, EndTime: 1.9 }] },
      Background: [{ Syllables: [{ Text: 'oh', StartTime: 1.6, EndTime: 1.8 }] }] },
      { Type: 'Vocal', Lead: { StartTime: 3, Syllables: [{ Text: 'Bye', StartTime: 3, EndTime: 3.4 }] } }] } }] : [500, null];
  api.setTrack({ title: 'Other', artist: 'Artist', spotifyId: 'aaaaaaaaaaaaaaaaaaaaaa', start: 0, end: 100000 });
  api.setPosition(1.25); await flush();
  const line = elements.lyricsText.children[0];
  assert.equal(line.attrs['aria-label'], 'Hello world (oh)');
  const pieces = () => line.children[0].children.filter((_, i) => i % 2 === 0).map(s => [s.className, s.textContent]);
  const seps = () => line.children[0].children.filter((_, i) => i % 2 === 1).map(s => s.textContent);
  let now = pieces();
  assert.equal(now[0][0], 'u new'); assert.equal(now[0][1], 'Hel');
  assert.equal(now[1][0], 'u gl', 'the piece being sung right now is a glitch');
  assert.equal(now[2][0], 'u wait', 'not sung yet (no old line) = empty');
  api.setPosition(2.9);
  now = pieces();
  assert.deepEqual(now.map(p => p[1]), ['Hel', 'lo', 'world', '(oh)'], 'every piece has arrived');
  assert.ok(now.every(p => p[0].startsWith('u new')));
  assert.deepEqual(seps(), ['', ' ', ' ', ''], 'syllables of one word stay together, words spaced');

  // the next line takes over the old one in place: its one word glitches over "Hello",
  // and the old tail ("world (oh)") glitches away because the new line is shorter
  api.setPosition(3.05);
  now = pieces();
  assert.deepEqual(now.map(p => p[0]), ['u gl', 'u gl', 'u gl']);
  api.setPosition(3.6);
  now = pieces();
  assert.deepEqual(now.map(p => [p[0], p[1]]), [['u new', 'Bye'], ['u gone', ''], ['u gone', '']]);
  assert.equal(creditText(), 'Текст: Spicy Lyrics · загрузил spikerko, сделал gc');

  // Spicy has nothing -> LRCLIB answers and is credited
  calls.length = 0;
  reply = url => url.hostname === 'api.spicylyrics.org' ? [404, { Body: { error: 'lyrics_not_found' } }]
    : url.pathname.endsWith('/get') ? [200, { syncedLyrics: '[00:01.00]L1\n[00:02.00]L2' }] : [404, null];
  api.setTrack({ title: 'Third', artist: 'Artist', spotifyId: 'bbbbbbbbbbbbbbbbbbbbbb', start: 0, end: 100000 });
  api.setPosition(1.5); await flush();
  assert.ok(calls.some(([u]) => u.includes('lrclib.net')), 'falls back to LRCLIB');
  assert.equal(elements.lyricsText.children[0].attrs['aria-label'], 'L1');
  assert.equal(creditText(), 'Текст: LRCLIB');

  // the user's example: "ddd ddd ddd" → "EEE EEE EEE", one word at a time as it is sung
  const w3 = (txt, s) => ({ Type: 'Vocal', Lead: { StartTime: s, Syllables: txt.split(' ').map((x, i) => ({ Text: x, StartTime: s + i, EndTime: s + i + 0.8 })) } });
  reply = url => url.hostname === 'api.spicylyrics.org' ? [200, { Body: { Type: 'Syllable', source: 'apple_music', id: 'dddddddddddddddddddddd',
    Content: [w3('ddd ddd ddd', 1), w3('EEE EEE EEE', 10)] } }] : [500, null];
  api.setTrack({ title: 'Example', artist: 'Artist', spotifyId: 'dddddddddddddddddddddd', start: 0, end: 100000 });
  api.setPosition(9); await flush();
  const view = () => elements.lyricsText.children[0].children[0].children.filter((_, i) => i % 2 === 0)
    .map(s => s.className === 'u gl' ? '///' : s.textContent).join(' ');
  assert.equal(view(), 'ddd ddd ddd');
  api.setPosition(10.05); assert.equal(view(), '/// ddd ddd', 'step 1');
  api.setPosition(11.05); assert.equal(view(), 'EEE /// ddd', 'step 2');
  api.setPosition(12.05); assert.equal(view(), 'EEE EEE ///', 'step 3');
  api.setPosition(12.5); assert.equal(view(), 'EEE EEE EEE', 'step 4');

  // a line that repeats the previous one keeps its text and counts x2, x3
  reply = url => url.hostname === 'api.spicylyrics.org' ? [200, { Body: { Type: 'Line', source: 'apple_music', id: 'cccccccccccccccccccccc',
    Content: [{ Type: 'Vocal', Text: 'Na na na', StartTime: 1 }, { Type: 'Vocal', Text: 'Na, na, na!', StartTime: 2 }, { Type: 'Vocal', Text: 'na na na', StartTime: 3 }, { Type: 'Vocal', Text: 'Hey', StartTime: 4 }] } }] : [500, null];
  api.setTrack({ title: 'Rep', artist: 'Artist', spotifyId: 'cccccccccccccccccccccc', start: 0, end: 100000 });
  api.setPosition(1.1); await flush();
  const badge = () => elements.lyricsText.children[0].children[1];
  assert.equal(badge().hidden, true, 'first time: no counter');
  api.setPosition(2.1); assert.equal(badge().hidden, false); assert.equal(badge().textContent, 'x2');
  api.setPosition(3.1); assert.equal(badge().textContent, 'x3', 'punctuation and case do not matter');
  api.setPosition(4.1); assert.equal(badge().hidden, true, 'a new line resets the counter');
  assert.equal(elements.lyricsText.children[0].attrs['aria-label'], 'Hey');

  // TIDAL & co (no Spotify id): Spicy is not asked at all
  calls.length = 0;
  api.setTrack({ title: 'Fourth', artist: 'Artist', start: 0, end: 100000 }); await flush();
  assert.ok(calls.every(([u]) => !u.includes('spicylyrics')), 'no Spotify id -> no Spicy request');
  console.log('PASS: spicy line sync, syllable sync + community credit, word-by-word takeover, repeat counter, LRCLIB fallback, no-id skip');
})().catch(error => { console.error(error); process.exitCode = 1; });
