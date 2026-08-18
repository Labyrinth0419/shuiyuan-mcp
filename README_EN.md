## Shuiyuan MCP

[中文说明](README.md)

> **Important Shuiyuan usage rules**: before publishing or automating Shuiyuan activity, read the bundled [Shuiyuan rules reference](skills/shuiyuan-mcp/references/rules.md).

A Model Context Protocol (MCP) stdio server for Shuiyuan, the SJTU Discourse forum. It adds cookie-based login helpers on top of the upstream Discourse MCP tools/resources.

- **Entry point**: `src/index.ts` → compiled to `dist/index.js` (binary name: `discourse-mcp`)
- **SDK**: `@modelcontextprotocol/sdk`
- **Node**: >= 24
- **Version**: 0.2.4 (0.2.x has breaking changes from 0.1.x - JSON-only output, resources replace list tools)

### Quick start (release)

- **Run (read‑only, recommended to start)**

```bash
npx -y @shuiyuan/mcp@latest
```

Then, in your MCP client, either:

- Call the `shuiyuan_select_site` tool with `{ "site": "https://try.discourse.org" }` to choose a site, or
- Start the server tethered to a site using `--site https://try.discourse.org` (in which case `shuiyuan_select_site` is hidden).

- **Read-only server**: this fork removes all write tools (posting, editing, user-profile changes). No `--allow_writes` flow applies.

- **Use in an MCP client (example: Claude Desktop) — via npx**

```json
{
  "mcpServers": {
    "discourse": {
      "command": "npx",
      "args": ["-y", "@shuiyuan/mcp@latest"],
      "env": {}
    }
  }
}
```

> Alternative: if you prefer a global binary after install, the package exposes `discourse-mcp`.
>
> ```json
> {
>   "mcpServers": {
>     "discourse": { "command": "discourse-mcp", "args": [] }
>   }
> }
> ```

## Configuration

The server registers tools under the MCP server name `@shuiyuan/mcp`. Choose a target Discourse site either by:

- Using the `shuiyuan_select_site` tool at runtime (validates via `/about.json`), or
- Supplying `--site <url>` to tether the server to a single site at startup (validates via `/about.json` and hides `shuiyuan_select_site`).

- **Auth**

  - **None** by default.
  - **Admin API Keys** (require admin permissions): **`--auth_pairs '[{"site":"https://example.com","api_key":"...","api_username":"system"}]'`**
  - **User API Keys** (any user can generate): **`--auth_pairs '[{"site":"https://example.com","user_api_key":"...","user_api_client_id":"..."}]'`**
  - **Cookie auth** (for SSO-only sites): **`--auth_pairs '[{"site":"https://example.com","cookie_file":"C:\\path\\cookies.json"}]'`**
  - **HTTP Basic Auth** (for sites behind a reverse proxy): Add `http_basic_user` and `http_basic_pass` to any `auth_pairs` entry. This is useful for Discourse sites protected by HTTP Basic Authentication at the reverse proxy level.
  - You can include multiple entries in `auth_pairs`; the matching entry is used for the selected site. If both `user_api_key` and `api_key` are provided for the same site, `user_api_key` takes precedence.

- **Write safety**

  - This fork is **read-only**: all write tools were removed in v0.3.0. The `--allow_writes`/`--read_only` flags and the preview-confirm flow no longer apply to any built-in tool.

- **Flags & defaults**

  - `--read_only` (default: true)
  - `--allow_writes` (default: false)
  - `--timeout_ms <number>` (default: 15000)
  - `--concurrency <number>` (default: 4)
  - `--log_level <silent|error|info|debug>` (default: info)
    - `debug`: Shows all HTTP requests, responses, and detailed error information
    - `info`: Shows retry attempts and general operational messages
    - `error`: Shows only errors
    - `silent`: No logging output
  - `--show_emails` (default: false). includes emails in user tools. Requires admin access
  - `--tools_mode <auto|discourse_api_only|tool_exec_api>` (default: auto)
  - `--site <url>`: Tether MCP to a single site and hide `shuiyuan_select_site`.
  - `--default-search <prefix>`: Unconditionally prefix every search query (e.g., `tag:ai order:latest`).
  - `--max-read-length <number>`: Maximum characters returned for post content (default 50000). Applies to `shuiyuan_read_post` and per-post content in `shuiyuan_read_topic`. The tools prefer `raw` content by requesting `include_raw=true`.
  - `--allowed_upload_paths <paths>`: Reserved for upstream compatibility; local file uploads were removed with the write tools.
  - `--transport <stdio|http>` (default: stdio): Transport type. Use `stdio` for standard input/output (default), or `http` for Streamable HTTP transport (stateless mode with JSON responses).
  - `--port <number>` (default: 3000): Port to listen on when using HTTP transport.
  - `--cache_dir <path>` (reserved)
  - `--profile <path.json>` (see below)

