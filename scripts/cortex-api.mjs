#!/usr/bin/env node
/**
 * cortex-api.mjs — Cortex Memory REST API client for RSS preference learning
 * Zero dependencies, runs on Node.js 18+
 *
 * Usage:
 *   node cortex-api.mjs recall "query text"
 *   node cortex-api.mjs remember "memory content" [--category preference]
 *   node cortex-api.mjs forget <memory_id>
 *   node cortex-api.mjs stats
 *   node cortex-api.mjs preferences
 *
 * Required env vars:
 *   CORTEX_URL   — Cortex server URL (default: http://localhost:21100)
 *   CORTEX_TOKEN — Auth token (optional)
 *   CORTEX_AGENT — Agent ID (default: reader)
 */

const CORTEX_URL = (process.env.CORTEX_URL || 'http://localhost:21100').replace(/\/$/, '');
const CORTEX_TOKEN = process.env.CORTEX_TOKEN || '';
const CORTEX_AGENT = process.env.CORTEX_AGENT || 'reader';

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}

async function cortexFetch(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (CORTEX_TOKEN) {
    headers['Authorization'] = `Bearer ${CORTEX_TOKEN}`;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${CORTEX_URL}${endpoint}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cortex API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function recall(query, maxResults = 10) {
  return cortexFetch('/api/v1/recall', 'POST', {
    query,
    agent_id: CORTEX_AGENT,
    max_results: maxResults,
  });
}

async function remember(content, category = 'preference', importance = 0.7) {
  return cortexFetch('/api/v1/memories', 'POST', {
    content,
    category,
    agent_id: CORTEX_AGENT,
    importance,
    source: 'freshrss-ai-digest',
  });
}

async function forget(memoryId) {
  return cortexFetch(`/api/v1/memories/${memoryId}`, 'DELETE');
}

async function stats() {
  return cortexFetch('/api/v1/stats');
}

async function search(query) {
  return cortexFetch('/api/v1/search', 'POST', {
    query,
    agent_id: CORTEX_AGENT,
    max_results: 20,
  });
}

async function getPreferences() {
  const categories = ['preference', 'fact', 'insight', 'agent_user_habit'];
  const results = [];

  for (const cat of categories) {
    try {
      const data = await recall(`RSS reading ${cat}`, 5);
      if (data.memories) {
        results.push(...data.memories.filter(m => m.category === cat));
      }
    } catch (e) {
      // skip categories with no results
    }
  }

  const prefs = await recall('favorite topics articles sources interests', 10);
  if (prefs.memories) {
    for (const m of prefs.memories) {
      if (!results.find(r => r.id === m.id)) {
        results.push(m);
      }
    }
  }

  return results;
}

async function recordLike(title, source, topics, url) {
  return remember(
    `User liked article: "${title}" from ${source}. Topics: ${topics.join(', ')}. URL: ${url}`,
    'preference',
    0.8
  );
}

async function recordDislike(title, source, topics) {
  return remember(
    `User found uninteresting: "${title}" from ${source}. Topics: ${topics.join(', ')}`,
    'preference',
    0.6
  );
}

async function recordDigest(date, topicList, categoryList, articleCount, feedCount) {
  return remember(
    `Digest generated on ${date}. Topics: ${topicList.join(', ')}. ` +
    `Categories: ${categoryList.join(', ')}. ${articleCount} articles from ${feedCount} feeds.`,
    'agent_user_habit',
    0.5
  );
}

async function main() {
  if (!command) {
    process.stderr.write('Usage: cortex-api.mjs <command> [args]\n');
    process.stderr.write('Commands: recall, remember, forget, stats, preferences, like, dislike, digest-log\n');
    process.exit(1);
  }

  let result;

  switch (command) {
    case 'recall':
      result = await recall(args[1] || 'reading preferences');
      break;

    case 'remember':
      result = await remember(
        args[1],
        getFlag('category', 'preference'),
        parseFloat(getFlag('importance', '0.7'))
      );
      break;

    case 'forget':
      result = await forget(args[1]);
      break;

    case 'stats':
      result = await stats();
      break;

    case 'preferences':
      result = await getPreferences();
      break;

    case 'search':
      result = await search(args[1] || 'reading preferences');
      break;

    case 'like':
      result = await recordLike(
        args[1] || '',
        getFlag('source', 'unknown'),
        (getFlag('topics', '')).split(',').filter(Boolean),
        getFlag('url', '')
      );
      process.stderr.write('[cortex] Preference recorded: liked article\n');
      break;

    case 'dislike':
      result = await recordDislike(
        args[1] || '',
        getFlag('source', 'unknown'),
        (getFlag('topics', '')).split(',').filter(Boolean)
      );
      process.stderr.write('[cortex] Preference recorded: disliked article\n');
      break;

    case 'digest-log':
      result = await recordDigest(
        args[1] || new Date().toISOString(),
        (getFlag('topics', '')).split(',').filter(Boolean),
        (getFlag('categories', '')).split(',').filter(Boolean),
        parseInt(getFlag('articles', '0')),
        parseInt(getFlag('feeds', '0'))
      );
      process.stderr.write('[cortex] Digest log stored\n');
      break;

    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      process.exit(1);
  }

  process.stdout.write(JSON.stringify(result, null, 2));
}

main().catch(err => {
  process.stderr.write(`[cortex] Fatal: ${err.message}\n`);
  process.exit(1);
});
