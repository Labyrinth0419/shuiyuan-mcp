# DeepSearch Skill

Use this skill when you need to thoroughly investigate topics on Shuiyuan (水源) — especially when the server may be slow, unstable, or you need to search across many topics.

## Core Concept: Persistent Cache

The MCP server maintains a **local SQLite cache** that automatically stores search results and topic content. This enables:

- **Offline search**: `shuiyuan_search` with `cache: "true"` searches the local index without hitting the server
- **Auto-population**: Every live search or read automatically updates the cache
- **Graceful degradation**: If the server is down, cached data is still available

## When to Use Cache

| Scenario | Cache Mode | Why |
|----------|-----------|-----|
| Quick lookup, server is up | `cache: "false"` (default) | Fresh results |
| Deep investigation, many searches | `cache: "false"` first, then `cache: "true"` | Populate then reuse |
| Server is slow/down | `cache: "true"` | Offline fallback |
| Verifying if cached data exists | `cache: "true"` | Check local state |
| Research across many topics | Mix of live + cached | Progressive caching |

## Workflow: DeepSearch

### Step 1: Seed the Cache
```
shuiyuan_search(query="关键词", cache="false")
```
Live search auto-populates the cache with matching topics.

### Step 2: Read and Cache Topics
```
shuiyuan_read_topic(topic_id=12345, cache="false")
```
Reading a topic also caches its posts for later offline access.

### Step 3: Offline Exploration
```
shuiyuan_search(query="关键词", cache="true")
shuiyuan_read_topic(topic_id=12345, cache="true")
```
Use cached data for fast, offline exploration.

### Step 4: Fill Gaps
If the cache doesn't have what you need, do another live search to populate more topics.

## Cache Indicators in Responses

Every search/read response includes:
- `source`: `"live"` | `"cache"` | `"cache_fallback"` — where the data came from
- `cached_topics`: total topics in the local cache
- `cached_posts`: total posts in the local cache (read responses only)

## Tips

1. **Progressive caching**: Start with live searches to build the cache, then switch to cached mode for speed
2. **Offline resilience**: If the server returns errors, retry with `cache: "true"` — cached data survives server outages
3. **Deep research pattern**: Search live → read each interesting topic live → then explore offline with cached mode
4. **No manual refresh needed**: Every live operation updates the cache automatically

## Example: Research a Technical Topic

```
# 1. Broad search (populates cache)
shuiyuan_search(query="MCP server 开发", cache="false")

# 2. Read interesting topics (also caches them)
shuiyuan_read_topic(topic_id=12345, cache="false")
shuiyuan_read_topic(topic_id=67890, cache="false")

# 3. Now search locally for related content
shuiyuan_search(query="MCP protocol", cache="true")

# 4. Re-read cached topics offline
shuiyuan_read_topic(topic_id=12345, cache="true", start_post_number=5)
```
