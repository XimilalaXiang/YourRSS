#!/usr/bin/env node
/**
 * score-articles.mjs — AI-powered article scoring and summarization
 * Supports two modes:
 *   - agent: passes through articles with scoring prompt (Agent does the AI work)
 *   - openai: calls an OpenAI-compatible API to score/summarize autonomously
 *
 * Usage:
 *   cat articles.json | node score-articles.mjs [options]
 *   node fetch-freshrss.mjs --hours 24 | node score-articles.mjs --top 10
 *
 * Options:
 *   --top N              Number of top articles to return (default: 10)
 *   --language LANG      Summary language: zh/en (default: zh)
 *   --provider MODE      Override AI_PROVIDER from .env: agent/openai
 *   --model MODEL        Override AI_MODEL from .env
 *   --preferences FILE   JSON file with user preferences from Cortex
 *                         (generate via: node cortex-api.mjs preferences > prefs.json)
 *
 * Required env vars for openai mode (or .env file):
 *   AI_PROVIDER   — agent / openai (default: agent)
 *   AI_BASE_URL   — OpenAI-compatible API base URL
 *   AI_API_KEY    — API key
 *   AI_MODEL      — Model name (default: gpt-4o-mini)
 */

import { readFileSync, existsSync } from 'fs';
import { loadEnv } from './load-env.mjs';
loadEnv();

const args = process.argv.slice(2);

function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}

const topN = parseInt(getArg('top', '10'));
const language = getArg('language', 'zh');
const provider = getArg('provider', process.env.AI_PROVIDER || 'agent');
const model = getArg('model', process.env.AI_MODEL || 'gpt-4o-mini');
const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const apiKey = process.env.AI_API_KEY || '';
const prefsFile = getArg('preferences', '');