- **Profile file** (keep secrets off the command line)

```json
{
  "auth_pairs": [
    {
      "site": "https://try.discourse.org",
      "api_key": "<redacted>",
      "api_username": "system"
    },
    {
      "site": "https://example.com",
      "user_api_key": "<user_api_key>",
      "user_api_client_id": "<client_id>"
    },
    {
      "site": "https://shuiyuan.sjtu.edu.cn",
      "cookie_file": "C:\\Users\\you\\AppData\\Roaming\\shuiyuan-mcp\\cookies.json"
    },
    {
      "site": "https://protected.example.com",
      "api_key": "<redacted>",
      "api_username": "system",
      "http_basic_user": "username",
      "http_basic_pass": "password"
    }
  ],
  "read_only": false,
  "allow_writes": true,
  "show_emails": true,
  "log_level": "info",
  "tools_mode": "auto",
  "site": "https://try.discourse.org",
  "default_search": "tag:ai order:latest",
  "max_read_length": 50000,
  "transport": "stdio",
  "port": 3000,
  "allowed_upload_paths": ["/home/user/images", "/tmp/uploads"]
}
```

Run with:

```bash
node dist/index.js --profile /absolute/path/to/profile.json
```

Flags still override values from the profile.

- **Remote Tool Execution API (optional)**

  - With `tools_mode=auto` (default) or `tool_exec_api`, the server discovers remote tools via GET `/ai/tools` after you select a site (or immediately at startup if `--site` is provided) and registers them dynamically. Set `--tools_mode=discourse_api_only` to disable remote tool discovery.

- **Networking & resilience**

  - Retries on 429/5xx with backoff (3 attempts).
  - Lightweight in‑memory GET cache for selected endpoints.

- **Privacy**
  - Secrets are redacted in logs. Errors are returned as human‑readable messages to MCP clients.

## MCP Resources

Resources provide static/semi-static read-only data via URI addressing. Use these instead of tools for listing operations.

- **shuiyuan://site/categories**

  - List all categories with hierarchy and permissions
  - Output: `{ categories: [{id, name, slug, pid, read_restricted, topic_count, post_count, perms}], meta: {total} }`
  - `perms` is array of `{gid, perm}` where perm: 1=full, 2=create_post, 3=readonly
  - **Note**: `perms` is only populated with admin/moderator auth. Without admin auth, only `read_restricted` boolean is available.

- **shuiyuan://site/tags**

  - List all tags with usage counts
  - Output: `{ tags: [{id, name, count}], meta: {total} }`

- **shuiyuan://site/groups**

  - List all groups with visibility, interaction levels, and access settings
  - Output: `{ groups: [{id, name, automatic, user_count, vis, members_vis, mention, msg, public_admission, public_exit, allow_membership_requests}], meta: {total} }`
  - **Levels** (0-4): 0=public, 1=logged_on_users, 2=members, 3=staff, 4=owners
  - **Use case**: Resolve `gid` values from category permissions to group names, replicate group settings during migrations

- **shuiyuan://chat/channels**

  - List all public chat channels
  - Output: `{ channels: [{id, title, slug, status, members_count, description}], meta: {total} }`

- **shuiyuan://user/chat-channels**

  - List user's chat channels (public + DMs) with unread/mention counts
  - Output: `{ public_channels: [...], dm_channels: [...], meta: {total} }`
  - Requires authentication

- **shuiyuan://user/drafts**
  - List user's drafts
  - Output: `{ drafts: [{draft_key, sequence, title, category_id, created_at, reply_preview}], meta: {total} }`
  - Requires authentication

