# Shuiyuan MCP

[English](README_EN.md)

> **重要：使用水源前请先阅读 [水源规则](skills/shuiyuan-mcp/references/rules.md)。**

面向 [水源社区](https://shuiyuan.sjtu.edu.cn/) 的只读 MCP 服务器，基于 Discourse MCP fork。首次使用打开浏览器登录，之后复用本地保存的登录态。

## 功能

- 搜索、筛选、读取水源帖子和用户信息
- 查看草稿、聊天频道
- 并行下载帖子中的图片、附件、视频、音频
- 持久化搜索缓存（SQLite FTS5），服务器故障时自动降级
- 支持 cookie 登录（jAccount SSO）和 User API Key 登录
- **纯只读**：已移除所有发帖、编辑和用户资料修改功能

## 环境要求

- Node.js ≥ 24、pnpm/corepack
- Windows 构建 `.exe` 需要 .NET SDK
- Docker 部署需 Docker ≥ 20.10

```powershell
corepack pnpm install
corepack pnpm build
```

## 快速开始

### 1. 登录（二选一）

**Cookie 登录**（打开浏览器完成 jAccount SSO）：

```powershell
.\scripts\shuiyuan-login.ps1
```

**User API Key 登录**（无需浏览器反复登录，参考 [docs/shuiyuan-api-key.md](docs/shuiyuan-api-key.md)）：

```powershell
.\scripts\shuiyuan-api-key-login.ps1
```

两种方式都会写入 `%APPDATA%\shuiyuan-mcp\profile.json`。

### 2. 启动 MCP

```powershell
.\scripts\shuiyuan-mcp.ps1
```

### 3. MCP 客户端配置

**PowerShell 脚本方式**：

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

**Node 直接启动**：

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

## 工具

| 工具 | 用途 |
|------|------|
| `shuiyuan_search` | 全站搜索，支持 `cache: true` 离线搜索、`page` 分页 |
| `shuiyuan_filter_topics` | 按分类/标签/状态筛选帖子 |
| `shuiyuan_read_topic` | 读取帖子，`all: true` 全量读取 |
| `shuiyuan_read_post` | 读取单个回复 |
| `shuiyuan_get_user` | 获取用户资料 |
| `shuiyuan_list_user_posts` | 列出用户最近帖子 |
| `shuiyuan_get_chat_messages` | 获取聊天消息 |
| `shuiyuan_get_draft` | 获取草稿 |
| `shuiyuan_download_media` | 并行下载帖子中的图片/附件/视频/音频 |
| `shuiyuan_topic_meta` | 帖子元数据（热度、相关帖子、链接） |
| `shuiyuan_user_card` | 用户卡片（trust level、徽章、帖子参与度） |

## 资源

| URI | 用途 |
|-----|------|
| `shuiyuan://site/categories` | 分类列表 |
| `shuiyuan://site/tags` | 标签列表 |
| `shuiyuan://site/groups` | 用户组 |
| `shuiyuan://chat/channels` | 聊天频道 |
| `shuiyuan://user/chat-channels` | 用户聊天频道 |
| `shuiyuan://user/drafts` | 草稿列表 |

## Docker 部署

容器内已包含 better-sqlite3 编译环境和搜索缓存，适合服务端长期运行。

```bash
# 构建
docker build -t shuiyuan-mcp .

# 准备 profile（先在本地完成登录）
PROFILE="$env:APPDATA\shuiyuan-mcp\profile.json"

# stdio 模式（MCP 客户端连接）
docker run --rm -i \
  -v shuiyuan-data:/data \
  -v "$PROFILE":/data/profile.json:ro \
  shuiyuan-mcp

# HTTP 模式（远程访问）
docker run --rm -p 3765:3765 \
  -v shuiyuan-data:/data \
  -v "$PROFILE":/data/profile.json:ro \
  shuiyuan-mcp --transport http --port 3765
```

**docker-compose**：

```bash
cp "$env:APPDATA\shuiyuan-mcp\profile.json" .
docker compose up -d
```

**MCP 客户端连接 Docker**：

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

## Codex Skill

仓库内置两套 skill：

```powershell
Copy-Item .\skills\shuiyuan-mcp "$env:USERPROFILE\.codex\skills\shuiyuan-mcp" -Recurse -Force
Copy-Item .\skills\deepsearch "$env:USERPROFILE\.codex\skills\deepsearch" -Recurse -Force
```

- `shuiyuan-mcp`：指导 Codex 使用水源 MCP 只读工具
- `deepsearch`：关键词 `deepsearch` 触发多轮检索、交叉验证和证据综合

## 安全

- 不保存 jAccount 密码，只保存 cookie 或 User API Key
- `cookies.json` / `user_api_key` 等同登录态，请妥善保管
- 不要将 profile/cookie 文件提交到公开仓库

## 开发

```powershell
corepack pnpm install    # 安装依赖
corepack pnpm typecheck  # 类型检查
corepack pnpm build      # 编译
corepack pnpm lint       # 代码检查
corepack pnpm test       # 测试（需先 build）
```

项目结构：

| 路径 | 用途 |
|------|------|
| `src/index.ts` | MCP 入口 |
| `src/shuiyuan-login.ts` | 浏览器 cookie 登录 |
| `src/shuiyuan-mcp.ts` | 启动 MCP（复用 profile） |
| `src/shuiyuan-api-key-login.ts` | User API Key 登录 |
| `src/cache/` | SQLite FTS5 搜索缓存 |
| `src/http/client.ts` | HTTP 客户端 |
| `src/tools/builtin/` | 内置工具 |
| `src/resources/` | 资源注册 |
| `skills/` | Codex skills |

## 许可证

MIT。上游实现来自 [Discourse MCP](https://github.com/discourse/discourse-mcp)。

---

## 相对于上游 `@dajiaohuang/discourse-mcp` 的改动

在上游 Discourse MCP 基础上做了以下激进改动：

- **纯只读**：移除全部写工具（发帖、编辑、用户资料修改、草稿管理、Data Explorer）
- **品牌重命名**：所有 `discourse_*` 工具/资源/prompt 重命名为 `shuiyuan_*`，站点硬编码为 `https://shuiyuan.sjtu.edu.cn`
- **精简**：移除 select_site、admin-only 工具、Data Explorer 资源和 prompt，从 20+ 工具缩减到 9 个
- **新增能力**：User API Key 登录、媒体并行下载、SQLite FTS5 搜索缓存（支持离线搜索/读取）、deepsearch skill、Docker 部署
