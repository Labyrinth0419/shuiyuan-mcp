import { z } from "zod";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError } from "../../util/json_response.js";

/**
 * Shuiyuan Draft Tools (read-only)
 *
 * Drafts in Discourse use a key-based system:
 * - "new_topic" - Draft for creating a new topic
 * - "topic_<id>" - Draft for replying to topic with ID <id>
 * - "new_private_message" - Draft for a new private message
 *
 * The draft data is stored as a JSON object containing:
 * - reply: The draft text content
 * - title: Topic title (for new topics)
 * - categoryId: Category ID
 * - tags: Array of tag names
 * - action: "createTopic", "reply", "edit", etc.
 *
 * Drafts use a sequence number for optimistic locking. When updating
 * a draft, you should use the sequence returned from listing/getting drafts.
 */

/**
 * Get a specific draft by key
 */
export const registerGetDraft: RegisterFn = (server, ctx, _opts) => {
  const schema = z.object({
    draft_key: z
      .string()
      .min(1)
      .max(40)
      .describe('Draft key (e.g., "new_topic", "topic_123", "new_private_message")'),
    sequence: z.number().int().min(0).optional().describe("Expected sequence number (optional)"),
  });

  server.registerTool(
    "shuiyuan_get_draft",
    {
      title: "Get Draft",
      description:
        'Retrieve a specific draft by key. Returns JSON with draft_key, sequence, and parsed data (title, reply, categoryId, tags, action).',
      inputSchema: schema.shape,
    },
    async (input: unknown, _extra: unknown) => {
      const { draft_key, sequence } = schema.parse(input);

      try {
        const { client } = ctx.siteState.ensureSelectedSite();
        const params = new URLSearchParams();
        if (typeof sequence === "number") params.set("sequence", String(sequence));

        const url = `/drafts/${encodeURIComponent(draft_key)}.json${params.toString() ? `?${params}` : ""}`;
        const data = (await client.get(url)) as {
          draft?: string;
          draft_sequence?: number;
        };

        if (!data?.draft) {
          return jsonResponse({ draft_key, found: false });
        }

        let parsedData: Record<string, unknown> = {};
        try {
          parsedData = JSON.parse(data.draft);
        } catch {
          parsedData = { raw: data.draft };
        }

        return jsonResponse({
          draft_key,
          sequence: data.draft_sequence ?? null,
          found: true,
          data: {
            title: parsedData.title || null,
            reply: parsedData.reply || null,
            category_id: parsedData.categoryId || null,
            tags: Array.isArray(parsedData.tags) ? parsedData.tags : [],
            action: parsedData.action || null,
          },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonError(`Failed to get draft: ${msg}`);
      }
    }
  );
};
