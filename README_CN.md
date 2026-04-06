# YourRSS

[English](./README.md) | [中文](./README_CN.md)

你的个人 AI RSS 精选 — 基于自建 FreshRSS。

YourRSS 从你的 FreshRSS 获取文章，用 AI 进行相关性和质量评分，生成精炼摘要，并通过 [Cortex](https://github.com/rikouu/cortex) 记忆系统学习你的阅读偏好。每次生成的 digest 都比上一次更懂你。

支持 **OpenClaw**、**Cursor**、**Claude Code**、**OpenCode** 以及任何能运行 Shell 脚本的 AI Agent。

## 功能亮点

- **智能摘要** — AI 对 RSS 文章评分排序，生成每日精选简报
- **灵活的 AI 提供商** — 可用当前 Agent 或外部低成本模型（OpenAI、Gemini、DeepSeek、Qwen、Ollama 或任何兼容网关）
- **全文分析** — 基于文章完整内容评分，而非仅摘要
- **并发处理** — 可配置批量大小和并发数，快速评分（300 篇约 3 分钟）
- **两阶段评分** — 所有文章轻量评分 + Top N 生成详细摘要
- **个性化推荐** — Cortex Memory `reader` agent 学习你的喜好
- **偏好学习** — 点赞/点踩教会系统；支持 `/prefer` 显式偏好
- **订阅管理** — 直接通过命令订阅/取消订阅 RSS 源
- **Blinko 集成** — 将精选内容保存到 Blinko 知识库
- **多语言** — 支持中文和英文输出
- **分类过滤** — 聚焦特定 FreshRSS 分类
- **100% 自托管** — FreshRSS + Cortex + Blinko = 你的基础设施，你的数据

## 快速开始

### OpenClaw

```bash
clawhub install yourrss
```

然后：`/digest`

### Cursor / Claude Code / 其他 Agent

```bash
git clone https://github.com/XimilalaXiang/YourRSS.git
```

在你的 Agent 配置中引用 `SKILL.md`。

## 配置

### 1. FreshRSS（必需）

```bash
export FRESHRSS_URL="https://your-freshrss-instance.com"
export FRESHRSS_USER="your-username"
export FRESHRSS_API_PASSWORD="your-api-password"
```

也可以在项目根目录创建 `.env` 文件（参考 `.env.example`）。

### 2. Cortex Memory（必需）

```bash
export CORTEX_URL="http://localhost:21100"
export CORTEX_TOKEN="your-auth-token"    # 可选
export CORTEX_AGENT="reader"              # RSS 独立命名空间
```

`reader` agent 首次使用时自动创建。你的 RSS 偏好与其他 Cortex agent 隔离。

### 3. AI 评分提供商（可选）

```bash
# "agent" = Agent 直接处理评分（由当前对话的 AI 代理完成）
# "openai" = 调用外部 OpenAI 兼容 API（节省 Agent tokens）
export AI_PROVIDER="agent"
export AI_BASE_URL="https://api.openai.com/v1"   # 或你的网关
export AI_API_KEY="sk-..."
export AI_MODEL="gpt-4o-mini"
```

兼容：OpenAI、Gemini、DeepSeek、Qwen、Ollama 或任何 OpenAI 兼容代理（如 [vercel-gateway-tools](https://github.com/XimilalaXiang/vercel-gateway-tools)）。

### 4. Blinko（可选）

```bash
export BLINKO_URL="https://your-blinko-instance.com"
export BLINKO_TOKEN="your-api-token"
```

## 工作流程

```
FreshRSS API → 获取文章 → Cortex 偏好 → AI 评分 → AI 摘要 → 推送 Digest
     │              │            │             │           │          │
  Google Reader  fetch-freshrss  REST API     相关性/      2-3句     Telegram
  API            .mjs           reader agent  质量/时效    精炼摘要   消息
                                /api/v1/recall
```

**个性化闭环：**
```
用户阅读 digest → /like 或 /dislike → Cortex 存储偏好
     ↓                                       ↓
下期 digest ← 偏好加权评分 ←    Cortex 回忆偏好
```

## 命令

| 命令 | 说明 |
|------|------|
| `/digest` | 生成 AI 精选（默认最近 24 小时） |
| `/digest 48h` | 最近 48 小时的精选 |
| `/recommend` | 基于 Cortex 的个性化推荐 |
| `/like 3` | 点赞第 3 篇文章 → 存入 Cortex |
| `/dislike 2` | 点踩第 2 篇文章 → 存入 Cortex |
| `/save 1` | 保存第 1 篇文章到 Blinko |
| `/prefer topic:AI安全` | 显式偏好设置 |
| `/forget topic:crypto` | 移除某个偏好 |
| `/feeds` | 列出 FreshRSS 订阅源 |
| `/categories` | 列出 FreshRSS 分类 |
| `/subscribe <url>` | 订阅新的 RSS 源 |
| `/unsubscribe <id>` | 取消订阅 |

## 脚本

| 脚本 | 功能 |
|------|------|
| `scripts/fetch-freshrss.mjs` | FreshRSS Google Reader API 客户端 |
| `scripts/cortex-api.mjs` | Cortex Memory REST API 客户端 |
| `scripts/score-articles.mjs` | AI 评分：Agent 直通或外部 OpenAI API |
| `scripts/load-env.mjs` | 加载 .env 配置（所有脚本共用） |

### fetch-freshrss.mjs

```bash
# 获取最近 24 小时的未读文章
node scripts/fetch-freshrss.mjs --hours 24 --count 50 --unread

# 按分类过滤
node scripts/fetch-freshrss.mjs --hours 24 --category "Technology" --unread

# 列出分类和订阅源
node scripts/fetch-freshrss.mjs --categories
node scripts/fetch-freshrss.mjs --feeds

# 订阅 / 取消订阅
node scripts/fetch-freshrss.mjs --subscribe "https://example.com/feed.xml" --subscribe-category "Tech"
node scripts/fetch-freshrss.mjs --unsubscribe "feed/123"
```

### score-articles.mjs

```bash
# 通过外部 OpenAI 兼容 API 评分（节省 Agent tokens）
node scripts/fetch-freshrss.mjs --hours 24 --count 100 \
  | node scripts/score-articles.mjs --top 15 --language zh

# 带 Cortex 用户偏好
node scripts/cortex-api.mjs preferences > /tmp/prefs.json
node scripts/fetch-freshrss.mjs --hours 48 --count 200 \
  | node scripts/score-articles.mjs --top 15 --preferences /tmp/prefs.json

# 调整批量大小和并发数
node scripts/fetch-freshrss.mjs --hours 72 --count 300 \
  | node scripts/score-articles.mjs --top 20 --batch-size 10 --concurrency 20

# 临时指定模型
... | node scripts/score-articles.mjs --provider openai --model google/gemini-3-flash
```

### cortex-api.mjs

```bash
# 初始化 reader agent（首次运行）
node scripts/cortex-api.mjs init

# 获取用户偏好
node scripts/cortex-api.mjs preferences

# 记录点赞
node scripts/cortex-api.mjs like "文章标题" --source "博客" --topics "AI,Go"

# 搜索记忆
node scripts/cortex-api.mjs recall "喜欢的话题"

# 存储记忆
node scripts/cortex-api.mjs remember "用户偏好 Go 语言文章" --category preference

# 记录 digest 会话
node scripts/cortex-api.mjs digest-log "2026-04-06" --topics "AI,Security" --articles 10
```

## 项目结构

```
YourRSS/
├── SKILL.md                  # Skill 定义（AI 工作流 + Cortex + Blinko）
├── README.md                 # English README
├── README_CN.md              # 中文 README
├── .env.example              # 环境变量模板
├── scripts/
│   ├── fetch-freshrss.mjs    # FreshRSS API 客户端（Node.js，零依赖）
│   ├── score-articles.mjs    # AI 评分：Agent 直通或外部 API
│   ├── cortex-api.mjs        # Cortex Memory REST API 客户端（零依赖）
│   └── load-env.mjs          # .env 加载器（所有脚本共用）
└── references/
    └── sources.json           # 备用静态源列表
```

## 功能对比

| 功能 | freshrss-reader | rss-digest | ai-daily-digest | **YourRSS** |
|------|----------------|------------|-----------------|-------------|
| FreshRSS API | ✅ | ❌ | ❌ | ✅ |
| AI 评分 | ❌ | ✅ | ✅ | ✅ |
| AI 摘要 | ❌ | ✅ | ✅ | ✅ |
| Cortex 记忆 | ❌ | ❌ | ❌ | ✅ REST API |
| 偏好学习 | ❌ | ❌ | ❌ | ✅ 点赞/点踩 |
| 个性化推荐 | ❌ | ❌ | ❌ | ✅ |
| Blinko 保存 | ❌ | ❌ | ❌ | ✅ |
| 全文评分 | ❌ | ❌ | ❌ | ✅ |
| 并发处理 | ❌ | ❌ | ❌ | ✅ |
| 灵活 AI 提供商 | ❌ | ❌ | ❌ | ✅ |
| 多客户端支持 | ✅ | OpenClaw | OpenClaw | ✅ 任意 |

## 环境要求

- Node.js 18+
- 自建 FreshRSS（需开启 API 访问）
- 自建 Cortex Memory 服务器
- （可选）Blinko 用于知识沉淀
- （可选）OpenAI 兼容 API 用于外部评分

## 许可证

MIT

## 致谢

- Fork 自 [ai-daily-digest](https://github.com/HarrisHan/ai-daily-digest) by HarrisHan
- 记忆系统由 [Cortex](https://github.com/rikouu/cortex) by rikouu 提供
- FreshRSS API 灵感来源于 [freshrss-reader](https://github.com/openclaw/skills/tree/main/skills/nickian/freshrss-reader)
