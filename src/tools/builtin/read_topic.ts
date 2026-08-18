import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError } from "../../util/json_response.js";
import { getCacheManager } from "../../cache/index.js";

export const registerReadTopic: RegisterFn = (server, ctx) => {
  const RAW_POSTS_PER_PAGE = 100;
  const DEFAULT_LIMIT = 5;
  const MAX_LIMIT = 50;
  const SAFETY_CAP = 500; // max posts in all mode without explicit override
  const CACHE_TTL_MS = 10000;

  const schema = z.object({
    topic_id: z.number().int().positive(),
    all: z.boolean().optional().describe("Read all posts in the topic (paginated via /raw/). Overrides post_limit."),
    post_limit: z.number().int().min(1).max(500).optional().describe("Max posts to return (default 5). In all mode, acts as a safety cap (max 500)."),
    start_post_number: z.number().int().min(1).optional().describe("Start from this post number (1-based)"),
    cache: z
      .enum(["false", "true"])
      .optional()
      .default("false")
      .describe("Cache mode: false=live read (default, auto-populates cache), true=read from local cache only (offline)")
  });

  server.registerTool(
    "shuiyuan_read_topic",
    {
      title: "Read Topic",
      description: "Read topic posts as markdown. Use all=true to read every post (best for deep research). Use cache=true for offline reads. Live reads auto-populate the local cache.",
      inputSchema: schema.shape,
    },
    async ({ topic_id, all, post_limit, start_post_number, cache = "false" }, _extra) => {
      try {
        const cm = getCacheManager();
        const readAll = all === true;
        const limit = readAll
          ? Math.min(post_limit ?? SAFETY_CAP, SAFETY_CAP)
          : (post_limit ?? DEFAULT_LIMIT);

        // ── Cache-only mode ──────────────────────────────────────
        if (cache === "true") {
          const cached = cm.getTopic(topic_id);
          if (!cached) {
            return jsonResponse({
              id: topic_id,
              cached: false,
              meta: { message: "Topic not in cache. Use cache='false' to fetch from server." },
            });
          }
          const allPosts = cm.getPosts(topic_id);
          const start = start_post_number ?? 1;
          const posts = allPosts
            .filter((p) => p.post_number >= start)
            .slice(0, limit)
            .map((p) => ({
              post_number: p.post_number,
              username: p.username,
              created_at: p.created_at,
              raw: p.raw,
            }));
          return jsonResponse({
            id: topic_id,
            title: cached.title,
            slug: cached.slug,
            category_id: cached.category_id,
            tags: cached.tags,
            posts_count: cached.posts_count,
            posts,
            meta: {
              source: "cache",
              start_post: start,
              returned: posts.length,
              has_more: cached.posts_count > start + posts.length - 1,
            },
          });
        }

        // ── Live read ───────────────────────────────────────────
        const { client } = ctx.siteState.ensureSelectedSite();
        const start = start_post_number ?? 1;
        const startPage = Math.floor((start - 1) / RAW_POSTS_PER_PAGE) + 1;

        // 1) Fetch topic metadata once (for title, slug, category, etc.)
        const topicData = (await client.getCached(`/t/${topic_id}.json`, CACHE_TTL_MS)) as any;
        cm.upsertTopic(topicData);

        const postsCount = Number(topicData?.posts_count || 0);

        // 2) Paginate via /raw/ endpoint
        const rawPages: Array<{ page: number; raw: string; truncated: boolean }> = [];
        const collectedPosts: Array<{
          post_number: number;
          username: string;
          created_at: string;
          raw: string;
        }> = [];
        let remaining = limit;
        let emptyPageCount = 0;
        let reachedEnd = false;

        for (let page = startPage; remaining > 0; page++) {
          let rawText: string;
          try {
            rawText = String(await client.getCached(`/raw/${topic_id}?page=${page}`, CACHE_TTL_MS));
          } catch {
            // /raw/ returns 404 or empty when page exceeds total
            break;
          }

          if (!rawText || rawText.trim().length === 0) {
            emptyPageCount++;
            if (emptyPageCount >= 2) break; // two consecutive empty pages = end of topic
            continue;
          }
          emptyPageCount = 0;

          // Parse raw text: each post is separated by "-------------------------"
          // Header format: "Username | YYYY-MM-DD HH:MM:SS UTC | #N"
          const blocks = rawText.split(/^-------------------------$/m);

          for (const block of blocks) {
            if (remaining <= 0) break;

            // Match header at the start of the block (may have leading whitespace)
            const trimmed = block.trimStart();
            const headerMatch = trimmed.match(/^(.+?)\s*\|\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+UTC\s*\|\s*#(\d+)/);
            if (!headerMatch) continue;

            const [, username, createdAt, postNumStr] = headerMatch;
            const postNumber = parseInt(postNumStr, 10);
            // Body starts after the header line (header + newline) in the trimmed string
            const headerEnd = trimmed.indexOf('\n', headerMatch.index);
            const body = headerEnd >= 0 ? trimmed.slice(headerEnd + 1).trim() : '';

            // Skip posts before start
            if (postNumber < start) continue;

            collectedPosts.push({
              post_number: postNumber,
              username: username.trim(),
              created_at: createdAt,
              raw: body,
            });
            remaining--;
          }

          // If we got fewer posts than the page size, we've reached the end of the topic
          const postsInPage = blocks.filter((b) => b.trim().match(/\|\s*#\d+/)).length;
          if (postsInPage === 0 || postsInPage < RAW_POSTS_PER_PAGE) {
            reachedEnd = true;
            break;
          }
        }

        // Cache each post
        for (const p of collectedPosts) {
          cm.insertPost(
            { id: p.post_number, post_number: p.post_number, username: p.username, created_at: p.created_at, raw: p.raw, cooked: "" },
            topic_id,
          );
        }

        const returned = collectedPosts.length;
        const lastPostNumber = returned > 0 ? collectedPosts[returned - 1].post_number : start - 1;

        return jsonResponse({
          id: topic_id,
          title: topicData?.title || `Topic ${topic_id}`,
          slug: topicData?.slug || String(topic_id),
          category_id: topicData?.category_id || null,
          tags: Array.isArray(topicData?.tags) ? topicData.tags : [],
          posts_count: postsCount,
          posts: collectedPosts,
          meta: {
            source: "live",
            strategy: "raw",
            start_post: start,
            returned,
            posts_per_page: RAW_POSTS_PER_PAGE,
            has_more: !reachedEnd && remaining <= 0,
            truncated: remaining <= 0 && postsCount > lastPostNumber,
          },
        });
      } catch (e: any) {
        return jsonError(`Failed to read topic ${topic_id}: ${e?.message || String(e)}`);
      }
    }
  );
};
