---
name: freshrss-ai-digest
description: "AI-powered RSS digest from your FreshRSS instance with personalized recommendations. Trigger with /digest, /recommend, or ask for news/headlines. Fetches articles via FreshRSS API, scores by relevance/quality, generates summaries, learns preferences via Cortex Memory, and saves highlights to Blinko."
---

# FreshRSS AI Digest

AI-powered daily digest from your self-hosted FreshRSS instance. Scores, summarizes, and recommends articles based on your reading preferences.

## Setup

Set these environment variables:

```bash
export FRESHRSS_URL="https://your-freshrss-instance.com"
export FRESHRSS_USER="your-username"
export FRESHRSS_API_PASSWORD="your-api-password"
```

Optional (for Blinko integration):

```bash
export BLINKO_URL="https://your-blinko-instance.com"
export BLINKO_TOKEN="your-blinko-api-token"
```

API password is set in FreshRSS → Settings → Profile → API Management.

## Commands

### Daily Digest

User says `/digest` or asks for a news digest/daily briefing.

**Parameters** (ask user if not specified):

| Param | Options | Default |
|-------|---------|---------|
| Time range | 4h / 12h / 24h / 48h / 72h | 24h |
| Top N articles | 5 / 10 / 15 / 20 | 10 |
| Language | zh / en | zh |
| Category | any FreshRSS category | all |

### Personalized Recommendations

User says `/recommend` or asks "what should I read?"

### Save to Blinko

User says `/save [article number]` or asks to save an article.

### Browse

User says `/feeds` or `/categories` to explore FreshRSS content.

## Workflow

### Step 1: Fetch articles from FreshRSS

```bash
node {baseDir}/scripts/fetch-freshrss.mjs --hours <HOURS> --count 50 --unread
```

For specific category:
```bash
node {baseDir}/scripts/fetch-freshrss.mjs --hours <HOURS> --count 50 --unread --category "Technology"
```

List categories:
```bash
node {baseDir}/scripts/fetch-freshrss.mjs --categories
```

List feeds:
```bash
node {baseDir}/scripts/fetch-freshrss.mjs --feeds
```

The script outputs JSON to stdout. Capture it.

### Step 2: Load user preferences from Memory

Before scoring, check if we know user preferences:

**Memory query**: Search memory for "RSS reading preferences", "favorite topics", "article interests", and "reading history patterns".

Use any returned preferences to bias the scoring in Step 3. For example:
- If user prefers "AI security" → boost security + AI articles
- If user marked "boring: cryptocurrency news" → lower crypto scores
- If user frequently saves Go/Rust articles → boost programming language content

If no preferences found, proceed with neutral scoring.

### Step 3: Score and classify

From the fetched articles JSON, score each article on three dimensions (1-10):

1. **Relevance** — How relevant to the user's known interests (from Memory). If no preferences, score based on general tech/AI relevance.
2. **Quality** — Depth of insight, originality, technical substance (from title + summary)
3. **Timeliness** — Breaking news or emerging trend vs. evergreen content

Apply preference multipliers:
- Topics matching user favorites: score × 1.3
- Topics matching user dislikes: score × 0.5
- Sources user frequently saves from: score × 1.2

Classify into categories:
- 🤖 AI / ML
- 🔒 Security
- ⚙️ Engineering
- 🛠 Tools / Open Source
- 💡 Opinion / Essay
- 🌐 Web / Frontend
- 📊 Data / Infrastructure
- 📝 Other

Select the top N articles by total weighted score.

### Step 4: Generate summaries

For each selected article:
1. If `summary` from FreshRSS is sufficient (>100 chars), use it as basis
2. If not, use `web_fetch` or equivalent to read the full article
3. Generate a structured summary:
   - Chinese title translation (keep original as link text)
   - 2-3 sentence summary: core problem → key insight → conclusion
   - Recommendation reason (1 sentence, personalized if preferences available)
   - Keywords (2-3 tags)

### Step 5: Generate trend highlights

Analyze all selected articles together and identify 2-3 macro trends.

### Step 6: Format output

Output as a Telegram-friendly message:

```
📰 FreshRSS AI Digest — {date}
来自你的 FreshRSS 订阅 · {feed_count} 源 · {hours}h 窗口

📝 今日看点
{2-3 sentence macro trend summary}

🏆 今日必读 (Top 3)
1. {Chinese title}
   {source} · {relative time}
   {summary}
   🏷️ {keywords}
   💡 推荐理由：{personalized reason}

2. ...
3. ...

📋 更多精选
4. {Chinese title} — {source} · {one-line summary}
5. ...

📊 统计：{N} 源 → {M} 篇未读 → {K} 篇精选
🧠 个性化：{preference_status}
```

### Step 7: Update Memory with reading patterns

After generating the digest, store a brief observation to memory:

**Memory store**: "User received digest on {date}. Topics covered: {topic list}. Top scored categories: {categories}. {N} articles from {M} feeds."

This builds up the preference model over time.

## Personalized Recommendations (/recommend)

When user asks for recommendations:

1. **Load full preference profile** from Memory — search for all RSS-related memories
2. Fetch recent unread articles from FreshRSS (last 48h)
3. Score articles heavily weighted by preference profile:
   - Match against favorite topics (from memory)
   - Match against preferred sources (from memory)
   - Penalize topics user has shown disinterest in
4. Present top 5 with personalized explanation of why each was recommended

Format:
```
🎯 为你推荐 — 基于你的阅读偏好

1. {title}
   📍 {source} · {time}
   🧠 推荐原因：你经常关注 {topic}，这篇文章深入讨论了 {specific_angle}

2. ...
```

## Preference Learning

Users can teach the system:

- "/like 3" → Remember that user liked article 3 (store topic + source preference)
- "/dislike 2" → Remember that user found article 2 uninteresting
- "/prefer topic:AI security" → Explicitly add preference
- "/forget topic:crypto" → Remove a preference

For each interaction, store to memory:

- **Like**: "User liked article about {topic} from {source}. Tags: {tags}"
- **Dislike**: "User found article about {topic} uninteresting"
- **Explicit preference**: "User explicitly prefers {topic}"

## Save to Blinko (/save)

When user says `/save 3` or asks to save an article:

1. Get the article details (title, URL, summary, tags)
2. If BLINKO_URL and BLINKO_TOKEN are set, POST to Blinko API:
   ```
   POST {BLINKO_URL}/api/v1/note/upsert
   Headers: Authorization: Bearer {BLINKO_TOKEN}
   Body: {
     "content": "# {title}\n\n{summary}\n\n[Original]({url})\n\n#rss-digest #{category}",
     "type": 0
   }
   ```
3. If Blinko is not configured, format the article for manual saving

After saving, store to memory: "User saved article about {topic} from {source} to Blinko"

## Notes

- The fetch script requires Node.js 18+ (available on OpenClaw/Cursor/Claude Code environments)
- FreshRSS API password is separate from your login password
- The skill works with any MCP-compatible client: OpenClaw, Cursor, Claude Code, OpenCode
- Memory integration is optional but recommended for personalization
- All data stays on your infrastructure — FreshRSS is self-hosted, Memory is local
- Default fetch count is 50 articles; adjust --count for busier feeds
