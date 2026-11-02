/* Lyrics for the current track, supplied by LRCLIB. */
(() => {
  const panel = document.getElementById('lyrics');
  const text = document.getElementById('lyricsText');
  const retry = document.getElementById('lyricsRetry');
  const cache = new Map();
  const status = document.getElementById('lyricsStatus');
  let current = null, controller = null, generation = 0;
  let lines = [], active = -2, position = null;

  function normalize(value) {
    return value.normalize('NFKC').toLowerCase().replace(/\s*\(?feat\.?\s.*$/i, '')
      .replace(/\s*[-–(]\s*(?:\d{4}\s*)?remaster(?:ed)?[^)]*\)?/ig, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  async function lookup(track, signal) {
    const request = async (path, params) => {
      const res = await fetch(`https://lrclib.net/api/${path}?${new URLSearchParams(params)}`, { signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Lyrics request failed');
      return res.json();
    };
    const base = { artist_name: track.artist, track_name: track.title };
    let found = await request('get', track.album ? { ...base, album_name: track.album } : base);
    const usable = item => item && (item.instrumental || item.plainLyrics?.trim() || item.syncedLyrics?.trim());
    if (found?.syncedLyrics?.trim() || found?.instrumental) return found;
    if (track.album) {
      const withoutAlbum = await request('get', base);
      if (withoutAlbum?.syncedLyrics?.trim() || withoutAlbum?.instrumental) return withoutAlbum;
      if (!usable(found)) found = withoutAlbum;
    }
    // Search alternate releases; reject unrelated titles and artists rather than guessing.
    const primaryArtist = track.artist.split(/,|;| & /)[0].trim();
    let candidates;
    try { candidates = await request('search', { q: `${primaryArtist} ${normalize(track.title)}` }); }
    catch (error) { if (usable(found) && !signal.aborted) return found; throw error; }
    const duration = track.end > track.start ? (track.end - track.start) / 1000 : null;
    const matches = (Array.isArray(candidates) ? candidates : []).filter(item =>
      usable(item) && normalize(item.trackName || '') === normalize(track.title) &&
      normalize(item.artistName || '') === normalize(primaryArtist) &&
      (!duration || !Number.isFinite(item.duration) || Math.abs(item.duration - duration) <= 4));
    matches.sort((a, b) => Number(!!b.syncedLyrics?.trim()) - Number(!!a.syncedLyrics?.trim()));
    return matches[0] || found;
  }

  function parseLrc(source) {
    const result = [];
    const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
    for (const raw of source.split(/\r?\n/)) {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      const value = raw.replace(/\[[^\]]*\]/g, '').trim();
      for (const stamp of stamps) result.push({ time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + offset), value });
    }
    return result.sort((a, b) => a.time - b.time);
  }

  function sync() {
    if (!lines.length) return;
    const timed = Number.isFinite(position);
    status.textContent = timed ? '' : 'Нет позиции воспроизведения';
    let next = -1;
    if (timed) for (let i = 0; i < lines.length && lines[i].time <= position; i++) next = i;
    if (next === active) return;
    active = next;
    text.replaceChildren();
    text.classList.add('is-synced');
    // Render only the neighbours: there is no scrollable surface to drag out of sync.
    const center = Math.max(0, active);
    let current = null;
    for (const index of [center - 1, center, center + 1]) {
      const el = document.createElement('div');
      el.className = 'lyric-line';
      el.textContent = lines[index]?.value || (index >= 0 && index < lines.length ? '♪' : '\u00a0');
      el.classList.toggle('is-active', timed && index === active);
      el.classList.toggle('is-past', index < center);
      if (timed && index === active) { el.setAttribute('aria-current', 'true'); current = el; }
      text.append(el);
    }
    // the new line glitches in like the nickname (same scramble from index.html)
    if (current && current.textContent.trim() && typeof window.glitchText === 'function') window.glitchText(current, current.textContent, 700);
  }

  function render(result) {
    lines = result.lines || [];
    active = -2;
    text.replaceChildren();
    text.classList.remove('is-synced');
    if (lines.length) {
      sync();
    } else {
      text.textContent = result.message;
      status.textContent = result.static ? 'Без синхронизации · нет временных меток' : '';
    }
  }

  async function load() {
    if (!current || !panel.open) return;
    const track = current;
    const version = ++generation;
    controller?.abort();
    controller = new AbortController();
    const request = controller;
    retry.hidden = true;
    text.textContent = 'Загрузка текста…';
    panel.setAttribute('aria-busy', 'true');
    const timeout = setTimeout(() => request.abort(), 18000);
    try {
      let result = cache.get(track.key);
      if (!result) {
        const data = await lookup(track, request.signal);
        if (!data) result = { message: 'Текст не найден' };
        else {
          const plain = typeof data.plainLyrics === 'string' ? data.plainLyrics.trim() : '';
          const synced = typeof data.syncedLyrics === 'string' ? parseLrc(data.syncedLyrics) : [];
          result = data.instrumental ? { message: 'Инструментальная композиция' }
            : synced.length ? { lines: synced }
            : { message: plain || 'Текст не найден', static: !!plain };
        }
        if (version !== generation) return;
        if (cache.size >= 20) cache.delete(cache.keys().next().value);
        if (result.lines || result.static || data?.instrumental) cache.set(track.key, result);
      }
      if (version === generation) render(result);
    } catch {
      if (version !== generation) return;
      text.textContent = 'Не удалось загрузить текст';
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      if (version === generation) panel.setAttribute('aria-busy', 'false');
    }
  }

  window.MyBioLyrics = {
    setPosition(seconds) { position = Number.isFinite(seconds) ? seconds : null; sync(); },
    setTrack(track) {
      const key = track?.title && track?.artist ? JSON.stringify([track.artist, track.title, track.album || '']) : null;
      if (key && key === current?.key) return;
      generation++;
      controller?.abort();
      current = key ? { ...track, key } : null;
      panel.hidden = !current;
      panel.setAttribute('aria-busy', 'false');
      text.textContent = '';
      status.textContent = '';
      lines = []; active = -2; position = null;
      text.classList.remove('is-synced');
      retry.hidden = true;
      if (current) void load();
    }
  };
  panel.addEventListener('toggle', () => { if (panel.open) void load(); });
  retry.addEventListener('click', () => void load());
})();
