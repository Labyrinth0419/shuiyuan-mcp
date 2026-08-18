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

| Category | Change | Commit |
|----------|--------|--------|
| **Auth** | Added User API Key login (`shuiyuan-api-key-login`) with RSA keypair + Shuiyuan authorization flow | `ad4a79f` |
| **Read-only** | Removed all write tools: create/update post/topic/category/user, upload_file, save/delete_draft, Data Explorer query CRUD | `5ee412f` |
| **Rename** | All `discourse_*` tools → `shuiyuan_*`, resource URIs `discourse://` → `shuiyuan://`, User-Agent → `Shuiyuan-MCP`, server name → `@shuiyuan/mcp` | `33f7b40` |
| **Slim** | Removed admin-only tools (list_users, get_query, run_query), Data Explorer resources, sql_query prompt | `01e08bc` |
| **Slim** | Removed `shuiyuan_select_site` (site hardcoded to `https://shuiyuan.sjtu.edu.cn`) | `ef55f3c` |
| **Media** | Added `shuiyuan_download_media`: parallel download of images/attachments/video/audio from topics | `50387c5` |
| **Cache** | Added SQLite FTS5 persistent search cache: `search` and `read_topic` support `cache: true` offline mode, live ops auto-populate cache | `c00642e` |
| **Skill** | Added `deepsearch` skill: guides model to use cached search/read workflow for deep research | `c00642e` |
| **Docker** | Added Dockerfile + docker-compose for containerized deployment | `0dac049` |
| **Scripts** | Added `shuiyuan-api-key-login.ps1/.cmd` launcher scripts | `ad4a79f` |
| **Windows** | Windows launcher (ShuiyuanLauncher) supports three modes: login / api-key-login / mcp | `ad4a79f` |
| **Defaults** | Site hardcoded to `https://shuiyuan.sjtu.edu.cn`, `tools_mode` fixed to `discourse_api_only`, `read_only: true`, `allow_writes: false` | Global |
| **Tool count** | Upstream 20+ tools → this fork 9 tools + 6 resources + 0 prompts | — |
