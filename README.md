# Austin Amateur Radio Club — Hugo Site

A static port of [austinhams.org](https://austinhams.org) from WordPress to [Hugo](https://gohugo.io/).

## Layout

```
content/        Migrated WordPress posts & pages (Markdown)
  posts/        422 blog posts (slug-based URLs match WP)
  events/       Migrated The Events Calendar entries
  <page>/       Each WordPress page is a directory with _index.md
layouts/        Hugo templates (Tailwind via CDN, mobile-friendly)
static/         All media downloaded from /wp-content/uploads/
scripts/
  migrate.mjs   WordPress REST API → Hugo migration script
  .cache/json/  Cached API responses (delete to force re-fetch)
```

URL structure matches the original WordPress site (`/<slug>/`) so external links don't break.

## Develop

```bash
hugo server          # http://localhost:1313/
```

## Build for production

```bash
hugo --gc --minify   # outputs to ./public
```

Deploy `public/` to any static host (Cloudflare Pages, Netlify, GitHub Pages, S3+CloudFront, etc.).

## Deploy to Cloudflare Pages

This repo is wired for Cloudflare Pages. Two paths:

### 1. Git integration (recommended)

In the Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git,
select this repo and use:

- **Framework preset:** Hugo
- **Build command:** `hugo --gc --minify`
- **Build output directory:** `public`
- **Environment variables** (Settings → Environment variables):
  - `HUGO_VERSION` = `0.162.0` (match `.tool-versions`)
  - `NODE_VERSION` = `20`

Cloudflare Pages will pick up `wrangler.toml` and use `pages_build_output_dir`
for future Wrangler-managed deploys.

### 2. Direct upload via Wrangler CLI

```bash
npm install                                    # installs wrangler
npx wrangler login                             # one-time
npm run build                                  # hugo --gc --minify
npx wrangler pages deploy ./public --project-name=austinhams
```

Or the shortcut: `npm run deploy`.

### Headers / redirects

`static/_headers` and `static/_redirects` are copied verbatim into `public/`
during the Hugo build and are interpreted by Cloudflare Pages. Edit those files
to adjust security headers, cache rules, and URL redirects.

### Worker (ICS proxy)

The Cloudflare Worker in [workers/ics-proxy](workers/ics-proxy) is deployed
separately:

```bash
cd workers/ics-proxy
npx wrangler deploy
```

## Re-running the migration

```bash
rm -rf scripts/.cache/json    # optional: clear API cache to pull fresh content
node scripts/migrate.mjs
```

The script is idempotent — it overwrites `content/` and adds new media to `static/wp-content/uploads/`.
Existing media files are skipped (not re-downloaded).

## Adding an AARCover Newsletter issue

The AARCover newsletter archive is fully data-driven. Every issue lives in
[data/aarcover.yaml](data/aarcover.yaml) and the whole archive renders from
[layouts/aarcover-archive/list.html](layouts/aarcover-archive/list.html) at
`/aarcover-archive/`.

To add a new issue, prepend an entry to the `issues:` list (keep it newest
first):

```yaml
issues:
  - year: 2026
    month: "April"
    monthNum: 4
    pdfUrl: "https://s3.us-east-1.amazonaws.com/archive.austinhams.org/aarcover/AARCover_2026-04.pdf"
  # ...older issues below
```

That's it — no per-issue content file is needed. The archive page groups issues
by year and links each one directly to its PDF.

## Creating a Meeting Archive post

Meeting archive posts are data-driven: you provide a YouTube video ID and a
list of PDF (or other) downloads in the front matter, and the layout renders
an embedded player plus a styled downloads section automatically.

### 1. Generate the post

```bash
hugo new posts/2026-05-monthly-meeting.md --kind meeting-archive
```

(`--kind meeting-archive` uses [archetypes/meeting-archive.md](archetypes/meeting-archive.md).)

### 2. Fill in the front matter

```yaml
---
title: "May 2026 Monthly Meeting — Antenna Modeling with NEC"
slug: "2026-05-monthly-meeting"
date: 2026-05-14T19:00:00-05:00
draft: false
type: "meeting-archive"          # REQUIRED — selects the custom layout
author: "AARC"
categories:
  - "Meeting Archive"
youtube_id: "dQw4w9WgXcQ"        # the v= part of the YouTube URL
presenter: "Jane Doe, K5XYZ"     # optional
downloads:
  - title: "Slide Deck"
    url: "/wp-content/uploads/2026/05/antenna-modeling.pdf"
    description: "Full presentation slides (12 MB)"
  - title: "NEC Example Files"
    url: "/wp-content/uploads/2026/05/nec-examples.zip"
---

Optional intro / meeting notes in Markdown go below the front matter.
```

### 3. Add the PDFs

Drop the files under `static/wp-content/uploads/<year>/<month>/`. Anything
under `static/` is served from the site root, so a file at
`static/wp-content/uploads/2026/05/antenna-modeling.pdf` is reachable at
`/wp-content/uploads/2026/05/antenna-modeling.pdf` — exactly what you put in
the `downloads[].url` field.

External URLs (e.g. Dropbox, Google Drive) work too and will open in a new tab.

### How it renders

The [meeting-archive/single.html](layouts/meeting-archive/single.html) template
produces, in order:

1. Title, date, presenter
2. Responsive 16:9 YouTube embed (privacy-enhanced `youtube-nocookie.com`)
3. The Markdown body (if any)
4. A boxed **Downloads & Handouts** section, one row per `downloads` entry
5. Category links

Only `youtube_id` and at least one `downloads` entry are needed for the
template to look complete — both blocks are skipped if their data is missing.

## Known limitations / next steps

- **Forms** (Contact, Join). WordPress plugin forms aren't migrated. Wire up
  Formspree / Netlify Forms / a Cloudflare Worker for `/contact/` and `/join/`.
- **Theme/design** is a clean Tailwind starter, not a pixel-replica of the
  current Solfire design. Adjust `layouts/` and `partials/` to taste.
