/* Lyrics for the current track, supplied by LRCLIB. */
(() => {
  const panel = document.getElementById('lyrics');
  const text = document.getElementById('lyricsText');
  const retry = document.getElementById('lyricsRetry');
  const cache = new Map();
  let current = null, controller = null, generation = 0;

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
          const synced = typeof data.syncedLyrics === 'string'
            ? data.syncedLyrics.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim() : '';
          result = { message: data.instrumental ? 'Инструментальная композиция' : plain || synced || 'Текст не найден' };
        }
        if (version !== generation) return;
        if (cache.size >= 20) cache.delete(cache.keys().next().value);
        cache.set(track.key, result);
      }
      if (version === generation) text.textContent = result.message;
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
    setTrack(track) {
      const key = track?.title && track?.artist ? JSON.stringify([track.artist, track.title, track.album || '']) : null;
      if (key && key === current?.key) return;
      generation++;
      controller?.abort();
      current = key ? { ...track, key } : null;
      panel.hidden = !current;
      panel.setAttribute('aria-busy', 'false');
      text.textContent = '';
      retry.hidden = true;
      if (current) void load();
    }
  };
  panel.addEventListener('toggle', () => { if (panel.open) void load(); });
  retry.addEventListener('click', () => void load());
})();
