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

  const articleBlock = articles.map((a, i) => {
    const text = a.content || a.summary || '';
    const displayText = text.length > 1500 ? text.slice(0, 1500) + '...' : text;
    return `[${i}] Title: ${a.title}\n    Source: ${a.source}\n    Time: ${a.date || a.published || ''}\n    Content (${text.length} chars): ${displayText}\n    URL: ${a.link || a.url || ''}`;
  }).join('\n\n');

  return `You are an AI article curator. Score and rank ALL ${articles.length} articles.

${langInstruction}
${prefsBlock}
For EVERY article, provide a lightweight score entry:
- **index**: original article index number
- **relevance** (1-10): How relevant to the user's interests${prefs ? ' (apply preference multipliers above)' : ' (general tech/AI/engineering)'}
- **quality** (1-10): Depth, originality, substance
- **timeliness** (1-10): Breaking news vs evergreen
- **weighted_score**: (relevance × 0.4 + quality × 0.4 + timeliness × 0.2) × 10
- **category**: One of 🤖AI/ML, 🔒Security, ⚙️Engineering, 🛠Tools/OSS, 💡Opinion, 🌐Web/Frontend, 📊Data/Infra, 📝Other

For the TOP ${topN} articles (highest weighted_score), ALSO include:
- **summary**: 2-3 sentence summary (problem → insight → conclusion)
- **title_zh**: Chinese title translation (if lang=zh)
- **keywords**: 2-3 keyword tags
${prefs ? '- **recommendation_reason**: Why this article matches user preferences (1 sentence)' : ''}

Return a JSON array of ALL ${articles.length} articles sorted by weighted_score descending:
[{
  "index": <original article index>,
  "title": "<original title>",
  "source": "<source name>",
  "url": "<article URL>",
  "relevance": <1-10>,
  "quality": <1-10>,
  "timeliness": <1-10>,
  "weighted_score": <0-100>,
  "category": "<emoji category>",
  "summary": "<2-3 sentences, ONLY for top ${topN}>",
  "title_zh": "<Chinese translation, ONLY for top ${topN}>",
  "keywords": ["tag1", "tag2"]${prefs ? ',\n  "recommendation_reason": "<ONLY for top ' + topN + '>"' : ''}
}]

IMPORTANT: Return ALL ${articles.length} articles, not just top ${topN}. Lower-ranked articles should still have index, title, source, url, scores, and category — just omit summary/title_zh/keywords.

Articles to score:
${articleBlock}

Return ONLY the JSON array, no markdown fences, no explanation.`;
}

function buildLightScoringPrompt(articles, lang, prefs) {
  const langInstruction = lang === 'zh'
    ? 'Respond with Chinese summaries and title translations.'
    : 'Respond in English.';

  let prefsBlock = '';
  if (prefs) {
    if (prefs.liked_topics.length > 0) {
      prefsBlock += `**Liked topics** (boost relevance ×1.3): ${prefs.liked_topics.join(', ')}\n`;
    }
    if (prefs.disliked_topics.length > 0) {
      prefsBlock += `**Disliked topics** (reduce relevance ×0.5): ${prefs.disliked_topics.join(', ')}\n`;
    }
    if (prefs.preferred_topics.length > 0) {
      prefsBlock += `**Preferred topics** (boost relevance ×1.5): ${prefs.preferred_topics.join(', ')}\n`;
    }
    if (prefs.preferred_sources.length > 0) {
      prefsBlock += `**Preferred sources** (boost relevance ×1.2): ${prefs.preferred_sources.join(', ')}\n`;
    }
    if (prefsBlock) prefsBlock += `\nApply these multipliers to the relevance score.\n`;
  }

  return `You are an AI article curator. Score ALL ${articles.length} articles with lightweight scores only — no summaries needed.

${langInstruction}
${prefsBlock}
For EVERY article, return:
- **index**: original article index
- **weighted_score**: (relevance × 0.4 + quality × 0.4 + timeliness × 0.2) × 10
- **category**: One of 🤖AI/ML, 🔒Security, ⚙️Engineering, 🛠Tools/OSS, 💡Opinion, 🌐Web/Frontend, 📊Data/Infra, 📝Other

Return a JSON array sorted by weighted_score descending:
[{"index": 0, "weighted_score": 85, "category": "🤖AI/ML"}, ...]

Articles to score:
${articles.map((a, i) => {
  const text = a.content || a.summary || '';
  const displayText = text.length > 800 ? text.slice(0, 800) + '...' : text;
  return `[${i}] ${a.title} | ${a.source} | ${displayText.slice(0, 200)}`;
}).join('\n')}

Return ONLY the JSON array.`;
}

