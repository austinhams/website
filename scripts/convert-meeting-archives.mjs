#!/usr/bin/env node
/**
 * Convert "Meeting Archive" posts (category) into the meeting-archive type.
 *
 * Each source post typically contains:
 *   - An optional YouTube <iframe> embed
 *   - A line of links shaped like:
 *       [Title](url.pdf)[Download](url.pdf) [Title2](url.pdf)[Download](url.pdf)
 *
 * This script:
 *   - Adds `type: "meeting-archive"` to the front matter
 *   - Extracts `youtube_id` (if any)
 *   - Extracts `downloads:` entries from the link line
 *   - Removes the YouTube embed + the link line from the body (the layout renders them)
 *   - Leaves any other prose / images intact
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const POSTS_DIR = new URL('../content/posts/', import.meta.url);

function extractYouTubeId(body) {
  // Match https://www.youtube.com/embed/<id>?... or /embed/<id>"
  const m = body.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}

function stripYouTubeEmbed(body) {
  // Remove the entire <figure>...</figure> block that wraps the iframe.
  body = body.replace(/<figure[^>]*wp-block-embed-youtube[\s\S]*?<\/figure>\s*/g, '');
  // Also strip a bare iframe if present.
  body = body.replace(/<iframe[^>]*youtube[^>]*>[\s\S]*?<\/iframe>\s*/g, '');
  return body;
}

function extractDownloads(body) {
  // Find lines that contain the [Title](url)[Download](url) pattern.
  // We'll scan for sequences of [Anything](url)[Download](url).
  const re = /\[([^\]]+)\]\(([^)]+\.(?:pdf|zip|docx?|pptx?|xlsx?))\)\[Download\]\(\2\)/gi;
  const downloads = [];
  let m;
  const matchedSpans = [];
  while ((m = re.exec(body)) !== null) {
    downloads.push({ title: m[1].trim(), url: m[2].trim() });
    matchedSpans.push([m.index, m.index + m[0].length]);
  }
  if (!downloads.length) return { downloads: [], body };

  // Remove matched spans (in reverse order to keep indices valid).
  let cleaned = body;
  for (const [s, e] of matchedSpans.reverse()) {
    cleaned = cleaned.slice(0, s) + cleaned.slice(e);
  }
  // Clean up stray separator whitespace left over on those lines.
  cleaned = cleaned.replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return { downloads, body: cleaned };
}

function humanizeTitle(raw) {
  // Convert "2026-Feb-AARC-Meeting" / "Solar-Weather-1-JUN-2021" → spaces
  return raw
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFrontMatter(originalFm, { youtubeId, downloads }) {
  // Parse the original lines and rebuild, dropping any existing `type:`.
  const lines = originalFm.split('\n').filter(l => !/^type\s*:/.test(l));

  // Build new YAML by appending/inserting our keys before the closing.
  const extras = [];
  extras.push('type: "meeting-archive"');
  extras.push(`youtube_id: "${youtubeId}"`);
  extras.push('presenter: ""');
  extras.push('downloads:');
  if (downloads.length === 0) {
    extras.push('  []');
  } else {
    for (const d of downloads) {
      extras.push(`  - title: "${humanizeTitle(d.title).replace(/"/g, '\\"')}"`);
      extras.push(`    url: "${d.url}"`);
    }
  }
  return [...lines, ...extras].join('\n');
}

const files = (await readdir(POSTS_DIR));
let touched = 0;
for (const file of files) {
  if (!file.endsWith('.md')) continue;
  const path = join(POSTS_DIR.pathname, file);
  const original = await readFile(path, 'utf8');
  const fmMatch = original.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) continue;
  const fm = fmMatch[1];
  let body = fmMatch[2];

  // Only operate on posts in the "Meeting Archive" category.
  if (!/^categories:[\s\S]*?-\s*"Meeting Archive"/m.test(fm)) continue;
  // Skip the already-converted reference post.
  if (/^type\s*:\s*"meeting-archive"/m.test(fm)) {
    // Already converted; skip.
    continue;
  }

  const youtubeId = extractYouTubeId(body);
  body = stripYouTubeEmbed(body);
  const { downloads, body: bodyAfter } = extractDownloads(body);
  body = bodyAfter.replace(/\n{3,}/g, '\n\n').trim() + '\n';

  const newFm = buildFrontMatter(fm, { youtubeId, downloads });
  const next = `---\n${newFm}\n---\n\n${body}`;
  await writeFile(path, next, 'utf8');
  touched++;
  console.log(`✓ ${file}  yt=${youtubeId || '-'}  downloads=${downloads.length}`);
}
console.log(`\nConverted ${touched} files.`);
