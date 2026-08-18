import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError, paginatedResponse } from "../../util/json_response.js";

/**
 * List topics with a specific tag.
 *
 * GET /tag/{tag_name}/l/latest.json
 */
export const registerTagTopics: RegisterFn = (server, ctx) => {
  const schema = z.object({
    tag_name: z.string().min(1).describe("Tag name (from shuiyuan://site/tags resource)"),
    page: z.number().int().min(0).optional(),
  });

  server.registerTool(
    "shuiyuan_tag_topics",
    {
      title: "Tag Topics",
      description: "List topics with a specific tag. Returns JSON with topics array (id, title, slug, views, like_count, posts_count, last_posted_at) and meta (page, has_more).",
      inputSchema: schema.shape,
    },
    async ({ tag_name, page = 0 }, _extra) => {
      try {
        const { client } = ctx.siteState.ensureSelectedSite();
        const params = new URLSearchParams();
        if (page > 0) params.set("page", String(page));
        const qs = params.toString();
        const url = `/tag/${encodeURIComponent(tag_name)}/l/latest.json${qs ? "?" + qs : ""}`;
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
        return jsonError(`Failed to get topics for tag ${tag_name}: ${e?.message || String(e)}`);
      }
    }
  );
};
