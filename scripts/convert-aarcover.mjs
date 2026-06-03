#!/usr/bin/env node
/**
 * Convert all content/posts/aarcover-newsletter-*.md files to type "aarcover".
 *
 * Each post follows the pattern:
 *   slug: aarcover-newsletter-<month>-<year>
 *   body contains: https://.../aarcover/AARCover_<YYYY>-<MM>.pdf
 *
 * This rewrites front matter to add type/issue_month/issue_year/pdf_url,
 * sets a proper publication date (first of the issue month), and strips
 * the boilerplate body since the layout now renders the download UI.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const POSTS_DIR = new URL('../content/posts/', import.meta.url);
const MONTHS = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};
const MONTH_NAME = Object.fromEntries(
  Object.entries(MONTHS).map(([k, v]) => [v, k[0].toUpperCase() + k.slice(1)])
);

function buildPdfUrl(year, monthNum) {
  return `https://s3.us-east-1.amazonaws.com/archive.austinhams.org/aarcover/AARCover_${year}-${monthNum}.pdf`;
}

function rewrite(content, slug) {
  const m = slug.match(/^aarcover-newsletter-([a-z]+)-(\d{4})$/);
  if (!m) return null;
  const monthName = m[1];
  const year = m[2];
  const monthNum = MONTHS[monthName];
  if (!monthNum) return null;
  const issueMonth = MONTH_NAME[monthNum];
  const pdfUrl = buildPdfUrl(year, monthNum);
  const isoDate = `${year}-${monthNum}-01T00:00:00Z`;

  // Split front matter / body
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return null;
  const fm = fmMatch[1];
  // Preserve original lastmod / author if present
  const lastmodMatch = fm.match(/^lastmod:\s*"?([^"\n]+)"?\s*$/m);
  const authorMatch = fm.match(/^author:\s*"?([^"\n]*)"?\s*$/m);
  const titleMatch = fm.match(/^title:\s*"?([^"\n]+)"?\s*$/m);
  const title = titleMatch ? titleMatch[1] : `AARCover Newsletter – ${issueMonth} ${year}`;

  const newFm = [
    '---',
    `title: "${title}"`,
    `slug: "${slug}"`,
    `date: "${isoDate}"`,
    lastmodMatch ? `lastmod: "${lastmodMatch[1]}"` : null,
    'draft: false',
    'type: "aarcover"',
    authorMatch && authorMatch[1] ? `author: "${authorMatch[1]}"` : null,
    'categories:',
    '  - "AARCover Archive"',
    `issue_month: "${issueMonth}"`,
    `issue_year: "${year}"`,
    `pdf_url: "${pdfUrl}"`,
    '---',
    '',
  ].filter(Boolean).join('\n');

  return newFm;
}

const files = (await readdir(POSTS_DIR)).filter(f =>
  f.startsWith('aarcover-newsletter-') && f.endsWith('.md')
);

let converted = 0;
let skipped = 0;
for (const file of files) {
  const path = join(POSTS_DIR.pathname, file);
  const original = await readFile(path, 'utf8');
  const slug = file.replace(/\.md$/, '');
  const next = rewrite(original, slug);
  if (!next) {
    console.warn(`SKIP: ${file}`);
    skipped++;
    continue;
  }
  await writeFile(path, next, 'utf8');
  converted++;
}
console.log(`Converted ${converted} files, skipped ${skipped}.`);
