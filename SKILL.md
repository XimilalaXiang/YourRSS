---
name: freshrss-ai-digest
description: "AI-powered RSS digest from your FreshRSS instance with personalized recommendations via Cortex Memory API. Trigger with /digest, /recommend, or ask for news/headlines. Fetches articles via FreshRSS API, scores by relevance/quality, generates summaries, learns preferences via Cortex REST API (agent: reader), and saves highlights to Blinko."
---

# FreshRSS AI Digest

AI-powered daily digest from your self-hosted FreshRSS instance. Scores, summarizes, and recommends articles based on your reading preferences stored in Cortex Memory (agent: `reader`).

## Setup

### Required: FreshRSS

```bash
export FRESHRSS_URL="https://your-freshrss-instance.com"
export FRESHRSS_USER="your-username"
export FRESHRSS_API_PASSWORD="your-api-password"
```

API password: FreshRSS → Settings → Profile → API Management.

### Required: Cortex Memory

```bash
export CORTEX_URL="http://localhost:21100"
export CORTEX_TOKEN="your-cortex-auth-token"    # optional if no auth
export CORTEX_AGENT="reader"                     # isolated agent for RSS preferences
```

### Optional: Blinko

```bash
export BLINKO_URL="https://your-blinko-instance.com"
export BLINKO_TOKEN="your-blinko-api-token"
```

## Commands

### Daily Digest: `/digest`

**Parameters** (ask user if not specified):

| Param | Options | Default |
|-------|---------|---------|
| Time range | 4h / 12h / 24h / 48h / 72h | 24h |
| Top N | 5 / 10 / 15 / 20 | 10 |
| Language | zh / en | zh |
| Category | any FreshRSS category | all |

### Recommendations: `/recommend`
### Save: `/save [number]`
### Preference: `/like [number]`, `/dislike [number]`, `/prefer topic:X`
### Browse: `/feeds`, `/categories`

## Workflow

### Step 1: Fetch articles from FreshRSS

```bash
node {baseDir}/scripts/fetch-freshrss.mjs --hours <HOURS> --count 50 --unread
```

Category-specific:
```bash
node {baseDir}/scripts/fetch-freshrss.mjs --hours 24 --count 50 --unread --category "Technology"
```

List categories / feeds:
```bash
node {baseDir}/scripts/fetch-freshrss.mjs --categories
node {baseDir}/scripts/fetch-freshrss.mjs --feeds
```

Capture the JSON output from stdout.

### Step 2: Load user preferences from Cortex (REST API)

Fetch user reading preferences from the `reader` agent:

```bash
node {baseDir}/scripts/cortex-api.mjs preferences
```

This queries Cortex for all preference, fact, insight, and habit memories related to RSS reading.
The output is a JSON array of memory objects.

Parse the returned memories to build a preference profile:
- **Liked topics**: extract topic keywords from "User liked article..." memories
- **Disliked topics**: extract from "User found uninteresting..." memories
- **Preferred sources**: extract source names from liked article memories
- **Reading patterns**: extract from digest log memories (time, frequency, categories)

If no preferences found (first run), proceed with neutral scoring.

### Step 3: Score and classify

Score each article on three dimensions (1-10):

1. **Relevance** — Match against user preferences from Cortex. If no prefs, score on general tech/AI relevance.
2. **Quality** — Depth, originality, substance (from title + summary).
3. **Timeliness** — Breaking vs. evergreen.

Apply preference multipliers from Cortex data:
- Topics matching liked topics: score × 1.3
- Topics matching disliked topics: score × 0.5
- Sources from liked articles: score × 1.2
- Topics explicitly preferred (/prefer): score × 1.5

Classify:
- 🤖 AI / ML
- 🔒 Security
- ⚙️ Engineering
- 🛠 Tools / Open Source
- 💡 Opinion / Essay
- 🌐 Web / Frontend
- 📊 Data / Infrastructure
- 📝 Other

Select top N by weighted score.

### Step 4: Generate summaries

