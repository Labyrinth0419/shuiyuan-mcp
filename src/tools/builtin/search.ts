import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError, paginatedResponse } from "../../util/json_response.js";
import { getCacheManager } from "../../cache/index.js";

export const registerSearch: RegisterFn = (server, ctx) => {
  const schema = z.object({
    query: z.string().min(1).describe("Search query"),
    max_results: z.number().int().min(1).max(50).optional(),
    page: z.number().int().min(1).optional().describe("Search result page number for pagination (default 1)"),
    cache: z
      .enum(["false", "true", "refresh"])
      .optional()
      .default("false")
      .describe(
        "Cache mode: false=live search (default, auto-populates cache), true=search local cache only (fast, offline), refresh=live search and return cache status"
      ),
  });

  server.registerTool(
    "shuiyuan_search",
    {
      title: "Search",
      description:
        "Search site content. Supports cached/offline search via local SQLite index. " +
        "Live search auto-populates the cache. Use cache='true' for fast offline search.",
      inputSchema: schema.shape,
    },
    async (args, _extra) => {
      const { query, max_results = 10, page, cache = "false" } = args;

      try {
        // Cache-only mode: search local SQLite
        if (cache === "true") {
          const cm = getCacheManager();
          const results = cm.search(query, max_results);
          const stats = cm.stats();
          return jsonResponse({
            results: results.map((r) => ({
              id: r.topic_id,
              slug: r.slug,
              title: r.title,
              snippet: r.snippet,
              rank: r.rank,
            })),
            meta: {
              total: results.length,
              source: "cache",
              cached_topics: stats.topic_count,
              cached_posts: stats.post_count,
            },
          });
        }

        // Live search (default or refresh)
        const { client } = ctx.siteState.ensureSelectedSite();
        const q = new URLSearchParams();
        q.set("expanded", "true");
        const fullQuery = ctx.defaultSearchPrefix
          ? `${ctx.defaultSearchPrefix} ${query}`
          : query;
        q.set("q", fullQuery);
        if (page && page > 1) q.set("page", String(page));

        const data = (await client.get(`/search.json?${q.toString()}`)) as any;
        const topics: any[] = data?.topics || [];

        // Auto-populate cache with search results
        const cm = getCacheManager();
        cm.upsertTopics(topics);

        const results = topics.slice(0, max_results).map((t) => ({
          id: t.id,
          slug: t.slug,
          title: t.title,
        }));

        const stats = cm.stats();
        return jsonResponse({
          results,
          meta: {
            total: results.length,
            has_more: topics.length > max_results,
            source: "live",
            cached_topics: stats.topic_count,
          },
        });
      } catch (e: any) {
        // If live search fails, try cache fallback
        if (cache !== "true") {
          try {
            const cm = getCacheManager();
            const results = cm.search(query, max_results);
            if (results.length > 0) {
              return jsonResponse({
                results: results.map((r) => ({
                  id: r.topic_id,
                  slug: r.slug,
                  title: r.title,
                  snippet: r.snippet,
                })),
                meta: {
                  total: results.length,
                  source: "cache_fallback",
                  error: e?.message,
                },
              });
            }
          } catch {
            // Cache also failed, fall through to error
          }
        }
        return jsonError(`Search failed: ${e?.message || String(e)}`);
      }
    }
  );
};
