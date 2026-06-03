/**
 * AARC ICS proxy
 *
 * Fetches the groups.io ICS feed and re-serves it with CORS headers so the
 * browser-side calendar on austinhams.org can load it directly. Caches at the
 * edge for 10 minutes (groups.io publishes a 1-hour TTL).
 *
 * Deploy:
 *   npm install --global wrangler
 *   wrangler login
 *   wrangler deploy
 *
 * Then point content/events/_index.md ics_url at the worker URL.
 */

const UPSTREAM = 'https://austinhams.groups.io/g/main/ics/12861783/1650985384/feed.ics';
const ALLOWED_ORIGINS = [
  'https://austinhams.org',
  'https://www.austinhams.org',
  'https://website-4rx.pages.dev',
  'http://localhost:1313',
  'http://127.0.0.1:1313',
];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://austinhams.org';

    const baseHeaders = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: baseHeaders });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: baseHeaders });
    }

    // Edge cache (10 min). Cloudflare keys the cache on the request URL.
    const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      const upstream = await fetch(UPSTREAM, {
        headers: { 'User-Agent': 'AARC-ICS-Proxy/1.0 (+https://austinhams.org)' },
        cf: { cacheTtl: 600, cacheEverything: true },
      });

      if (!upstream.ok) {
        return new Response(`Upstream error: ${upstream.status}`, {
          status: 502,
          headers: baseHeaders,
        });
      }

      const body = await upstream.text();
      response = new Response(body, {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'public, max-age=600, s-maxage=600',
        },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    } else {
      // Patch CORS headers for the current origin on a cache hit
      response = new Response(response.body, response);
      for (const [k, v] of Object.entries(baseHeaders)) response.headers.set(k, v);
    }

    return response;
  },
};
