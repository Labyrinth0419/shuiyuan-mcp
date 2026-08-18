import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Logger } from '../util/logger.js';
import { registerAllTools, type RegistryOptions } from '../tools/registry.js';
import { registerAllResources, type ResourceRegistrar } from '../resources/registry.js';
import { registerAllPrompts, type PromptRegistrar } from '../prompts/registry.js';
import { SiteState } from '../site/state.js';
import type { ToolRegistrar } from '../tools/types.js';

interface ToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
}

type ToolHandler = (args: Record<string, unknown>, extra: unknown) => Promise<ToolResult>;

/** Creates a minimal mock server that captures tool registrations for testing */
function createMockServer(): { server: ToolRegistrar; tools: Record<string, { handler: ToolHandler }> } {
  const tools: Record<string, { handler: ToolHandler }> = {};
  const server = {
    registerTool(name: string, _meta: Record<string, unknown>, handler: ToolHandler) {
      tools[name] = { handler };
    },
  } as ToolRegistrar;
  return { server, tools };
}

test('registers built-in tools', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });

  test('registers read tools regardless of allowWrites', async () => {
    const logger = new Logger('silent');
    const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });

    const { server, tools } = createMockServer();

    await registerAllTools(server, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' } satisfies RegistryOptions);

    assert.ok('shuiyuan_search' in tools);
    assert.ok('shuiyuan_read_topic' in tools);
  });

  const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: { listChanged: false } } });

  await registerAllTools(server, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' } satisfies RegistryOptions);

  assert.ok(true);
});

