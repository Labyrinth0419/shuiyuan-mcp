/**
 * Persistent search cache backed by SQLite + FTS5.
 *
 * Stores topic metadata and post content for offline/cached search.
 * Uses jieba for Chinese tokenization before FTS5 insertion.
 *
 * Cache directory: ~/.config/shuiyuan-mcp/cache/ (alongside profile)
 */

import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

// Lazy-load jieba (optional dependency)
let _jieba: any = null;
let _jiebaFailed = false;

async function loadJieba() {
  if (_jiebaFailed) return null;
  if (_jieba) return _jieba;
  try {
    _jieba = await import("@node-rs/jieba");
    return _jieba;
  } catch {
    _jiebaFailed = true;
    return null;
  }
}

/** Tokenize text for FTS5 insertion. Uses jieba when available, falls back to character unigrams + ASCII words. */
export async function tokenize(text: string): Promise<string> {
  if (!text) return "";
  const jieba = await loadJieba();
  if (jieba) {
    // jieba.cut returns string[]
    const words: string[] = jieba.cut(text, false);
    return words
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
      .join(" ");
  }
  // Fallback: split ASCII words and emit each CJK character as a token
  const tokens: string[] = [];
  const re = /[\u4e00-\u9fff\u3400-\u4dbf]|[a-zA-Z0-9]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push(m[0]);
  }
  return tokens.join(" ");
}

export interface CacheConfig {
  /** Base data directory (default: ~/.config/shuiyuan-mcp) */
  dataDir?: string;
}

export interface CachedTopic {
  id: number;
  title: string;
  slug: string;
  category_id: number | null;
  tags: string[];
  posts_count: number;
  excerpt: string;
  last_posted_at: string | null;
  cached_at: number; // Date.now()
}

export interface CachedPost {
  topic_id: number;
  post_number: number;
  username: string;
  raw: string;
  cooked: string;
  created_at: string;
}

export interface SearchResult {
  topic_id: number;
  title: string;
  slug: string;
  snippet: string;
  rank: number;
}

export class CacheManager {
  private db: Database.Database;
  private tokenizeStmt!: Database.Statement;
  private upsertTopicStmt!: Database.Statement;
  private insertPostStmt!: Database.Statement;
  private searchStmt!: Database.Statement;
  private getTopicStmt!: Database.Statement;
  private getPostsStmt!: Database.Statement;
  private topicExistsStmt!: Database.Statement;
  private statsStmt!: Database.Statement;