function loadPreferences() {
  if (!prefsFile) return null;
  if (!existsSync(prefsFile)) {
    process.stderr.write(`[score] Warning: preferences file not found: ${prefsFile}\n`);
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(prefsFile, 'utf-8'));
    const prefs = Array.isArray(data) ? data : (data.memories || []);
    if (prefs.length === 0) return null;

    const liked = [], disliked = [], preferred = [], sources = [];
    for (const m of prefs) {
      const c = (m.content || '').toLowerCase();
      if (c.includes('liked article') || c.includes('prefers reading')) {
        const topics = c.match(/topics?:\s*([^.]+)/i);
        if (topics) liked.push(...topics[1].split(',').map(t => t.trim()));
        const src = c.match(/from\s+(\S+)/i);
        if (src) sources.push(src[1]);
      }
      if (c.includes('uninteresting') || c.includes('fewer articles')) {
        const topics = c.match(/topics?:\s*([^.]+)/i);
        if (topics) disliked.push(...topics[1].split(',').map(t => t.trim()));
      }
      if (c.includes('wants more') || c.includes('explicitly prefers')) {
        const match = c.match(/about:\s*(.+)/i);
        if (match) preferred.push(match[1].trim());
      }
    }

    return {
      liked_topics: [...new Set(liked)],
      disliked_topics: [...new Set(disliked)],
      preferred_topics: [...new Set(preferred)],
      preferred_sources: [...new Set(sources)],
      raw_count: prefs.length,
    };
  } catch (e) {
    process.stderr.write(`[score] Warning: could not parse preferences: ${e.message}\n`);
    return null;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function buildScoringPrompt(articles, lang, prefs) {
  const langInstruction = lang === 'zh'
    ? '请用中文回复。为每篇文章生成中文标题翻译和摘要。'
    : 'Reply in English.';

  let prefsBlock = '';
  if (prefs) {
    prefsBlock = `\n## User Preferences (from Cortex Memory — ${prefs.raw_count} memories)\n\n`;
    if (prefs.liked_topics.length > 0) {
      prefsBlock += `**Liked topics** (boost relevance ×1.3): ${prefs.liked_topics.join(', ')}\n`;
    }
    if (prefs.disliked_topics.length > 0) {
      prefsBlock += `**Disliked topics** (reduce relevance ×0.5): ${prefs.disliked_topics.join(', ')}\n`;
    }
    if (prefs.preferred_topics.length > 0) {
      prefsBlock += `**Explicitly preferred** (boost relevance ×1.5): ${prefs.preferred_topics.join(', ')}\n`;
    }
    if (prefs.preferred_sources.length > 0) {
      prefsBlock += `**Preferred sources** (boost relevance ×1.2): ${prefs.preferred_sources.join(', ')}\n`;
    }
    prefsBlock += `\nApply these multipliers to the relevance score before computing weighted_score.\n`;
  }

  return `You are an AI article curator. Score and rank the following ${articles.length} articles.

${langInstruction}
${prefsBlock}
For each article, provide:
1. **relevance** (1-10): How relevant to the user's interests${prefs ? ' (apply preference multipliers above)' : ' (general tech/AI/engineering)'}
2. **quality** (1-10): Depth, originality, substance
3. **timeliness** (1-10): Breaking news vs evergreen
4. **weighted_score**: (relevance × 0.4 + quality × 0.4 + timeliness × 0.2) × 10
5. **category**: One of 🤖AI/ML, 🔒Security, ⚙️Engineering, 🛠Tools/OSS, 💡Opinion, 🌐Web/Frontend, 📊Data/Infra, 📝Other
6. **summary**: 2-3 sentence summary (problem → insight → conclusion)
7. **title_zh**: Chinese title translation (if lang=zh)
8. **keywords**: 2-3 keyword tags
${prefs ? '9. **recommendation_reason**: Why this article matches user preferences (1 sentence)' : ''}

Return a JSON array of the top ${topN} articles sorted by weighted_score descending:
[{
  "index": <original article index>,
  "title": "<original title>",
  "title_zh": "<Chinese translation>",
  "source": "<source name>",
  "url": "<article URL>",
  "relevance": <1-10>,
  "quality": <1-10>,
  "timeliness": <1-10>,
  "weighted_score": <0-100>,
  "category": "<emoji category>",
  "summary": "<2-3 sentences>",
  "keywords": ["tag1", "tag2"]${prefs ? ',\n  "recommendation_reason": "<why this matches user prefs>"' : ''}
}]

Articles to score:
${articles.map((a, i) => {
  const text = a.content || a.summary || '';
  const displayText = text.length > 1500 ? text.slice(0, 1500) + '...' : text;
  return `[${i}] Title: ${a.title}\n    Source: ${a.source}\n    Time: ${a.date || a.published || ''}\n    Content (${text.length} chars): ${displayText}\n    URL: ${a.link || a.url || ''}`;
}).join('\n\n')}

Return ONLY the JSON array, no markdown fences, no explanation.`;
}

async function callOpenAI(prompt) {
  if (!apiKey) {
    throw new Error('AI_API_KEY is required for openai provider mode');
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a precise article scoring assistant. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`AI returned non-JSON response: ${content.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]);
}

async function main() {
  const input = await readStdin();
  let articles;

  try {
    articles = JSON.parse(input);
  } catch (e) {
    process.stderr.write(`[score] Error: Invalid JSON input\n`);
    process.exit(1);
  }

  if (!Array.isArray(articles) || articles.length === 0) {
    process.stderr.write(`[score] No articles to score\n`);
    process.stdout.write('[]');
    return;
  }

  const prefs = loadPreferences();
  if (prefs) {
    process.stderr.write(`[score] Preferences loaded: ${prefs.raw_count} memories\n`);
    process.stderr.write(`[score]   Liked: ${prefs.liked_topics.join(', ') || 'none'}\n`);
    process.stderr.write(`[score]   Disliked: ${prefs.disliked_topics.join(', ') || 'none'}\n`);
    process.stderr.write(`[score]   Preferred: ${prefs.preferred_topics.join(', ') || 'none'}\n`);
  } else {
    process.stderr.write(`[score] No preferences loaded (neutral scoring)\n`);
  }

  process.stderr.write(`[score] Provider: ${provider}, Model: ${model}\n`);
  process.stderr.write(`[score] Scoring ${articles.length} articles, selecting top ${topN}\n`);

  if (provider === 'agent') {
    const prompt = buildScoringPrompt(articles, language, prefs);
    const output = {
      mode: 'agent',
      instruction: 'Agent should process the scoring prompt below and return scored results',
      articles_count: articles.length,
      top_n: topN,
      language,
      preferences: prefs,
      scoring_prompt: prompt,
      articles,
    };
    process.stdout.write(JSON.stringify(output, null, 2));
    process.stderr.write(`[score] Agent mode: prompt generated (${prompt.length} chars)\n`);
  } else if (provider === 'openai') {
    process.stderr.write(`[score] Calling ${baseUrl} with model ${model}...\n`);

    const batchSize = 30;
    let allScored = [];

    if (articles.length <= batchSize) {
      const prompt = buildScoringPrompt(articles, language, prefs);
      allScored = await callOpenAI(prompt);
    } else {
      process.stderr.write(`[score] Large input: splitting into batches of ${batchSize}\n`);
      for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);
        process.stderr.write(`[score] Batch ${Math.floor(i/batchSize) + 1}: articles ${i}-${i + batch.length - 1}\n`);
        const prompt = buildScoringPrompt(batch, language, prefs);
        const batchResults = await callOpenAI(prompt);
        for (const r of batchResults) {
          r.index = (r.index || 0) + i;
        }
        allScored.push(...batchResults);
      }
    }

    for (const r of allScored) {
      const idx = r.index ?? -1;
      if (idx >= 0 && idx < articles.length) {
        const orig = articles[idx];
        if (!r.url || r.url === '') r.url = orig.link || orig.url || '';
        if (!r.source || r.source === '') r.source = orig.source || '';
        if (!r.title || r.title === '') r.title = orig.title || '';
      }
    }

    allScored.sort((a, b) => (b.weighted_score || 0) - (a.weighted_score || 0));
    const topResults = allScored.slice(0, topN);

    const output = {
      mode: 'openai',
      model,
      articles_total: articles.length,
      articles_scored: allScored.length,
      top_n: topN,
      language,
      preferences: prefs,
      results: topResults,
    };
    process.stdout.write(JSON.stringify(output, null, 2));
    process.stderr.write(`[score] Done: ${topResults.length} top articles selected\n`);
  } else {
    process.stderr.write(`[score] Unknown provider: ${provider}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  process.stderr.write(`[score] Fatal: ${err.message}\n`);
  process.exit(1);
});
