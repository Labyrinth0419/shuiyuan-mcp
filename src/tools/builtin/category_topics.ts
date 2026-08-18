import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError, paginatedResponse } from "../../util/json_response.js";

/**
 * List topics in a category.
 *
 * GET /c/{category_id}.json
 */
export const registerCategoryTopics: RegisterFn = (server, ctx) => {
  const schema = z.object({
    category_id: z.number().int().positive().describe("Category ID (from shuiyuan://site/categories resource)"),
    page: z.number().int().min(0).optional(),
    order: z.enum(["latest", "views", "views_week", "likes", "latest_topic"]).optional()
      .describe("Sort order (default: latest)"),
  });

  server.registerTool(
    "shuiyuan_category_topics",
    {
      title: "Category Topics",
      description: "List topics in a specific category. Returns JSON with topics array (id, title, slug, views, like_count, posts_count, last_posted_at) and meta (page, has_more).",
      inputSchema: schema.shape,
    },
    async ({ category_id, page = 0, order }, _extra) => {
      try {
        const { client } = ctx.siteState.ensureSelectedSite();
        const params = new URLSearchParams();
        if (page > 0) params.set("page", String(page));
        if (order) params.set("order", order);
        const qs = params.toString();
        const url = `/c/${category_id}.json${qs ? "?" + qs : ""}`;
        const data = (await client.get(url)) as any;
        const topics = (data?.topic_list?.topics || []).map((t: any) => ({
          id: t.id,
          title: t.title,
          slug: t.slug,
          views: t.views,
          like_count: t.like_count,
          posts_count: t.posts_count,
          reply_count: t.reply_count,
          last_posted_at: t.last_posted_at,
          bumped_at: t.bumped_at,
          posters: t.posters?.length,
        }));
        return jsonResponse(paginatedResponse("topics", topics, {
          page,
          limit: data?.topic_list?.per_page || 30,
          has_more: topics.length >= (data?.topic_list?.per_page || 30),
        }));
      } catch (e: any) {
        return jsonError(`Failed to get topics for category ${category_id}: ${e?.message || String(e)}`);
      }
    }
  );
};
