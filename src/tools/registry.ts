import type { Logger } from "../util/logger.js";
import type { SiteState } from "../site/state.js";
import type { ToolRegistrar } from "./types.js";
import { registerSearch } from "./builtin/search.js";
import { registerReadTopic } from "./builtin/read_topic.js";
import { registerReadPost } from "./builtin/read_post.js";
import { registerGetUser } from "./builtin/get_user.js";
import { registerFilterTopics } from "./builtin/filter_topics.js";
import { registerListUserPosts } from "./builtin/list_user_posts.js";
import { registerGetChatMessages } from "./builtin/get_chat_messages.js";
import {
  registerGetDraft,
} from "./builtin/drafts.js";
import { registerDownloadMedia } from "./builtin/download_media.js";
import { registerTopicMeta } from "./builtin/topic_meta.js";
import { registerUserCard } from "./builtin/user_card.js";

// Note: The following tools have been replaced by MCP Resources (v0.2.0):
// - shuiyuan_list_categories → shuiyuan://site/categories
// - shuiyuan_list_tags → shuiyuan://site/tags
// - shuiyuan_list_chat_channels → shuiyuan://chat/channels
// - shuiyuan_list_user_chat_channels → shuiyuan://user/chat-channels
// - shuiyuan_list_drafts → shuiyuan://user/drafts

// Note: Write tools (create/update post/topic/category, user management,
// upload, draft save/delete, Data Explorer query mutations) were removed
// in v0.3.0. This server is read-only by design.

export type ToolsMode = "auto" | "discourse_api_only" | "tool_exec_api";

export interface RegistryOptions {
  allowWrites: boolean;
  toolsMode: ToolsMode;
  // Optional default search prefix to add to all searches
  defaultSearchPrefix?: string;
  // Allowed directories for local file uploads (if empty/undefined, local uploads are disabled)
  allowedUploadPaths?: string[];
  // When true, include email addresses in user information
  showEmails?: boolean;
}

export async function registerAllTools(
  server: ToolRegistrar,
  siteState: SiteState,
  logger: Logger,
  opts: RegistryOptions & { maxReadLength?: number }
) {
  const ctx = { siteState, logger, defaultSearchPrefix: opts.defaultSearchPrefix, maxReadLength: opts.maxReadLength ?? 50000, allowedUploadPaths: opts.allowedUploadPaths } as const;

  // Search and filter tools (parameterized queries)
  registerSearch(server, ctx, { allowWrites: false });
  registerFilterTopics(server, ctx, { allowWrites: false });
  
  // Read tools (parameterized lookups)
  registerReadTopic(server, ctx, { allowWrites: false });
  registerReadPost(server, ctx, { allowWrites: false });
  registerGetUser(server, ctx, { allowWrites: false, showEmails: opts.showEmails });
  registerListUserPosts(server, ctx, { allowWrites: false });
  registerGetChatMessages(server, ctx, { allowWrites: false });
  registerGetDraft(server, ctx, { allowWrites: false });

  // Metadata and user tools
  registerTopicMeta(server, ctx, { allowWrites: false });
  registerUserCard(server, ctx, { allowWrites: false });

  // Media download tool (writes to local filesystem)
  registerDownloadMedia(server, ctx, { allowWrites: true });
}