## Tools

Built‑in tools (always present unless noted). All tools return **strict JSON** (no Markdown).

Write tool confirmation contract (applies to all write tools below):

- Inputs additionally support: `preview?: boolean`, `confirm_send?: boolean`, `preview_token?: string`
- Default behavior is preview-only when `confirm_send` is not set to `true`
- Confirmed write responses include `preview_confirmed: true`

- `shuiyuan_search`
  - Input: `{ query: string; max_results?: number (1–50, default 10) }`
  - Output: `{ results: [{id, slug, title}], meta: {total, has_more} }`
- `shuiyuan_read_topic`
  - Input: `{ topic_id: number; post_limit?: number (1–50, default 5); start_post_number?: number }`
  - Output: `{ id, title, slug, category_id, tags, posts_count, posts: [{id, post_number, username, created_at, raw}], meta }`
- `shuiyuan_read_post`
  - Input: `{ post_id: number }`
  - Output: `{ id, topic_id, topic_slug, post_number, username, created_at, raw, truncated }`
- `shuiyuan_get_user`
  - Input: `{ username: string }`
  - Output: `{ id, username, name, trust_level, created_at, bio, admin, moderator }`
- `shuiyuan_list_user_posts`
  - Input: `{ username: string; page?: number (0-based); limit?: number (1–50, default 30) }`
  - Output: `{ posts: [{id, topic_id, post_number, slug, title, created_at, excerpt, category_id}], meta: {page, limit, has_more} }`
- `shuiyuan_filter_topics`
  - Input: `{ filter: string; page?: number; per_page?: number (1–50) }`
  - Output: `{ results: [{id, slug, title}], meta: {page, limit, has_more} }`
  - Query language (succinct): key:value tokens separated by spaces; category/categories (comma = OR, `=category` = without subcats, `-` prefix = exclude); tag/tags (comma = OR, `+` = AND) and tag_group; status:(open|closed|archived|listed|unlisted|public); personal `in:` (bookmarked|watching|tracking|muted|pinned); dates: created/activity/latest-post-(before|after) with `YYYY-MM-DD` or relative days `N`; numeric: likes[-op]-(min|max), posts-(min|max), posters-(min|max), views-(min|max); order: activity|created|latest-post|likes|likes-op|posters|title|views|category with optional `-asc`; free text terms are matched.
- `shuiyuan_get_chat_messages`
  - Input: `{ channel_id: number; page_size?: number (1–50, default 50); target_message_id?: number; direction?: "past" | "future"; target_date?: string (ISO 8601) }`
  - Output: `{ channel_id, messages: [{id, username, created_at, message, edited, thread_id, in_reply_to_id}], meta }`
- `shuiyuan_get_draft`
  - Input: `{ draft_key: string; sequence?: number }`
  - Output: `{ draft_key, sequence, found, data: {title, reply, category_id, tags, action} }`
