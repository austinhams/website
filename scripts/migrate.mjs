#!/usr/bin/env node
// Migrate WordPress (austinhams.org) -> Hugo content tree.
// Reads from the live WP REST API, downloads images, converts HTML to Markdown.

import fs from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { URL } from 'node:url';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { parse as parseHTML } from 'node-html-parser';
import pLimit from 'p-limit';

const SITE = 'https://austinhams.org';
const API = `${SITE}/wp-json/wp/v2`;
const ROOT = path.resolve(process.cwd());
const CONTENT_DIR = path.join(ROOT, 'content');
const STATIC_DIR = path.join(ROOT, 'static');
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache');

const UA = 'Mozilla/5.0 (AARC-Migrator/1.0)';
const limit = pLimit(6);
const downloadLimit = pLimit(8);

// ---------- small utilities ----------

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&hellip;|&#8230;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"');
}

function yamlEscape(v) {
  if (v == null) return '""';
  const s = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
  return `"${s}"`;
}

function toFrontMatter(obj) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlEscape(item)}`);
    } else if (typeof v === 'boolean') {
      lines.push(`${k}: ${v}`);
    } else {
      lines.push(`${k}: ${yamlEscape(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

// ---------- HTTP with retry + cache ----------

async function fetchJSON(url) {
  const cacheKey = path.join(CACHE_DIR, 'json', encodeURIComponent(url) + '.json');
  if (existsSync(cacheKey)) {
    try { return JSON.parse(await fs.readFile(cacheKey, 'utf8')); } catch { /* refetch */ }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const totalPages = Number(res.headers.get('x-wp-totalpages') || 1);
      const data = await res.json();
      await ensureDir(path.dirname(cacheKey));
      await fs.writeFile(cacheKey, JSON.stringify(data));
      data.__totalPages = totalPages;
      return data;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

async function fetchAll(endpoint, params = {}) {
  const results = [];
  let page = 1;
  while (true) {
    const qs = new URLSearchParams({ per_page: '100', page: String(page), ...params }).toString();
    let data;
    try {
      data = await fetchJSON(`${API}/${endpoint}?${qs}`);
    } catch (err) {
      // WP returns 400 when paging past the end
      if (String(err.message).includes('HTTP 400')) break;
      throw err;
    }
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (page >= (data.__totalPages || 1)) break;
    page++;
  }
  return results;
}

// ---------- media download ----------

const downloadedMedia = new Map(); // remoteUrl -> localPath (site-rooted, e.g. /wp-content/uploads/...)

async function downloadMedia(remoteUrl) {
  if (!remoteUrl) return null;
  if (downloadedMedia.has(remoteUrl)) return downloadedMedia.get(remoteUrl);

  let u;
  try { u = new URL(remoteUrl); } catch { return null; }
  if (u.hostname !== 'austinhams.org' && u.hostname !== 'www.austinhams.org') {
    return remoteUrl; // leave external assets in place
  }
  // strip ?ver=... query strings
  u.search = '';
  const relPath = decodeURIComponent(u.pathname); // e.g. /wp-content/uploads/2025/01/file.png
  const localPath = path.join(STATIC_DIR, relPath);
  const sitePath = relPath;

  downloadedMedia.set(remoteUrl, sitePath);

  if (existsSync(localPath)) return sitePath;

  try {
    await downloadLimit(async () => {
      await ensureDir(path.dirname(localPath));
      const res = await fetch(u.toString(), { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(res.body, createWriteStream(localPath));
    });
    return sitePath;
  } catch (err) {
    console.warn(`  ! failed to download ${remoteUrl}: ${err.message}`);
    downloadedMedia.delete(remoteUrl);
    return remoteUrl;
  }
}

// ---------- HTML preprocessing ----------

async function rewriteHTML(html) {
  if (!html) return '';
  const root = parseHTML(html, { lowerCaseTagName: false, comment: false });

  // Strip WP block comments etc. (parseHTML already drops them with comment:false)
  // Remove empty <p></p>
  for (const p of root.querySelectorAll('p')) {
    if (!p.innerHTML.trim() || p.innerHTML.trim() === '&nbsp;') p.remove();
  }

  // Download <img> assets and rewrite src/srcset
  const imgs = root.querySelectorAll('img');
  for (const img of imgs) {
    img.removeAttribute('loading');
    img.removeAttribute('decoding');
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    const src = img.getAttribute('src');
    if (src) {
      const local = await downloadMedia(src);
      if (local) img.setAttribute('src', local);
    }
  }

  // Convert <a href="https://austinhams.org/foo"> into relative /foo for internal links
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (!href) continue;
    try {
      const hu = new URL(href, SITE);
      if (hu.hostname === 'austinhams.org' || hu.hostname === 'www.austinhams.org') {
        if (hu.pathname.startsWith('/wp-content/')) {
          // It's a media link - download it
          const local = await downloadMedia(hu.toString());
          if (local) a.setAttribute('href', local);
        } else {
          a.setAttribute('href', hu.pathname + hu.search + hu.hash);
        }
      }
    } catch { /* ignore */ }
  }

  // Drop scripts/styles that WP page-builder leaves behind
  for (const el of root.querySelectorAll('script,style,noscript')) el.remove();

  // Unwrap <div class="wp-block-*"> wrappers so Turndown produces clean output
  for (const el of root.querySelectorAll('div')) {
    // keep figures etc; we only want to collapse pure wrapper divs
    const cls = el.getAttribute('class') || '';
    if (/wp-block-|wp-container|elementor-|wpex-|ct-/i.test(cls)) {
      el.replaceWith(...el.childNodes);
    }
  }

  return root.toString();
}

// ---------- Turndown setup ----------

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});
turndown.use(gfm);

// Preserve <figure><img><figcaption> as HTML so it round-trips with the caption styles
turndown.addRule('figure', {
  filter: 'figure',
  replacement: (_content, node) => '\n\n' + node.outerHTML + '\n\n',
});
// Preserve iframes (e.g. YouTube embeds)
turndown.addRule('iframe', {
  filter: 'iframe',
  replacement: (_c, node) => '\n\n' + node.outerHTML + '\n\n',
});

async function htmlToMarkdown(html) {
  const cleaned = await rewriteHTML(html);
  return turndown.turndown(cleaned).trim() + '\n';
}

// ---------- write Hugo files ----------

function safeSlug(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

async function writeContent(filePath, frontMatter, body) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, frontMatter + body, 'utf8');
}

// Resolve category/tag/author IDs -> names
async function loadTaxonomy(endpoint) {
  const items = await fetchAll(endpoint);
  const map = new Map();
  for (const it of items) map.set(it.id, decodeEntities(it.name));
  return map;
}

async function loadAuthors() {
  const map = new Map();
  try {
    const users = await fetchAll('users', { per_page: '100' });
    for (const u of users) map.set(u.id, decodeEntities(u.name));
  } catch { /* users endpoint may be restricted */ }
  return map;
}

// Build a slug-path for a hierarchical page using parent links.
function buildPagePath(page, byId) {
  const parts = [page.slug];
  let cur = page;
  while (cur.parent && byId.has(cur.parent)) {
    cur = byId.get(cur.parent);
    parts.unshift(cur.slug);
  }
  return parts;
}

// ---------- main ----------

async function migrate() {
  console.log('==> Loading taxonomies & authors');
  const [categories, tags, authors] = await Promise.all([
    loadTaxonomy('categories'),
    loadTaxonomy('tags'),
    loadAuthors(),
  ]);

  // ----- Posts -----
  console.log('==> Fetching posts');
  const posts = await fetchAll('posts', { status: 'publish' });
  console.log(`    ${posts.length} posts`);
  await ensureDir(path.join(CONTENT_DIR, 'posts'));

  let pIdx = 0;
  for (const post of posts) {
    pIdx++;
    if (pIdx % 25 === 0) console.log(`    converting post ${pIdx}/${posts.length}`);
    try {
      const featured = post.featured_media
        ? await (async () => {
            try {
              const m = await fetchJSON(`${API}/media/${post.featured_media}`);
              return m && m.source_url ? await downloadMedia(m.source_url) : null;
            } catch { return null; }
          })()
        : null;

      const body = await htmlToMarkdown(post.content?.rendered || '');
      const fm = toFrontMatter({
        title: decodeEntities(post.title?.rendered || post.slug),
        slug: post.slug,
        date: post.date_gmt ? post.date_gmt + 'Z' : post.date,
        lastmod: post.modified_gmt ? post.modified_gmt + 'Z' : post.modified,
        draft: false,
        author: authors.get(post.author) || null,
        categories: (post.categories || []).map(id => categories.get(id)).filter(Boolean),
        tags: (post.tags || []).map(id => tags.get(id)).filter(Boolean),
        featured_image: featured,
      });
      await writeContent(path.join(CONTENT_DIR, 'posts', `${post.slug}.md`), fm, body);
    } catch (err) {
      console.warn(`  ! post ${post.slug} failed: ${err.message}`);
    }
  }

  // ----- Pages (hierarchical) -----
  console.log('==> Fetching pages');
  const pages = await fetchAll('pages', { status: 'publish' });
  console.log(`    ${pages.length} pages`);
  const pageById = new Map(pages.map(p => [p.id, p]));

  for (const page of pages) {
    try {
      const featured = page.featured_media
        ? await (async () => {
            try {
              const m = await fetchJSON(`${API}/media/${page.featured_media}`);
              return m && m.source_url ? await downloadMedia(m.source_url) : null;
            } catch { return null; }
          })()
        : null;

      const body = await htmlToMarkdown(page.content?.rendered || '');
      const fm = toFrontMatter({
        title: decodeEntities(page.title?.rendered || page.slug),
        slug: page.slug,
        date: page.date_gmt ? page.date_gmt + 'Z' : page.date,
        lastmod: page.modified_gmt ? page.modified_gmt + 'Z' : page.modified,
        draft: false,
        featured_image: featured,
        type: 'page',
        layout: page.slug === 'home' || page.slug === 'frontpage' ? 'index' : null,
      });

      const segs = buildPagePath(page, pageById);
      // The home page is rendered by layouts/index.html — skip writing /_index.md for it
      if (segs.length === 1 && (page.slug === 'home' || page.slug === 'frontpage' || page.slug === 'front-page')) {
        continue;
      }
      // Hierarchical pages get nested directories with _index.md so children can live underneath
      const dir = path.join(CONTENT_DIR, ...segs);
      await writeContent(path.join(dir, '_index.md'), fm, body);
    } catch (err) {
      console.warn(`  ! page ${page.slug} failed: ${err.message}`);
    }
  }

  // ----- Events: skipped. The /events/ page is driven by an ICS feed
  // (see content/events/_index.md and static/calendar/aarc.ics).
  const events = [];

  // ----- Staff & testimonials (custom post types) -----
  for (const cpt of ['staff', 'testimonials']) {
    let items = [];
    try { items = await fetchAll(cpt, { status: 'publish' }); } catch { continue; }
    if (!items.length) continue;
    console.log(`==> ${items.length} ${cpt}`);
    for (const it of items) {
      try {
        const body = await htmlToMarkdown(it.content?.rendered || '');
        const featured = it.featured_media
          ? await (async () => {
              try {
                const m = await fetchJSON(`${API}/media/${it.featured_media}`);
                return m && m.source_url ? await downloadMedia(m.source_url) : null;
              } catch { return null; }
            })()
          : null;
        const fm = toFrontMatter({
          title: decodeEntities(it.title?.rendered || it.slug),
          slug: it.slug,
          date: it.date_gmt ? it.date_gmt + 'Z' : it.date,
          draft: false,
          type: cpt,
          featured_image: featured,
        });
        await writeContent(path.join(CONTENT_DIR, cpt, `${it.slug}.md`), fm, body);
      } catch (err) {
        console.warn(`  ! ${cpt} ${it.slug} failed: ${err.message}`);
      }
    }
  }

  // ----- Blog section index -----
  await writeContent(
    path.join(CONTENT_DIR, 'posts', '_index.md'),
    toFrontMatter({ title: 'Blog', url: '/blog/' }),
    ''
  );

  // ----- Redirect map: /blog/ -> posts list (handled by url above) -----
  console.log('==> Done.');
  console.log(`    Posts:   ${posts.length}`);
  console.log(`    Pages:   ${pages.length}`);
  console.log(`    Events:  ${events.length}`);
  console.log(`    Media:   ${downloadedMedia.size} files`);
}

migrate().catch(err => { console.error(err); process.exit(1); });
