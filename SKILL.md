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
### Manage: `/unsubscribe [feed]`, `/subscribe [url]`

## Workflow

### Step 0: Initialize Cortex reader agent

Before first use, ensure the `reader` agent exists in Cortex:

```bash
node {baseDir}/scripts/cortex-api.mjs init
```

This checks if the `reader` agent exists and creates it if needed. Run this once or at the start of every digest session (idempotent).

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

Manage subscriptions:
```bash
# Unsubscribe by feed ID (get IDs from --feeds)
node {baseDir}/scripts/fetch-freshrss.mjs --unsubscribe "feed/123"

# Subscribe to new feed
node {baseDir}/scripts/fetch-freshrss.mjs --subscribe "https://example.com/feed.xml" --subscribe-category "Technology"
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

### Step 7: Interactive Dialogue — Wait for User Feedback

**CRITICAL: Do NOT end the conversation after showing the digest.** This is a multi-turn interactive session.

After presenting the digest, ask the user:

```
你对今天的精选有什么想法？
- 回复数字（如 "1"、"3"）查看文章详情
- 说 "喜欢 1" 或 "不感兴趣 4" 来训练推荐
- 说 "多看看 AI 安全" 来调整偏好
- 说 "保存 2" 保存到 Blinko
- 说 "下一页" 查看更多文章
- 说 "结束" 结束本次阅读
```

### Step 8: Process User Feedback (Multi-turn Loop)

This step repeats until the user says "结束" or leaves:

**If user replies with a number** (e.g., "1", "看看第3篇"):
- Fetch the full article content via web_fetch
- Present a detailed summary with key takeaways
- Ask: "这篇文章怎么样？觉得有用吗？"

**If user says "喜欢 X" or positive feedback** (e.g., "不错", "这个好"):
- Identify the article and its topics/source
- Record to Cortex:
  ```bash
  node {baseDir}/scripts/cortex-api.mjs like "{title}" --source "{source}" --topics "{topics}" --url "{url}"
  ```
- Respond: "已记住！以后会多推荐 {topics} 相关的内容。"

**If user says "不感兴趣 X" or negative feedback** (e.g., "无聊", "不想看这类"):
- Record to Cortex:
  ```bash
  node {baseDir}/scripts/cortex-api.mjs dislike "{title}" --source "{source}" --topics "{topics}"
  ```
- Respond: "收到，以后会减少推荐 {topics} 类内容。"

**If user adjusts preferences** (e.g., "多看看AI安全", "少推荐区块链"):
- Record explicit preference:
  ```bash
  node {baseDir}/scripts/cortex-api.mjs remember "User wants more articles about: {topic}" --category preference --importance 0.9
  ```
  or for negative:
  ```bash
  node {baseDir}/scripts/cortex-api.mjs remember "User wants fewer articles about: {topic}" --category preference --importance 0.8
  ```
- Respond with confirmation and immediately re-score remaining articles with updated preferences

**If user says "下一页" or "更多"**:
- Show the next batch of articles (items N+1 to N+5 from the scored list)
- Continue the feedback loop

**If user says "保存 X"**:
- Execute the Blinko save flow (see Save to Blinko section)
- Record the save action to Cortex

**If user says "结束" / "够了" / "谢谢"**:
- Proceed to Step 9

### Step 9: Session Summary & Cortex Log

At the end of the conversation, summarize what was learned and log to Cortex:

```bash
node {baseDir}/scripts/cortex-api.mjs digest-log "{date}" \
  --topics "AI,Security,Go" \
  --categories "AI/ML,Engineering" \
  --articles 10 \
  --feeds 45
```

Also store a session-level observation:
```bash
node {baseDir}/scripts/cortex-api.mjs remember \
  "Digest session {date}: User liked {liked_topics}, disliked {disliked_topics}. Saved {N} articles. Spent most time on {main_topic}. Preference trend: {observation}" \
  --category agent_user_habit --importance 0.7
```

This builds the long-term preference model.

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
