import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError } from "../../util/json_response.js";

/**
 * Get direct replies to a post.
 *
 * GET /posts/{post_id}/replies
 */
export const registerPostReplies: RegisterFn = (server, ctx) => {
  const schema = z.object({
    post_id: z.number().int().positive(),
  });

  server.registerTool(
    "shuiyuan_post_replies",
    {
      title: "Post Replies",
      description: "Get direct replies to a specific post. Returns JSON array of reply posts (id, post_number, username, created_at, raw content, reply_to_post_number).",
      inputSchema: schema.shape,
    },
    async ({ post_id }, _extra) => {
      try {
        const { client } = ctx.siteState.ensureSelectedSite();
        const data = (await client.get(`/posts/${post_id}/replies`)) as any;

        // API returns an array directly or an object with numeric keys
        const replies = Array.isArray(data) ? data : Object.values(data);
        const limit = Number.isFinite(ctx.maxReadLength) ? ctx.maxReadLength : 50000;
        const result = replies.map((r: any) => ({
          id: r.id,
          post_number: r.post_number,
          username: r.username,
          created_at: r.created_at,
          reply_to_post_number: r.reply_to_post_number,
          raw: (r.raw || "").slice(0, limit),
          topic_id: r.topic_id,
        }));
        return jsonResponse({ post_id, reply_count: result.length, replies: result });
      } catch (e: any) {
        return jsonError(`Failed to get replies for post ${post_id}: ${e?.message || String(e)}`);
      }
    }
  );
};
