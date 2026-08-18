import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError } from "../../util/json_response.js";

export const registerTopicMeta: RegisterFn = (server, ctx) => {
  server.registerTool(
    "shuiyuan_topic_meta",
    {
      title: "Topic Metadata",
      description: "Get topic metadata without reading posts: title, stats (views, likes, posts_count), related topics, and link counts. Use this to decide whether to fully read a topic.",
      inputSchema: z.object({
        topic_id: z.number().int().positive(),
      }).shape,
    },
    async ({ topic_id }) => {
      try {
        const { client } = ctx.siteState.ensureSelectedSite();
        const data = (await client.get(`/t/${topic_id}.json`)) as any;

        const related = Array.isArray(data.related_topics)
          ? data.related_topics.map((t: any) => ({
              id: t.id,
              title: t.title,
              slug: t.slug,
              posts_count: t.posts_count,
              views: t.views,
              like_count: t.like_count,
            }))
          : [];

        // Collect link_counts from first post if available
        const firstPost = data?.post_stream?.posts?.[0];
        const links = Array.isArray(firstPost?.link_counts)
          ? firstPost.link_counts.map((l: any) => ({
              url: l.url,
              title: l.title,
              internal: l.internal,
              clicks: l.clicks,
            }))
          : [];

        return jsonResponse({
          id: data.id,
          title: data.title,
          slug: data.slug,
          category_id: data.category_id,
          tags: Array.isArray(data.tags) ? data.tags : [],
          posts_count: data.posts_count,
          views: data.views,
          like_count: data.like_count,
          reply_count: data.reply_count,
          created_at: data.created_at,
          last_posted_at: data.last_posted_at,
          word_count: data.word_count,
          participant_count: data.participant_count,
          related_topics: related,
          links,
          meta: { source: "live" },
        });
      } catch (e: any) {
        return jsonError(`Failed to get topic meta ${topic_id}: ${e?.message || String(e)}`);
      }
    }
  );
};
