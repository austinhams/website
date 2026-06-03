# AARC ICS Proxy (Cloudflare Worker)

A tiny Cloudflare Worker that fetches the groups.io ICS calendar feed and
re-serves it with CORS headers + a 10-minute edge cache, so the FullCalendar
widget on austinhams.org can load it live in the browser.

## Deploy

```bash
npm install --global wrangler
wrangler login
cd workers/ics-proxy
wrangler deploy
```

Wrangler will print the deployed URL, e.g.:
`https://aarc-ics-proxy.<your-subdomain>.workers.dev`

Then update [`content/events/_index.md`](../../content/events/_index.md) so
`ics_url` points at that URL, and rebuild Hugo.

### Custom route (recommended)

If `austinhams.org` is on Cloudflare, uncomment the `routes` block in
[`wrangler.toml`](./wrangler.toml) so the proxy lives at
`https://austinhams.org/calendar/aarc.ics`. That way the calendar URL is on
your own domain and you can change the upstream feed without touching the
site source.