function buildDetailPrompt(articles, lang, prefs) {
  const langInstruction = lang === 'zh'
    ? 'Respond with Chinese summaries and title translations.'
    : 'Respond in English.';

  return `You are an AI article curator. Provide detailed analysis for these ${articles.length} top-ranked articles.

${langInstruction}

For each article, provide:
- **index**: the original index
- **summary**: 2-3 sentence summary (problem → insight → conclusion)
- **title_zh**: Chinese title translation
- **keywords**: 2-3 keyword tags
${prefs ? '- **recommendation_reason**: Why this matches user preferences (1 sentence)' : ''}

Return a JSON array:
[{"index": 0, "summary": "...", "title_zh": "...", "keywords": ["tag1"]}]

Articles:
${articles.map(a => {
  const text = a.content || a.summary || '';
  const displayText = text.length > 1500 ? text.slice(0, 1500) + '...' : text;
  return `[${a._origIndex}] Title: ${a.title}\n    Source: ${a.source}\n    Content: ${displayText}\n    URL: ${a.link || a.url || ''}`;
}).join('\n\n')}

Return ONLY the JSON array.`;
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
      max_tokens: 16384,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || '';
  content = content.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

  let jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    const trimmed = content.trim();
    if (trimmed.startsWith('[')) {
      process.stderr.write(`[score] JSON array incomplete (truncated), attempting repair...\n`);
      const lastObj = trimmed.lastIndexOf('}');
      if (lastObj > 0) {
        jsonMatch = [trimmed.slice(0, lastObj + 1) + ']'];
      }
    }
    if (!jsonMatch) {
      throw new Error(`AI returned non-JSON response: ${content.slice(0, 500)}`);
    }
  }

  let jsonStr = jsonMatch[0];
  try {
    return JSON.parse(jsonStr);
  } catch (firstErr) {
    process.stderr.write(`[score] JSON parse failed, attempting repair...\n`);
    jsonStr = jsonStr
      .replace(/,\s*([}\]])/g, '$1')        // trailing commas
      .replace(/(["\d])\s*\n\s*"/g, '$1,"') // missing commas between fields
      .replace(/\}\s*\{/g, '},{');           // missing commas between objects
    if (!jsonStr.endsWith(']')) {
      const lastComplete = jsonStr.lastIndexOf('}');
      if (lastComplete > 0) {
        jsonStr = jsonStr.slice(0, lastComplete + 1) + ']';
        process.stderr.write(`[score] Truncated JSON repaired (cut at pos ${lastComplete})\n`);
      }
    }
    try {
      return JSON.parse(jsonStr);
    } catch (secondErr) {
      process.stderr.write(`[score] JSON repair failed. Raw content (500 chars): ${content.slice(0, 500)}\n`);
      throw new Error(`AI returned invalid JSON after repair: ${secondErr.message}`);
    }
  }
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
    const useTwoPhase = articles.length > batchSize;

    if (!useTwoPhase) {
      process.stderr.write(`[score] Single batch: full scoring with details\n`);
      const prompt = buildScoringPrompt(articles, language, prefs);
      allScored = await callOpenAI(prompt);
    } else {
      const totalBatches = Math.ceil(articles.length / batchSize);
      process.stderr.write(`[score] Phase 1: lightweight scoring — ${totalBatches} batches (concurrent)\n`);

      const batchPromises = [];
      for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const offset = i;
        batchPromises.push(
          (async () => {
            process.stderr.write(`[score] Batch ${batchNum}: articles ${offset}-${offset + batch.length - 1} (started)\n`);
            try {
              const prompt = buildLightScoringPrompt(batch, language, prefs);
              const results = await callOpenAI(prompt);
              for (const r of results) {
                r.index = (r.index || 0) + offset;
              }
              process.stderr.write(`[score] Batch ${batchNum}: done (${results.length} scored)\n`);
              return results;
            } catch (err) {
              process.stderr.write(`[score] Batch ${batchNum}: FAILED (${err.message})\n`);
              return [];
            }
          })()
        );
      }

      const batchResults = await Promise.all(batchPromises);
      for (const results of batchResults) {
        allScored.push(...results);
      }
      process.stderr.write(`[score] Phase 1 complete: ${allScored.length}/${articles.length} articles scored\n`);

      for (const r of allScored) {
        const idx = r.index ?? -1;
        if (idx >= 0 && idx < articles.length) {
          const orig = articles[idx];
          r.title = r.title || orig.title || '';
          r.source = r.source || orig.source || '';
          r.url = r.url || orig.link || orig.url || '';
        }
      }

      allScored.sort((a, b) => (b.weighted_score || 0) - (a.weighted_score || 0));

      process.stderr.write(`[score] Phase 2: detailed summaries for top ${topN}\n`);
      const topItems = allScored.slice(0, topN);
      const topArticles = topItems.map(r => {
        const orig = articles[r.index] || {};
        return { ...orig, _origIndex: r.index };
      });

      try {
        const detailPrompt = buildDetailPrompt(topArticles, language, prefs);
        const details = await callOpenAI(detailPrompt);
        const detailMap = new Map();
        for (const d of details) {
          detailMap.set(d.index, d);
        }
        for (const r of topItems) {
          const d = detailMap.get(r.index);
          if (d) {
            r.summary = d.summary || '';
            r.title_zh = d.title_zh || '';
            r.keywords = d.keywords || [];
            if (d.recommendation_reason) r.recommendation_reason = d.recommendation_reason;
          }
        }
      } catch (err) {
        process.stderr.write(`[score] Phase 2 failed (results still valid without summaries): ${err.message}\n`);
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
    const topDetailed = allScored.slice(0, topN);
    const rest = allScored.slice(topN).map(r => ({
      index: r.index,
      title: r.title,
      source: r.source,
      url: r.url,
      weighted_score: r.weighted_score,
      category: r.category,
    }));

    const output = {
      mode: 'openai',
      model,
      articles_total: articles.length,
      articles_scored: allScored.length,
      top_n: topN,
      language,
      preferences: prefs,
      top_articles: topDetailed,
      remaining_articles: rest,
    };
    process.stdout.write(JSON.stringify(output, null, 2));
    process.stderr.write(`[score] Done: ${topDetailed.length} detailed + ${rest.length} ranked = ${allScored.length} total\n`);
  } else {
    process.stderr.write(`[score] Unknown provider: ${provider}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  process.stderr.write(`[score] Fatal: ${err.message}\n`);
  process.exit(1);
});
