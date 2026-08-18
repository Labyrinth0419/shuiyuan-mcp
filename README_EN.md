# Shuiyuan MCP

[中文](README.md)

> **Important: read the [Shuiyuan rules](skills/shuiyuan-mcp/references/rules.md) before using Shuiyuan.**

A read-only MCP server for [Shuiyuan](https://shuiyuan.sjtu.edu.cn/) (SJTU Discourse forum), forked from Discourse MCP. First-run login opens a browser for jAccount SSO; subsequent runs reuse the saved session.

## Features

- Search, filter, and read Shuiyuan topics and user profiles
- View drafts and chat channels
- Parallel download of images, attachments, video, and audio from topics
- Persistent search cache (SQLite FTS5) with automatic degradation when the server is down
- Cookie login (jAccount SSO) and User API Key login
- **Read-only**: all posting, editing, and user-profile write tools have been removed

## Requirements

- Node.js ≥ 24, pnpm/corepack
- .NET SDK for building Windows `.exe` launchers
- Docker ≥ 20.10 for container deployment

```bash
corepack pnpm install
corepack pnpm build
```

## Quick Start

### 1. Login (pick one)

**Cookie login** (opens browser for jAccount SSO):

```powershell
.\scripts\shuiyuan-login.ps1
```

**User API Key login** (no repeated browser login, see [docs/shuiyuan-api-key.md](docs/shuiyuan-api-key.md)):

```powershell
.\scripts\shuiyuan-api-key-login.ps1
```

Both write to `%APPDATA%\shuiyuan-mcp\profile.json`.

### 2. Start MCP

```powershell
.\scripts\shuiyuan-mcp.ps1
```

### 3. MCP Client Config

**PowerShell script**:

```json
{
  "mcpServers": {
    "shuiyuan": {
      "command": "powershell",
      "args": ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "D:\\path\\to\\shuiyuan-mcp\\scripts\\shuiyuan-mcp.ps1"]
    }
  }
}
```

**Direct Node**:

```json
{
  "mcpServers": {
    "shuiyuan": {
      "command": "node",
      "args": ["D:\\path\\to\\shuiyuan-mcp\\dist\\shuiyuan-mcp.js"]
    }
  }
}
```

## Tools

| Tool | Purpose |
|------|---------|
| `shuiyuan_search` | Full-text search, supports `cache: true` for offline mode |
| `shuiyuan_filter_topics` | Filter topics by category/tag/status |
| `shuiyuan_read_topic` | Read full topic, supports `cache: true` |
| `shuiyuan_read_post` | Read a single post |
| `shuiyuan_get_user` | Get user profile |
| `shuiyuan_list_user_posts` | List user's recent posts |
| `shuiyuan_get_chat_messages` | Get chat messages |
| `shuiyuan_get_draft` | Get a draft |
| `shuiyuan_download_media` | Parallel download of images/attachments/video/audio from topics |

## Resources

| URI | Purpose |
|-----|---------|
| `shuiyuan://site/categories` | Category list |
| `shuiyuan://site/tags` | Tag list |
| `shuiyuan://site/groups` | User groups |
| `shuiyuan://chat/channels` | Chat channels |
| `shuiyuan://user/chat-channels` | User's chat channels |
| `shuiyuan://user/drafts` | User's drafts |

## Docker Deployment

The container includes the better-sqlite3 build environment and search cache, suitable for long-running server deployments.

```bash
# Build
docker build -t shuiyuan-mcp .

# Prepare profile (complete login locally first)
PROFILE="$HOME/.config/shuiyuan-mcp/profile.json"

# stdio mode (for MCP clients)
docker run --rm -i \
  -v shuiyuan-data:/data \
  -v "$PROFILE":/data/profile.json:ro \
  shuiyuan-mcp

# HTTP mode (remote access)
docker run --rm -p 3765:3765 \
  -v shuiyuan-data:/data \
  -v "$PROFILE":/data/profile.json:ro \
  shuiyuan-mcp --transport http --port 3765
```

**docker-compose**:

```bash
cp "$PROFILE" .
docker compose up -d
```

**MCP client connecting to Docker**:

```json
{
  "mcpServers": {
    "shuiyuan": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "-v", "shuiyuan-data:/data", "shuiyuan-mcp"]
    }
  }
}
```

## Codex Skills

Two bundled skills:

```powershell
Copy-Item .\skills\shuiyuan-mcp "$env:USERPROFILE\.codex\skills\shuiyuan-mcp" -Recurse -Force
Copy-Item .\skills\deepsearch "$env:USERPROFILE\.codex\skills\deepsearch" -Recurse -Force
```

- `shuiyuan-mcp`: guides Codex to use Shuiyuan MCP read-only tools
- `deepsearch`: triggered by keyword `deepsearch`, guides multi-pass retrieval, cross-validation, and evidence synthesis

## Security

- No jAccount password stored — only cookies or User API Key
- `cookies.json` / `user_api_key` equals your login session; treat as password
- Never commit profile/cookie files to public repositories

## Development

```bash
corepack pnpm install    # Install dependencies
corepack pnpm typecheck  # Type check
corepack pnpm build      # Compile
corepack pnpm lint       # Lint
corepack pnpm test       # Test (build first)
```

Project structure:

| Path | Purpose |
|------|---------|
| `src/index.ts` | MCP entry point |
| `src/shuiyuan-login.ts` | Browser cookie login |
| `src/shuiyuan-mcp.ts` | Start MCP (reuse profile) |
| `src/shuiyuan-api-key-login.ts` | User API Key login |
| `src/cache/` | SQLite FTS5 search cache |
| `src/http/client.ts` | HTTP client |
| `src/tools/builtin/` | Built-in tools |
| `src/resources/` | Resource registry |
| `skills/` | Codex skills |

## License

MIT. Upstream implementation from [Discourse MCP](https://github.com/discourse/discourse-mcp).

---

## Changes vs Upstream `@dajiaohuang/discourse-mcp`

Aggressive changes on top of the upstream Discourse MCP:

- **Read-only**: removed all write tools (posting, editing, user-profile changes, draft management, Data Explorer)
- **Rebrand**: all `discourse_*` tools/resources/prompts renamed to `shuiyuan_*`, site hardcoded to `https://shuiyuan.sjtu.edu.cn`
- **Slim**: removed select_site, admin-only tools, Data Explorer resources and prompt; reduced from 20+ tools to 9
- **New capabilities**: User API Key login, parallel media download, SQLite FTS5 search cache (offline search/read), deepsearch skill, Docker deployment