For each selected article:
1. If summary > 100 chars, use it
2. If not, use web_fetch to read full article
3. Generate:
   - Chinese title translation (original as link)
   - 2-3 sentence summary: problem → insight → conclusion
   - Personalized recommendation reason (using Cortex preferences if available)
   - Keywords (2-3 tags)

### Step 5: Trend highlights

Analyze selected articles and identify 2-3 macro trends.

### Step 6: Format output

```
📰 FreshRSS AI Digest — {date}
来自你的 FreshRSS 订阅 · {feed_count} 源 · {hours}h 窗口

📝 今日看点
{2-3 sentence trend summary}

🏆 今日必读 (Top 3)
1. {Chinese title}
   {source} · {relative time}
   {summary}
   🏷️ {keywords}
   💡 推荐理由：{personalized reason from Cortex prefs}

2. ...
3. ...

📋 更多精选
4. {Chinese title} — {source} · {one-line summary}
5. ...

📊 统计：{N} 源 → {M} 篇未读 → {K} 篇精选
🧠 个性化：基于 Cortex reader agent ({pref_count} 条偏好记忆)
```

### Step 7: Log digest to Cortex

After generating, log this digest session:

```bash
node {baseDir}/scripts/cortex-api.mjs digest-log "{date}" \
  --topics "AI,Security,Go" \
  --categories "AI/ML,Engineering" \
  --articles 10 \
  --feeds 45
```

This builds the preference model over time.

## Personalized Recommendations (/recommend)

1. Load full preference profile:
```bash
node {baseDir}/scripts/cortex-api.mjs preferences
```

2. Fetch recent unread articles (48h):
```bash
node {baseDir}/scripts/fetch-freshrss.mjs --hours 48 --count 100 --unread
```

3. Score heavily weighted by Cortex preferences:
   - Match favorite topics (×1.5)
   - Match preferred sources (×1.3)
   - Penalize disliked topics (×0.3)

4. Present top 5 with personalized explanation:

```
🎯 为你推荐 — 基于 Cortex reader 的 {N} 条阅读偏好

1. {title}
   📍 {source} · {time}
   🧠 推荐原因：你经常关注 {topic}，这篇深入讨论了 {angle}

2. ...
```

## Preference Learning

### /like [number]

Record a positive preference to Cortex:

```bash
node {baseDir}/scripts/cortex-api.mjs like "{article_title}" \
  --source "{source_name}" \
  --topics "AI,Security" \
  --url "https://..."
```

### /dislike [number]

Record a negative signal:

```bash
node {baseDir}/scripts/cortex-api.mjs dislike "{article_title}" \
  --source "{source_name}" \
  --topics "Crypto,NFT"
```

### /prefer topic:X

Explicit preference:

```bash
node {baseDir}/scripts/cortex-api.mjs remember "User explicitly prefers reading about: {topic}" --category preference --importance 0.9
```

### /forget topic:X

Remove preference:

```bash
# First search for the memory
node {baseDir}/scripts/cortex-api.mjs search "{topic} preference"
# Then delete by ID
node {baseDir}/scripts/cortex-api.mjs forget "{memory_id}"
```

## Save to Blinko (/save)

When user says `/save 3`:

1. Get article details (title, URL, summary, tags)
2. If BLINKO_URL and BLINKO_TOKEN are set:
   ```bash
   curl -X POST "${BLINKO_URL}/api/v1/note/upsert" \
     -H "Authorization: Bearer ${BLINKO_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"content": "# {title}\n\n{summary}\n\n[Original]({url})\n\n#rss-digest #{category}", "type": 0}'
   ```
3. After saving, record to Cortex:
   ```bash
   node {baseDir}/scripts/cortex-api.mjs remember "User saved article '{title}' from {source} about {topics} to Blinko" --category preference --importance 0.8
   ```

## Notes

- Requires Node.js 18+ for the scripts
- FreshRSS API password ≠ login password
- Cortex agent `reader` is auto-created on first API call
- Works with OpenClaw, Cursor, Claude Code, OpenCode — any client that can run shell scripts
- All data self-hosted: FreshRSS + Cortex + Blinko = your infrastructure
- Default fetch: 50 articles; adjust --count for busier feeds
