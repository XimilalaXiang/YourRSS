# FreshRSS AI Digest

AI-powered RSS digest from your self-hosted FreshRSS instance. Fetches articles, scores by relevance/quality, generates summaries, learns your preferences, and recommends content — all through your AI agent.

Works with **OpenClaw**, **Cursor**, **Claude Code**, **OpenCode**, and any MCP-compatible AI client.

## Features

- **Smart Digest** — AI scores and summarizes your FreshRSS articles into a daily briefing
- **Personalized Recommendations** — Learns your preferences via Memory, gets better over time
- **Preference Learning** — Like/dislike articles to teach the system what you enjoy
- **Blinko Integration** — Save highlights to your Blinko knowledge base
- **Multi-language** — Chinese and English output support
- **Category Filtering** — Focus on specific FreshRSS categories
- **100% Self-hosted** — Your data stays on your infrastructure

## Quick Start

### OpenClaw

```bash
clawhub install freshrss-ai-digest
```

Then in any chat:

```
/digest
```

### Cursor / Claude Code

Copy the skill to your workspace:

```bash
git clone https://github.com/XimilalaXiang/freshrss-ai-digest.git
```

Reference the `SKILL.md` in your agent configuration.

### Manual Installation

```bash
git clone https://github.com/XimilalaXiang/freshrss-ai-digest.git ~/.openclaw/workspace/skills/freshrss-ai-digest
```

## Setup

### Required

Set these environment variables:

```bash
export FRESHRSS_URL="https://your-freshrss-instance.com"
export FRESHRSS_USER="your-username"
export FRESHRSS_API_PASSWORD="your-api-password"
```

API password: FreshRSS → Settings → Profile → API Management.

### Optional (Blinko)

```bash
export BLINKO_URL="https://your-blinko-instance.com"
export BLINKO_TOKEN="your-blinko-api-token"
```

## How It Works

```
FreshRSS API → Fetch Articles → Memory Preferences → AI Scoring → AI Summary → Digest
     │              │                   │                  │             │           │
  Google Reader  fetch-freshrss.mjs  Cortex/Memory     relevance/    2-3 sentence  Telegram
  API            (Node.js 18+)       user preferences  quality/       summaries     message
                                                        timeliness
```

## Commands

| Command | Description |
|---------|-------------|
| `/digest` | Generate today's AI digest |
| `/digest 48h` | Digest from last 48 hours |
| `/recommend` | Get personalized recommendations |
| `/like 3` | Mark article 3 as interesting |
| `/dislike 2` | Mark article 2 as uninteresting |
| `/save 1` | Save article 1 to Blinko |
| `/feeds` | List your FreshRSS feeds |
| `/categories` | List your FreshRSS categories |
| `/prefer topic:AI security` | Add an explicit preference |

## Personalization

The skill learns from your interactions:

1. **Implicit** — Articles you save, like, or read build a preference profile
2. **Explicit** — Use `/prefer` and `/forget` to manually adjust
3. **Progressive** — Recommendations improve over time as Memory accumulates data

Preferences are stored via Memory (Cortex or similar), persisting across sessions.

## Configuration

### Time Range

```
/digest 4h      # Last 4 hours
/digest 24h     # Last 24 hours (default)
/digest 48h     # Last 48 hours
/digest 72h     # Last 72 hours
```

### Category Filter

```
/digest --category Technology
/digest --category "AI & ML"
```

### Article Count

Default: top 10 articles. Ask for more: "give me top 20 articles".

## Project Structure

```
freshrss-ai-digest/
├── SKILL.md                  # Skill definition (scoring, memory, recommendations)
├── README.md                 # This file
├── scripts/
│   ├── fetch-freshrss.mjs    # FreshRSS API client (Node.js, zero deps)
│   └── fetch-rss.mjs         # Original static RSS fetcher (legacy)
└── references/
    └── sources.json           # Fallback static sources (not used with FreshRSS)
```

## vs. Other Skills

| Feature | freshrss-reader | rss-digest | ai-daily-digest | **This Skill** |
|---------|----------------|------------|-----------------|---------------|
| FreshRSS API | ✅ | ❌ | ❌ | ✅ |
| AI Scoring | ❌ | ✅ | ✅ | ✅ |
| AI Summaries | ❌ | ✅ | ✅ | ✅ |
| Personalization | ❌ | ❌ | ❌ | ✅ Memory |
| Preference Learning | ❌ | ❌ | ❌ | ✅ Like/Dislike |
| Blinko Save | ❌ | ❌ | ❌ | ✅ |
| Multi-client | ✅ | OpenClaw | OpenClaw | ✅ Any MCP |

## Requirements

- Node.js 18+ (for the fetch script)
- A self-hosted FreshRSS instance with API access enabled
- `jq` (optional, for debugging)

## License

MIT

## Credits

- Forked from [ai-daily-digest](https://github.com/HarrisHan/ai-daily-digest) by HarrisHan
- FreshRSS API integration inspired by [freshrss-reader](https://github.com/openclaw/skills/tree/main/skills/nickian/freshrss-reader) by nickian
- Built for the open AI agent ecosystem
