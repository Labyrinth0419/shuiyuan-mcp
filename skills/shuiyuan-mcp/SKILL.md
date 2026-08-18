---
name: shuiyuan-mcp
description: "Use when working with Shuiyuan/SJTU Discourse through the `mcp__shuiyuan__` MCP tools: searching Shuiyuan, reading topics/posts, summarizing discussions, checking user posts, reading drafts/chat, or troubleshooting Shuiyuan MCP read access."
---

# Shuiyuan MCP

Use the `mcp__shuiyuan__` tool namespace whenever the user asks about Shuiyuan content. Prefer the MCP tools over raw HTTP when the needed tool is available.

This server is **read-only**: it exposes search/read tools only. There are no create/update/delete tools, so do not attempt to publish or edit Shuiyuan content through it.

## Quick Workflow

1. For search or research, call `mcp__shuiyuan__.discourse_search` or `mcp__shuiyuan__.discourse_filter_topics`.
2. For details, call `discourse_read_topic` or `discourse_read_post`; summarize from returned JSON only.
3. For user context, use `discourse_get_user`, `discourse_list_user_posts`, `discourse_get_draft`, or `discourse_get_chat_messages`.

## Tool Map

Read tools:

- `discourse_search`
- `discourse_filter_topics`
- `discourse_read_topic`
- `discourse_read_post`
- `discourse_get_user`
- `discourse_list_user_posts`
- `discourse_get_draft`
- `discourse_get_chat_messages`

Admin-gated read tools (access checked at call time):

- `discourse_list_users`
- `discourse_get_query`
- `discourse_run_query`

## Read Rules

- Respect Shuiyuan usage rules; read `references/rules.md` before automated bulk reading.
- Large topic reads automatically fall back to raw pages; do not request excessive `post_limit` unless needed.

## Encoding Guardrail

When using shell scripts or direct HTTP for Chinese content, avoid PowerShell `@'...'@ | node --input-type=module -` because it can mangle UTF-8. Prefer:

- Native MCP tool calls when available.
- A UTF-8 `.js` file executed with Node if a local script is needed.

Never print or paste real cookie values or API keys.
