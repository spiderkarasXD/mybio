// Cloudflare Worker: keeps the Spicy Lyrics *secret* key off the public site.
// The site calls  https://<worker>.workers.dev/v1/lyrics/<spotifyTrackId>
// and the worker forwards it to api.spicylyrics.org with the key from the SPICY_KEY secret.
//
// Deploy: Cloudflare dashboard → Workers & Pages → Create → Worker → paste this file → Deploy,
// then Settings → Variables and Secrets → add secret SPICY_KEY = sl_sk_…
const ALLOWED = ['https://spiderkaras.fun', 'https://www.spiderkaras.fun'];

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin'
});

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    // only our site (and localhost while testing) may use the key
    const allowed = ALLOWED.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!allowed) return new Response('forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors(origin) });

    const match = new URL(request.url).pathname.match(/^\/v1\/lyrics\/([0-9A-Za-z]{22})$/);
    if (!match) return new Response(JSON.stringify({ error: 'invalid_track_id' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    if (!env.SPICY_KEY) return new Response(JSON.stringify({ error: 'SPICY_KEY secret is not set' }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

    // cache answers for a day: lyrics rarely change and the API allows 60 requests a minute
    const cache = caches.default;
    const cacheKey = new Request(`https://lyrics-cache.internal/${match[1]}`);
    let res = await cache.match(cacheKey);
    if (!res) {
      const upstream = await fetch(`https://api.spicylyrics.org/v1/lyrics/${match[1]}`, {
        headers: { Authorization: `Bearer ${env.SPICY_KEY}` }
      });
      res = new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
      if (upstream.ok || upstream.status === 404) {
        res.headers.set('Cache-Control', `public, max-age=${upstream.ok ? 86400 : 21600}`);
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
      }
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors(origin))) out.headers.set(k, v);
    return out;
  }
};
