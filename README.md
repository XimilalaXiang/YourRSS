# FreshRSS AI Digest

AI-powered RSS digest from your self-hosted FreshRSS. Fetches articles, scores by relevance/quality, generates summaries, and learns your preferences through [Cortex](https://github.com/rikouu/cortex) Memory — getting smarter with every digest.

Works with **OpenClaw**, **Cursor**, **Claude Code**, **OpenCode**, and any AI agent that can run shell scripts.

## Features

- **Smart Digest** — AI scores and summarizes your FreshRSS articles into a daily briefing
- **Personalized Recommendations** — Cortex Memory `reader` agent learns what you like
- **Preference Learning** — Like/dislike to teach the system; explicit `/prefer` commands
- **Blinko Integration** — Save highlights to your Blinko knowledge base
- **Multi-language** — Chinese and English output
- **Category Filtering** — Focus on specific FreshRSS categories
- **100% Self-hosted** — FreshRSS + Cortex + Blinko = your infrastructure

## Quick Start

### OpenClaw

```bash
clawhub install freshrss-ai-digest
```

Then: `/digest`

### Cursor / Claude Code / Other Agents

```bash
git clone https://github.com/XimilalaXiang/YourRSS.git
```

Reference the `SKILL.md` in your agent configuration.

## Setup

### 1. FreshRSS (Required)

```bash
export FRESHRSS_URL="https://your-freshrss-instance.com"
export FRESHRSS_USER="your-username"
export FRESHRSS_API_PASSWORD="your-api-password"
```

### 2. Cortex Memory (Required)

```bash
export CORTEX_URL="http://localhost:21100"
export CORTEX_TOKEN="your-auth-token"    # optional
export CORTEX_AGENT="reader"              # isolated namespace for RSS
```

The `reader` agent is auto-created on first use. Your RSS preferences are isolated from other Cortex agents.

### 3. Blinko (Optional)

```bash
export BLINKO_URL="https://your-blinko-instance.com"
export BLINKO_TOKEN="your-api-token"
```

## How It Works

```
FreshRSS API → Fetch Articles → Cortex Preferences → AI Scoring → AI Summary → Digest
     │              │                   │                  │             │           │
  Google Reader  fetch-freshrss.mjs  REST API to       relevance/    2-3 sentence  Telegram
  API            (zero deps)         reader agent      quality/       summaries     message
                                     /api/v1/recall    timeliness
```

**Personalization loop:**
```
User reads digest → /like or /dislike → Cortex stores preference
     ↓                                          ↓
Next digest ← scores biased by preferences ← Cortex recalls
```

## Commands

| Command | Description |
|---------|-------------|
| `/digest` | Generate AI digest (default: last 24h) |
| `/digest 48h` | Digest from last 48 hours |
| `/recommend` | Personalized recommendations from Cortex |
| `/like 3` | Like article 3 → stored in Cortex |
| `/dislike 2` | Dislike article 2 → stored in Cortex |
| `/save 1` | Save article 1 to Blinko |
| `/prefer topic:AI security` | Explicit preference |
| `/forget topic:crypto` | Remove a preference |
| `/feeds` | List FreshRSS subscriptions |
| `/categories` | List FreshRSS categories |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/fetch-freshrss.mjs` | FreshRSS Google Reader API client |
| `scripts/cortex-api.mjs` | Cortex Memory REST API client |
| `scripts/fetch-rss.mjs` | Static RSS fetcher (legacy fallback) |

### fetch-freshrss.mjs

```bash
# Fetch unread articles from last 24h
node scripts/fetch-freshrss.mjs --hours 24 --count 50 --unread

# Filter by category
node scripts/fetch-freshrss.mjs --hours 24 --category "Technology" --unread

# List categories / feeds
node scripts/fetch-freshrss.mjs --categories
node scripts/fetch-freshrss.mjs --feeds
```

### cortex-api.mjs

```bash
# Get user preferences
node scripts/cortex-api.mjs preferences

# Record a like
node scripts/cortex-api.mjs like "Article Title" --source "Blog" --topics "AI,Go"

# Search memories
node scripts/cortex-api.mjs recall "favorite topics"

# Store a memory
node scripts/cortex-api.mjs remember "User prefers Go articles" --category preference

# Log a digest session
node scripts/cortex-api.mjs digest-log "2026-04-06" --topics "AI,Security" --articles 10
```

## Project Structure

```
freshrss-ai-digest/
├── SKILL.md                  # Skill definition (AI workflow + Cortex + Blinko)
├── README.md
├── scripts/
│   ├── fetch-freshrss.mjs    # FreshRSS API client (Node.js, zero deps)
│   ├── cortex-api.mjs        # Cortex Memory REST API client (zero deps)
│   └── fetch-rss.mjs         # Static RSS fetcher (legacy)
└── references/
    └── sources.json           # Fallback static sources
```

## vs. Other Skills

| Feature | freshrss-reader | rss-digest | ai-daily-digest | **This** |
|---------|----------------|------------|-----------------|----------|
| FreshRSS API | ✅ | ❌ | ❌ | ✅ |
| AI Scoring | ❌ | ✅ | ✅ | ✅ |
| AI Summaries | ❌ | ✅ | ✅ | ✅ |
| Cortex Memory | ❌ | ❌ | ❌ | ✅ REST API |
| Preference Learning | ❌ | ❌ | ❌ | ✅ Like/Dislike |
| Personalized Recs | ❌ | ❌ | ❌ | ✅ |
| Blinko Save | ❌ | ❌ | ❌ | ✅ |
| Multi-client | ✅ | OpenClaw | OpenClaw | ✅ Any |

## Requirements

- Node.js 18+
- Self-hosted FreshRSS with API access
- Self-hosted Cortex Memory server
- (Optional) Blinko for knowledge retention

## License

MIT

## Credits

- Forked from [ai-daily-digest](https://github.com/HarrisHan/ai-daily-digest) by HarrisHan
- Memory powered by [Cortex](https://github.com/rikouu/cortex) by rikouu
- FreshRSS API inspired by [freshrss-reader](https://github.com/openclaw/skills/tree/main/skills/nickian/freshrss-reader)
