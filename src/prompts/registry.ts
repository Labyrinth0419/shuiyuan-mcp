/**
 * MCP Prompts Registry
 *
 * All prompts have been removed (v0.4.0).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SiteState } from "../site/state.js";
import type { Logger } from "../util/logger.js";

/** Narrowed interface for prompt registration */
export type PromptRegistrar = Pick<McpServer, "registerPrompt">;

export interface PromptContext {
  siteState: SiteState;
  logger: Logger;
}

/**
 * Registers all MCP prompts.
 * Currently empty - all prompts were removed in v0.4.0.
 */
export function registerAllPrompts(
  _server: PromptRegistrar,
  _ctx: PromptContext
): void {
  // No prompts to register
}