  constructor(config: CacheConfig = {}) {
    const dataDir = config.dataDir || join(homedir(), ".config", "shuiyuan-mcp");
    const cacheDir = join(dataDir, "cache");
    mkdirSync(cacheDir, { recursive: true });

    this.db = new Database(join(cacheDir, "search.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.initSchema();
    this.prepareStatements();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        category_id INTEGER,
        tags TEXT DEFAULT '[]',
        posts_count INTEGER DEFAULT 0,
        excerpt TEXT DEFAULT '',
        last_posted_at TEXT,
        cached_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS posts (
        topic_id INTEGER NOT NULL,
        post_number INTEGER NOT NULL,
        username TEXT DEFAULT '',
        raw TEXT DEFAULT '',
        cooked TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        PRIMARY KEY (topic_id, post_number),
        FOREIGN KEY (topic_id) REFERENCES topics(id)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS topics_fts USING fts5(
        title,
        excerpt,
        tags,
        content=topics,
        content_rowid=id,
        tokenize='unicode61'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS topics_ai AFTER INSERT ON topics BEGIN
        INSERT INTO topics_fts(rowid, title, excerpt, tags)
        VALUES (new.id, new.title, new.excerpt, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS topics_ad AFTER DELETE ON topics BEGIN
        INSERT INTO topics_fts(topics_fts, rowid, title, excerpt, tags)
        VALUES ('delete', old.id, old.title, old.excerpt, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS topics_au AFTER UPDATE ON topics BEGIN
        INSERT INTO topics_fts(topics_fts, rowid, title, excerpt, tags)
        VALUES ('delete', old.id, old.title, old.excerpt, old.tags);
        INSERT INTO topics_fts(rowid, title, excerpt, tags)
        VALUES (new.id, new.title, new.excerpt, new.tags);
      END;
    `);
  }

  private prepareStatements() {
    this.upsertTopicStmt = this.db.prepare(`
      INSERT INTO topics (id, title, slug, category_id, tags, posts_count, excerpt, last_posted_at, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, slug=excluded.slug, category_id=excluded.category_id,
        tags=excluded.tags, posts_count=excluded.posts_count, excerpt=excluded.excerpt,
        last_posted_at=excluded.last_posted_at, cached_at=excluded.cached_at
    `);

    this.insertPostStmt = this.db.prepare(`
      INSERT OR REPLACE INTO posts (topic_id, post_number, username, raw, cooked, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.searchStmt = this.db.prepare(`
      SELECT t.id, t.title, t.slug, snippet(topics_fts, 0, '<mark>', '</mark>', '...', 32) as snippet,
             rank
      FROM topics_fts
      JOIN topics t ON t.id = topics_fts.rowid
      WHERE topics_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    this.getTopicStmt = this.db.prepare(`
      SELECT * FROM topics WHERE id = ?
    `);

    this.getPostsStmt = this.db.prepare(`
      SELECT * FROM posts WHERE topic_id = ? ORDER BY post_number ASC
    `);

    this.topicExistsStmt = this.db.prepare(`
      SELECT id, cached_at FROM topics WHERE id = ?
    `);

    this.statsStmt = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM topics) as topic_count,
        (SELECT COUNT(*) FROM posts) as post_count,
        (SELECT MIN(cached_at) FROM topics) as oldest_cache,
        (SELECT MAX(cached_at) FROM topics) as newest_cache
    `);
  }

  /** Store a topic from API response */
  upsertTopic(topic: any) {
    const tags = Array.isArray(topic.tags) ? JSON.stringify(topic.tags) : "[]";
    const excerpt = topic.excerpt || topic.fancy_title || topic.title || "";
    this.upsertTopicStmt.run(
      topic.id,
      topic.title || "",
      topic.slug || String(topic.id),
      topic.category_id ?? null,
      tags,
      topic.posts_count ?? 0,
      excerpt,
      topic.last_posted_at || null,
      Date.now()
    );
  }

  /** Store multiple topics from search results */
  upsertTopics(topics: any[]) {
    const tx = this.db.transaction(() => {
      for (const t of topics) {
        this.upsertTopic(t);
      }
    });
    tx();
  }

  /** Store a post */
  insertPost(post: any, topicId: number) {
    this.insertPostStmt.run(
      topicId,
      post.post_number ?? 0,
      post.username || "",
      post.raw || "",
      post.cooked || "",
      post.created_at || ""
    );
  }

  /** Store multiple posts */
  insertPosts(posts: any[], topicId: number) {
    const tx = this.db.transaction(() => {
      for (const p of posts) {
        this.insertPost(p, topicId);
      }
    });
    tx();
  }

  /** Search the cache using tokenized query */
  search(query: string, limit: number = 20): SearchResult[] {
    const tokens = this.tokenizeQuery(query);
    if (!tokens) return [];
    try {
      return this.searchStmt.all(tokens, limit) as SearchResult[];
    } catch {
      return [];
    }
  }

  /** Get a cached topic */
  getTopic(id: number): CachedTopic | undefined {
    return this.getTopicStmt.get(id) as CachedTopic | undefined;
  }

  /** Get cached posts for a topic */
  getPosts(topicId: number): CachedPost[] {
    return this.getPostsStmt.all(topicId) as CachedPost[];
  }

  /** Check if a topic is cached */
  isTopicCached(id: number): boolean {
    return !!this.topicExistsStmt.get(id);
  }

  /** Get cache statistics */
  stats() {
    return this.statsStmt.get() as {
      topic_count: number;
      post_count: number;
      oldest_cache: number | null;
      newest_cache: number | null;
    };
  }

  /** Tokenize a search query for FTS5 MATCH */
  private tokenizeQuery(query: string): string {
    // For FTS5, we need to handle the query carefully
    // Simple approach: tokenize and join with OR for broader matching
    const words = query
      .split(/[\s,;]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (words.length === 0) return "";

    // Use AND for multi-word queries (all words must match)
    return words.map((w) => `"${w}"`).join(" OR ");
  }

  close() {
    this.db.close();
  }
}

// Singleton instance
let _instance: CacheManager | null = null;

export function getCacheManager(config?: CacheConfig): CacheManager {
  if (!_instance) {
    _instance = new CacheManager(config);
  }
  return _instance;
}

export function closeCache() {
  if (_instance) {
    _instance.close();
    _instance = null;
  }
}