- `shuiyuan_list_users` (requires admin API key)
  - Input: `{ query?: "active"|"new"|"staff"|"suspended"|"silenced"|"pending"|"staged"; filter?: string; order?: "created"|"last_emailed"|"seen"|"username"|"trust_level"|"days_visited"|"posts"; asc?: boolean; page?: number }`
  - Output: `{ users: [{id, username, name, email, avatar_template, trust_level, created_at, last_seen_at, admin, moderator, suspended, silenced}], meta: {page, has_more} }`
  - Note: Returns ~100 users per page (Discourse's fixed page size). `avatar_template` contains `{size}` placeholder - replace with pixel size (e.g., 120) to get avatar URL
- `shuiyuan_select_site` (hidden when `--site` is provided)
  - Input: `{ site: string }`
  - Output: `{ site, title }`

## Development

- **Requirements**: Node >= 24, `pnpm`.

- **Install / Build / Typecheck / Test**

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

- **Run locally (with source maps)**

```bash
pnpm build && pnpm dev
```

- **Project layout**

  - Server & CLI: `src/index.ts`
  - HTTP client: `src/http/client.ts`
  - Tool registry: `src/tools/registry.ts`
  - Resource registry: `src/resources/registry.ts`
  - Built‑in tools: `src/tools/builtin/*`
  - Remote tools: `src/tools/remote/tool_exec_api.ts`
  - JSON helpers: `src/util/json_response.ts`
  - Logging/redaction: `src/util/logger.ts`, `src/util/redact.ts`

- **Testing notes**

  - Tests run with Node’s test runner against compiled artifacts (`dist/test/**/*.js`). Ensure `pnpm build` before `pnpm test` if invoking scripts individually.

- **Publishing (optional)**

  - The package is published as `@shuiyuan/mcp` and exposes a `bin` named `discourse-mcp`. Prefer `npx @shuiyuan/mcp@latest` for frictionless usage.

- **Conventions**
  - All outputs are JSON-only for reliable programmatic parsing by agents.
  - Be careful with write operations; keep them opt‑in and rate‑limited.

See `AGENTS.md` for additional guidance on using this server from agent frameworks.

## Examples

### Shuiyuan (SJTU) Cookie Login

For Shuiyuan's jAccount SSO flow, use the Shuiyuan helpers. They open a browser window, wait for you to finish login, save the Discourse cookies under your user profile, and then let the MCP server reuse those cookies.

```powershell
# First-time login only
.\scripts\shuiyuan-login.ps1

# First-time login, then start the MCP stdio server
.\scripts\shuiyuan-login-and-start.ps1

# Later runs with the saved session (read-only server)
.\scripts\shuiyuan-mcp.ps1
```

The saved profile defaults to `%APPDATA%\shuiyuan-mcp\profile.json` and points to `%APPDATA%\shuiyuan-mcp\cookies.json`.

To build Windows `.exe` launchers for the same flow:

```powershell
.\scripts\build-shuiyuan-exe.ps1
.\dist-win\shuiyuan-mcp-login.exe
.\dist-win\shuiyuan-mcp.exe
```

### Shuiyuan (SJTU) User API Key Login

Instead of cookies, you can authenticate with a Shuiyuan User API Key (see [docs/shuiyuan-api-key.md](docs/shuiyuan-api-key.md)). The launcher generates an RSA key pair, opens the authorization page in your browser, decrypts the payload you paste back, and saves a profile that authenticates via the `User-Api-Key` header. Default scope is `read` (read-only).

```powershell
# First-time authorization only
.\scripts\shuiyuan-api-key-login.ps1

# Or the compiled entry
node .\dist\shuiyuan-api-key-login.js
```

This writes the same `%APPDATA%\shuiyuan-mcp\profile.json` (with `user_api_key` / `user_api_client_id` in `auth_pairs`), so `shuiyuan-mcp` starts with either cookie or API-key auth. Options: `--scopes`, `--client-id` (default `shuiyuan-mcp`), `--payload` (non-interactive), `--profile`. Re-authorizing with the same `client-id` revokes the previous key; you can also revoke any key from Shuiyuan 偏好设置 → 安全性.

This repo also includes Codex skills at `skills/shuiyuan-mcp/` and `skills/deepsearch/`. Copy them into your user skills directory if you want Codex to automatically follow the Shuiyuan MCP workflows and trigger deeper multi-pass research when you say `deepsearch`:

```powershell
Copy-Item .\skills\shuiyuan-mcp "$env:USERPROFILE\.codex\skills\shuiyuan-mcp" -Recurse -Force
Copy-Item .\skills\deepsearch "$env:USERPROFILE\.codex\skills\deepsearch" -Recurse -Force
```

### Quick Start with User API Key (No Admin Required)

```bash
# Step 1: Generate a User API Key
npx @shuiyuan/mcp@latest generate-user-api-key \
  --site https://discourse.example.com \
  --save-to profile.json

# Step 2: Visit the authorization URL shown, approve the request, and paste the payload

# Step 3: Run the MCP server with your new key (read-only server)
npx @shuiyuan/mcp@latest --profile profile.json
```

### Other Examples

- Read‑only session against `try.discourse.org`:

```bash
npx -y @shuiyuan/mcp@latest --log_level debug
# In client: call shuiyuan_select_site with {"site":"https://try.discourse.org"}
```

- Tether to a single site:

```bash
npx -y @shuiyuan/mcp@latest --site https://try.discourse.org
```

- Read-only session with a User API Key (no admin required):

```bash
npx -y @shuiyuan/mcp@latest --auth_pairs '[{"site":"https://try.discourse.org","user_api_key":"'$DISCOURSE_USER_API_KEY'"}]'
```

- Write tools (create/update post/topic, user-profile changes, uploads, draft mutations) were removed in this fork: the server is read-only.

- Run with HTTP transport (on port 3000):

```bash
npx -y @shuiyuan/mcp@latest --transport http --port 3000 --site https://try.discourse.org
# Server will start on http://localhost:3000
# Health check: http://localhost:3000/health
# MCP endpoint: http://localhost:3000/mcp
```

- Connect to a site behind HTTP Basic Auth:

```bash
npx -y @shuiyuan/mcp@latest --auth_pairs '[{"site":"https://protected.example.com","api_key":"'$DISCOURSE_API_KEY'","api_username":"system","http_basic_user":"username","http_basic_pass":"password"}]' --site https://protected.example.com
```

## Authentication

### Admin API Keys vs User API Keys

This MCP server supports two types of Discourse API authentication:

1. **Admin API Keys** (`api_key` + `api_username`)

   - Require admin/moderator permissions to generate
   - Created via Admin Panel → API → New API Key
   - Can perform all operations including user/category creation
   - Use headers: `Api-Key` and `Api-Username`

2. **User API Keys** (`user_api_key` + optional `user_api_client_id`)
   - Can be generated by any user (no admin required)
   - User-specific permissions and rate limits
   - Ideal for personal use and non-admin operations
   - Use headers: `User-Api-Key` and `User-Api-Client-Id`
   - Auto-expire after 180 days of inactivity (configurable per site)
   - Learn more: https://meta.discourse.org/t/user-api-keys-specification/48536

### Obtaining a User API Key

#### Easy Method: Built-in Generator (Recommended)

This package includes a convenient command to generate User API Keys:

```bash
# Interactive mode - follow the prompts
npx @shuiyuan/mcp@latest generate-user-api-key --site https://shuiyuan.sjtu.edu.cn

# Save directly to a profile file
npx @shuiyuan/mcp@latest generate-user-api-key --site https://shuiyuan.sjtu.edu.cn --save-to profile.json

# Specify custom scopes (default is read)
npx @shuiyuan/mcp@latest generate-user-api-key --site https://shuiyuan.sjtu.edu.cn --scopes "read,notifications"

# Get help
npx @shuiyuan/mcp@latest generate-user-api-key --help
```

The command will:

1. Generate an RSA key pair
2. Display an authorization URL for you to visit
3. Prompt you to paste the encrypted payload after authorization
4. Decrypt and display your User API Key
5. Optionally save it to a profile file

#### Manual Method

User API Keys require an OAuth-like flow documented at https://meta.discourse.org/t/user-api-keys-specification/48536. Key steps:

1. Generate a public/private key pair
2. Request authorization via `/user-api-key/new` with your public key, application name, client ID, and requested scopes
3. User approves the request (after login if needed)
4. Discourse returns an encrypted payload with the User API Key
5. Decrypt using your private key and use the key in your configuration

You can also manually create User API Keys via the Discourse UI (if enabled by the site):

- Visit your user preferences → Security → API
- Or use third-party tools that implement the User API Key flow

## FAQ

- **Why are write tools missing?** This fork is read-only by design: posting, editing, and user-profile write tools were removed.
- **Can I disable remote tool discovery?** Yes, run with `--tools_mode=discourse_api_only`.
- **Can I avoid exposing `shuiyuan_select_site`?** Yes, start with `--site <url>` to tether to a single site.
- **Time outs or rate limits?** Increase `--timeout_ms`, and note built‑in retry/backoff on 429/5xx.
- **Should I use Admin API Keys or User API Keys?** Use User API Keys for personal use (no admin required). Use Admin API Keys only when you need admin-level operations or are setting up a system-wide integration.
- **Getting "fetch failed" errors?** Run with `--log_level debug` to see detailed error information including:
  - The exact URL being requested
  - HTTP status codes and response bodies
  - Network-level errors (DNS, SSL/TLS, connectivity issues)
  - Retry attempts and timing
  - Timeout diagnostics