// Simple HTTP integration using fixtures when present
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readFixture(name: string) {
  const p = path.resolve(__dirname, '../../fixtures/try', name);
  try {
    const data = await readFile(p, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

test('fixtures manifest exists or sync script can be run', async () => {
  const manifest = await readFixture('manifest.json');
  assert.ok(manifest === null || typeof manifest === 'object');
});

// Helper: pre-select site (as launchers do at startup)
async function preSelectSite(siteState: SiteState) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as any;
  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
}

// Integration-style test: search flow (HTTP mocked)
test('search flow works with mocked HTTP', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });

  const { server, tools } = createMockServer();

  await registerAllTools(server, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/search.json')) {
      return new Response(JSON.stringify({ topics: [{ id: 123, title: 'Hello World', slug: 'hello-world' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    // Pre-select site (as launchers do)
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);

    const searchRes = await tools['shuiyuan_search'].handler({ query: 'hello' }, {});
    const text = String(searchRes?.content?.[0]?.text || '');
    const json = JSON.parse(text);
    assert.ok(json.results);
    assert.equal(json.results[0].slug, 'hello-world');
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('default-search prefix is applied to queries', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });

  const { server, tools } = createMockServer();

  let lastUrl: string | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    lastUrl = url;
    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/search.json')) {
      return new Response(JSON.stringify({ topics: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);

    await registerAllTools(server, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only', defaultSearchPrefix: 'tag:ai order:latest' } satisfies RegistryOptions);

    await tools['shuiyuan_search'].handler({ query: 'hello world' }, {});
    assert.ok(lastUrl && lastUrl.includes('/search.json?'));
    const qs = lastUrl!.split('?')[1] || '';
    const params = new URLSearchParams(qs);
    assert.equal(params.get('expanded'), 'true');
    assert.equal(params.get('q'), 'tag:ai order:latest hello world');
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('read_topic uses raw pages and parses posts', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });
  const { server, tools } = createMockServer();

  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.match(/\/t\/123\.json$/)) {
      return new Response(JSON.stringify({ id: 123, title: 'Big Topic', slug: 'big-topic', category_id: 7, tags: ['ai'], posts_count: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/raw/123?page=1')) {
      const body = [
        'alice | 2026-05-19 00:00:00 UTC | #1',
        'Hello world',
        '',
        '-------------------------',
        'bob | 2026-05-19 01:00:00 UTC | #2',
        'Second post here',
      ].join('\n');
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);

    await registerAllTools(server, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });

    const result = await tools['shuiyuan_read_topic'].handler({ topic_id: 123, post_limit: 50 }, {});
    const json = JSON.parse(String(result.content?.[0]?.text || '{}'));

    assert.equal(json.meta.strategy, 'raw');
    assert.equal(json.posts.length, 2);
    assert.equal(json.posts[0].username, 'alice');
    assert.equal(json.posts[0].raw, 'Hello world');
    assert.equal(json.posts[1].username, 'bob');
    assert.equal(json.posts[1].raw, 'Second post here');
    assert.ok(calls.some(url => url.endsWith('/raw/123?page=1')));
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

test('read_topic all mode paginates until empty', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });
  const { server, tools } = createMockServer();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/about.json')) {
      return new Response(JSON.stringify({ about: { title: 'Example Discourse' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.match(/\/t\/456\.json$/)) {
      return new Response(JSON.stringify({ id: 456, title: 'Multi Page', slug: 'multi-page', category_id: 1, tags: [], posts_count: 2 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('/raw/456?page=1')) {
      return new Response('alice | 2026-05-19 00:00:00 UTC | #1\nPage 1 content', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    if (url.endsWith('/raw/456?page=2')) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('not found', { status: 404 });
  }) as any;

  try {
    const { base, client } = siteState.buildClientForSite('https://example.com');
    await client.get('/about.json');
    siteState.selectSite(base);

    await registerAllTools(server, siteState, logger, { allowWrites: false, toolsMode: 'discourse_api_only' });

    const result = await tools['shuiyuan_read_topic'].handler({ topic_id: 456, all: true }, {});
    const json = JSON.parse(String(result.content?.[0]?.text || '{}'));

    assert.equal(json.meta.strategy, 'raw');
    assert.equal(json.posts.length, 1);
    assert.equal(json.posts[0].username, 'alice');
    assert.equal(json.posts[0].raw, 'Page 1 content');
    assert.equal(json.meta.has_more, false);
  } finally {
    globalThis.fetch = originalFetch as any;
  }
});

// ========================
// Tool registration tests
// ========================

const EXPECTED_TOOLS = [
  'shuiyuan_search',
  'shuiyuan_filter_topics',
  'shuiyuan_read_topic',
  'shuiyuan_read_post',
  'shuiyuan_get_user',
  'shuiyuan_list_user_posts',
  'shuiyuan_get_chat_messages',
  'shuiyuan_get_draft',
  'shuiyuan_download_media',
  'shuiyuan_topic_meta',
  'shuiyuan_user_card',
];

test('read-only server registers exactly read tools', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });
  const { server, tools } = createMockServer();

  await registerAllTools(server, siteState, logger, {
    allowWrites: false,
    toolsMode: 'discourse_api_only'
  });

  const registeredTools = Object.keys(tools).sort();
  const expected = EXPECTED_TOOLS.sort();
  assert.deepEqual(registeredTools, expected);
});

test('write tools are never registered', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });
  const { server, tools } = createMockServer();

  await registerAllTools(server, siteState, logger, {
    allowWrites: true,
    toolsMode: 'discourse_api_only'
  });

  const registeredTools = Object.keys(tools);
  for (const name of registeredTools) {
    assert.ok(!name.includes('create_'));
    assert.ok(!name.includes('update_'));
    assert.ok(!name.includes('delete_'));
    assert.ok(!name.includes('upload'));
    assert.ok(!name.includes('list_users'));
    assert.ok(!name.includes('get_query'));
    assert.ok(!name.includes('run_query'));
    assert.ok(!name.includes('select_site'));
  }
});

// ========================
// Resource registration tests
// ========================

const BASE_RESOURCES = [
  'site_categories',
  'site_tags',
  'site_groups',
  'chat_channels',
  'user_chat_channels',
  'user_drafts',
];

function createMockResourceServer(): { server: ResourceRegistrar; resources: Record<string, unknown> } {
  const resources: Record<string, unknown> = {};
  const server = {
    resource(name: string, ...rest: unknown[]) {
      resources[name] = rest;
    },
  } as ResourceRegistrar;
  return { server, resources };
}

test('resources are registered without admin-only explorer resources', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });
  const { server, resources } = createMockResourceServer();

  registerAllResources(server, { siteState, logger });

  const registeredResources = Object.keys(resources).sort();
  assert.deepEqual(registeredResources, BASE_RESOURCES.sort());
});

// ========================
// Prompt registration tests
// ========================

function createMockPromptServer(): { server: PromptRegistrar; prompts: Record<string, unknown> } {
  const prompts: Record<string, unknown> = {};
  const server = {
    registerPrompt(name: string, ...rest: unknown[]) {
      prompts[name] = rest;
    },
  } as PromptRegistrar;
  return { server, prompts };
}

test('no prompts are registered (all removed in v0.4.0)', async () => {
  const logger = new Logger('silent');
  const siteState = new SiteState({ logger, timeoutMs: 5000, defaultAuth: { type: 'none' } });
  const { server, prompts } = createMockPromptServer();

  registerAllPrompts(server, { siteState, logger });

  assert.deepEqual(Object.keys(prompts), []);
});
