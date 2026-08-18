import type { Logger } from "../util/logger.js";
import type { SiteState } from "../site/state.js";
import type { ToolRegistrar } from "./types.js";
import { registerSearch } from "./builtin/search.js";
import { registerReadTopic } from "./builtin/read_topic.js";
import { registerReadPost } from "./builtin/read_post.js";
import { registerGetUser } from "./builtin/get_user.js";
import { registerSelectSite } from "./builtin/select_site.js";
import { registerFilterTopics } from "./builtin/filter_topics.js";
import { registerListUserPosts } from "./builtin/list_user_posts.js";
import { registerListUsers } from "./builtin/list_users.js";
import { registerGetChatMessages } from "./builtin/get_chat_messages.js";
import {
  registerGetDraft,
} from "./builtin/drafts.js";
import {
  registerGetQuery,
  registerRunQuery,
} from "./builtin/data_explorer/index.js";

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
  // When true, do not register the shuiyuan_select_site tool
  hideSelectSite?: boolean;
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

  // Built-in tools (actions and parameterized queries)
  if (!opts.hideSelectSite) {
    registerSelectSite(server, ctx, { allowWrites: false, toolsMode: opts.toolsMode });
  }
  
  // Search and filter tools (parameterized queries)
  registerSearch(server, ctx, { allowWrites: false });
  registerFilterTopics(server, ctx, { allowWrites: false });
  
  // Read tools (parameterized lookups)
  registerReadTopic(server, ctx, { allowWrites: false });
  registerReadPost(server, ctx, { allowWrites: false });
  registerGetUser(server, ctx, { allowWrites: false, showEmails: opts.showEmails });
  registerListUserPosts(server, ctx, { allowWrites: false });
  registerListUsers(server, ctx, { allowWrites: false, showEmails: opts.showEmails });
  registerGetChatMessages(server, ctx, { allowWrites: false });
  registerGetDraft(server, ctx, { allowWrites: false });

  // Data Explorer tools (read-only; admin access checked at call time)
  registerGetQuery(server, ctx, { allowWrites: false });
  registerRunQuery(server, ctx, { allowWrites: false });
}
