#!/usr/bin/env node
/**
 * fetch-freshrss.mjs — Fetch articles from FreshRSS via Google Reader API
 * Zero dependencies, runs on Node.js 18+
 *
 * Usage: node fetch-freshrss.mjs [--hours 24] [--count 50] [--category NAME] [--unread]
 * Output: JSON array of articles to stdout
 *
 * Required env vars:
 *   FRESHRSS_URL          — Your FreshRSS instance URL
 *   FRESHRSS_USER         — Your FreshRSS username
 *   FRESHRSS_API_PASSWORD — Your FreshRSS API password
 */

const args = process.argv.slice(2);

function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}

const hours = parseInt(getArg('hours', '24'));
const count = parseInt(getArg('count', '50'));
const category = getArg('category', '');
const unreadOnly = args.includes('--unread');
const listCategories = args.includes('--categories');
const listFeeds = args.includes('--feeds');

const FRESHRSS_URL = process.env.FRESHRSS_URL;
const FRESHRSS_USER = process.env.FRESHRSS_USER;
const FRESHRSS_API_PASSWORD = process.env.FRESHRSS_API_PASSWORD;

if (!FRESHRSS_URL || !FRESHRSS_USER || !FRESHRSS_API_PASSWORD) {
  process.stderr.write('[fetch-freshrss] Error: FRESHRSS_URL, FRESHRSS_USER, and FRESHRSS_API_PASSWORD must be set\n');
  process.exit(1);
}

const API_BASE = `${FRESHRSS_URL.replace(/\/$/, '')}/api/greader.php`;

async function authenticate() {
  const url = `${API_BASE}/accounts/ClientLogin`;
  const body = `Email=${encodeURIComponent(FRESHRSS_USER)}&Passwd=${encodeURIComponent(FRESHRSS_API_PASSWORD)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  const match = text.match(/Auth=(.+)/);
  if (!match) {
    throw new Error(`Authentication failed: ${text.trim()}`);
  }
  return match[1].trim();
}

async function apiGet(token, endpoint) {
  const url = `${API_BASE}/reader/api/0/${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `GoogleLogin auth=${token}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getCategories(token) {
  const data = await apiGet(token, 'tag/list?output=json');
  return (data.tags || [])
    .filter(t => t.id && t.id.includes('/label/'))
    .map(t => {
      const parts = t.id.split('/label/');
      return { id: t.id, name: parts[parts.length - 1] };
    });
}

async function getFeeds(token) {
  const data = await apiGet(token, 'subscription/list?output=json');
  return (data.subscriptions || []).map(s => ({
    id: s.id,
    title: s.title,
    url: s.url || s.htmlUrl || '',
    category: s.categories?.[0]?.label || 'uncategorized',
  }));
}

async function getArticles(token) {
  let stream = 'stream/contents';
  if (category) {
    stream += `/user/-/label/${encodeURIComponent(category)}`;
  } else {
    stream += '/user/-/state/com.google/reading-list';
  }

  let url = `${stream}?output=json&n=${count}`;

  const cutoffTs = Math.floor((Date.now() - hours * 3600 * 1000) / 1000);
  url += `&ot=${cutoffTs}`;

  if (unreadOnly) {
    url += '&xt=user/-/state/com.google/read';
  }

  const data = await apiGet(token, url);
  const items = data.items || [];

  return items.map(item => {
    const link = item.canonical?.[0]?.href || item.alternate?.[0]?.href || '';
    const summary = stripHtml(item.summary?.content || '').slice(0, 500);
    const timestamp = (item.published || 0) * 1000;
    const categories = (item.categories || [])
      .filter(c => c.includes('/label/'))
      .map(c => c.split('/label/').pop());

    return {
      id: item.id || '',
      title: item.title || '(no title)',
      link,
      summary,
      timestamp,
      date: timestamp ? new Date(timestamp).toISOString() : '',
      source: item.origin?.title || '',
      sourceUrl: item.origin?.htmlUrl || '',
      categories,
    };
  }).sort((a, b) => b.timestamp - a.timestamp);
}

async function main() {
  process.stderr.write(`[fetch-freshrss] Connecting to ${FRESHRSS_URL}...\n`);

  const token = await authenticate();
  process.stderr.write('[fetch-freshrss] Authenticated successfully\n');

  if (listCategories) {
    const cats = await getCategories(token);
    process.stdout.write(JSON.stringify(cats, null, 2));
    return;
  }

  if (listFeeds) {
    const feeds = await getFeeds(token);
    process.stderr.write(`[fetch-freshrss] Found ${feeds.length} feeds\n`);
    process.stdout.write(JSON.stringify(feeds, null, 2));
    return;
  }

  const articles = await getArticles(token);
  process.stderr.write(
    `[fetch-freshrss] Fetched ${articles.length} articles` +
    ` (last ${hours}h, ${unreadOnly ? 'unread only' : 'all'}` +
    `${category ? `, category: ${category}` : ''})\n`
  );

  process.stdout.write(JSON.stringify(articles, null, 2));
}

main().catch(err => {
  process.stderr.write(`[fetch-freshrss] Fatal: ${err.message}\n`);
  process.exit(1);
});
