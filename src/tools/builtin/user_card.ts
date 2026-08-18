import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError } from "../../util/json_response.js";

export const registerUserCard: RegisterFn = (server, ctx) => {
  server.registerTool(
    "shuiyuan_user_card",
    {
      title: "User Card",
      description: "Get user profile card: trust level, badges, and optionally their post count in a specific topic. Use this to assess user credibility during research.",
      inputSchema: z.object({
        username: z.string().min(1),
        topic_id: z.number().int().positive().optional().describe("If provided, includes this user's post count in the specified topic"),
      }).shape,
    },
    async ({ username, topic_id }) => {
      try {
        const { client } = ctx.siteState.ensureSelectedSite();
        const encoded = encodeURIComponent(username);
        const qs = topic_id ? `?include_post_count_for=${topic_id}` : "";
        const data = (await client.get(`/u/${encoded}/card.json${qs}`)) as any;

        const user = data.user || {};
        const badges = Array.isArray(data.badges)
          ? data.badges.map((b: any) => ({
              name: b.name,
              description: b.description,
              badge_type_id: b.badge_type_id,
              icon: b.icon,
            }))
          : [];

        return jsonResponse({
          username: user.username,
          name: user.name,
          trust_level: user.trust_level,
          admin: user.admin,
          moderator: user.moderator,
          title: user.title,
          posts_count: user.posts_count,
          topics_entered: user.topics_entered,
          days_visited: user.days_visited,
          time_read: user.time_read,
          created_at: user.created_at,
          last_seen_at: user.last_seen_at,
          topic_post_count: data.topic_post_count ?? null,
          badges,
          meta: { source: "live" },
        });
      } catch (e: any) {
        return jsonError(`Failed to get user card for ${username}: ${e?.message || String(e)}`);
      }
    }
  );
};
