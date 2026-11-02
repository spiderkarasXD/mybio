/* Lyrics for the current track, supplied by LRCLIB. */
(() => {
  const panel = document.getElementById('lyrics');
  const text = document.getElementById('lyricsText');
  const retry = document.getElementById('lyricsRetry');
  const cache = new Map();
  const status = document.getElementById('lyricsStatus');
  const follow = document.getElementById('lyricsFollow');
  let current = null, controller = null, generation = 0;
  let lines = [], active = -2, position = null, manual = false;

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
    status.textContent = timed ? 'Синхронизация по строкам' : 'Без синхронизации · нет позиции трека';
    let next = -1;
    if (timed) for (let i = 0; i < lines.length && lines[i].time <= position; i++) next = i;
    if (next === active) return;
    active = next;
    [...text.children].forEach((el, i) => {
      el.classList.toggle('is-active', i === active);
      el.classList.toggle('is-past', timed && i < active);
      if (i === active) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
    });
    if (!manual && panel.open && active >= 0) {
      const el = text.children[active];
      text.scrollTo({ top: el.offsetTop - text.offsetTop - text.clientHeight / 2 + el.clientHeight / 2,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }

  function render(result) {
    lines = result.lines || [];
    active = -2;
    text.replaceChildren();
    if (lines.length) {
      for (const line of lines) {
        const el = document.createElement('div');
        el.className = 'lyric-line';
        el.textContent = line.value || '♪';
        text.append(el);
      }
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
    const timeout = setTimeout(() => request.abort(), 10000);
    try {
      let result = cache.get(track.key);
      if (!result) {
        const params = new URLSearchParams({ artist_name: track.artist, track_name: track.title });
        if (track.album) params.set('album_name', track.album);
        const response = await fetch(`https://lrclib.net/api/get?${params}`, { signal: request.signal });
        if (response.status === 404) result = { message: 'Текст не найден' };
        else {
          if (!response.ok) throw new Error('Lyrics request failed');
          const data = await response.json();
          const plain = typeof data.plainLyrics === 'string' ? data.plainLyrics.trim() : '';
          const synced = typeof data.syncedLyrics === 'string' ? parseLrc(data.syncedLyrics) : [];
          result = data.instrumental ? { message: 'Инструментальная композиция' }
            : synced.length ? { lines: synced }
            : { message: plain || 'Текст не найден', static: !!plain };
        }
        if (version !== generation) return;
        if (cache.size >= 20) cache.delete(cache.keys().next().value);
        cache.set(track.key, result);
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
      lines = []; active = -2; position = null; manual = false;
      follow.hidden = true;
      text.scrollTop = 0;
      retry.hidden = true;
      if (current) void load();
    }
  };
  panel.addEventListener('toggle', () => { if (panel.open) void load(); });
  retry.addEventListener('click', () => void load());
  for (const event of ['wheel', 'touchstart', 'keydown']) text.addEventListener(event, () => {
    manual = true; follow.hidden = !lines.length;
  }, { passive: true });
  follow.addEventListener('click', () => { manual = false; follow.hidden = true; active = -2; sync(); });
})();
