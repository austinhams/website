# Austin Amateur Radio Club — Hugo Site

A static port of [austinhams.org](https://austinhams.org) from WordPress to [Hugo](https://gohugo.io/).

## Layout

```
content/        Migrated WordPress posts & pages (Markdown)
  posts/        422 blog posts (slug-based URLs match WP)
  events/       Migrated The Events Calendar entries
  <page>/       Each WordPress page is a directory with _index.md
                (page/post images live beside the Markdown as bundle resources)
layouts/        Hugo templates (Tailwind via CDN, mobile-friendly)
static/
  img/people/   Member, officer & honoree headshots
  img/site/     Site chrome (no-photo placeholder, hero images)
  pdf/<slug>/   PDFs (newsletters, presentations, handouts) grouped by owning post
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

The script is idempotent — it overwrites `content/` and (in its original form)
downloaded media to `static/wp-content/uploads/`. Note: media has since been
reorganized into page bundles, `static/img/`, and `static/pdf/<slug>/`, and the
`wp-content/` tree was removed — so re-running the legacy importer would need its
media paths updated to match the new layout.

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

## Meeting Archives (data-driven)

The meeting archive section is now powered by `data/meeting_archives.yaml`. Add
each meeting under `meetings:` with one optional `youtube_id` and one or more
`downloads`. The `/meeting-archives/` page renders the archive list directly
from this data file.

### Add a meeting entry

```yaml
meetings:
  - title: "May 2026 Monthly Meeting — Antenna Modeling with NEC"
    slug: "2026-05-monthly-meeting"
    date: "2026-05-14T19:00:00-05:00"
    author: "AARC"
    presenter: "Jane Doe, K5XYZ"
    summary: "Monthly meeting record with antenna modeling presentation."
    youtube_id: "dQw4w9WgXcQ"
    downloads:
      - title: "Slide Deck"
        url: "/pdf/2026-05-monthly-meeting/antenna-modeling.pdf"
        description: "Full presentation slides (12 MB)"
      - title: "NEC Example Files"
        url: "/pdf/2026-05-monthly-meeting/nec-examples.zip"
```

### Add the downloads

Drop the files under `static/pdf/<slug>/` (one folder per meeting). Anything
under `static/` is served from the site root, so a file at
`static/pdf/2026-05-monthly-meeting/antenna-modeling.pdf` is reachable at
`/pdf/2026-05-monthly-meeting/antenna-modeling.pdf` — exactly what you put in
`downloads[].url`.

External URLs (e.g. Dropbox, Google Drive) work too and will open in a new tab.

### How it renders

The meeting archive list page produces, in order:

1. Title, date, presenter
2. Optional YouTube video link with thumbnail
3. Meeting summary
4. A downloads section with one or more files

Only `youtube_id` and at least one `downloads` entry are needed for the
template to look complete.

## Known limitations / next steps

- **Forms** (Contact, Join). WordPress plugin forms aren't migrated. Wire up
  Formspree / Netlify Forms / a Cloudflare Worker for `/contact/` and `/join/`.
- **Theme/design** is a clean Tailwind starter, not a pixel-replica of the
  current Solfire design. Adjust `layouts/` and `partials/` to taste.
