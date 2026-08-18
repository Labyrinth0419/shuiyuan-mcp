import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RegisterFn } from "../types.js";
import { jsonResponse, jsonError } from "../../util/json_response.js";

const BASE = "https://shuiyuan.sjtu.edu.cn/";

// Concurrency limit for parallel downloads
const CONCURRENCY = 5;

type MediaItem = {
  url: string;
  filename: string;
  type: "image" | "attachment" | "video" | "audio";
};

/**
 * Extract media items from a post's cooked HTML.
 * For images/attachments/videos, we also need the raw markdown to get the
 * correct filename (sha1-based). We extract what we can from cooked alone
 * and pair with raw when available.
 */
function extractMediaFromCooked(cooked: string): MediaItem[] {
  const items: MediaItem[] = [];

  // Images: <img src="URL" ... data-base62-sha1="NAME">
  const imgPattern = /<img\s+src="([^"]+)"[^>]*?data-base62-sha1="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = imgPattern.exec(cooked)) !== null) {
    const src = m[1].startsWith("http") ? m[1] : BASE + m[1].replace(/^\//, "");
    // Extract real extension from URL
    const extMatch = src.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : "bin";
    items.push({ url: src, filename: `${m[2]}.${ext}`, type: "image" });
  }

  // Attachments: <a class="attachment" href="URL">
  const attPattern = /class="attachment"\s+href="([^"]+)"/g;
  while ((m = attPattern.exec(cooked)) !== null) {
    const src = m[1].startsWith("http") ? m[1] : BASE + m[1].replace(/^\//, "");
    const filename = decodeURIComponent(src.split("/").pop() || "attachment");
    items.push({ url: src, filename, type: "attachment" });
  }

  // Videos: <div class="video-placeholder-container" data-video-src="URL">
  const vidPattern = /data-video-src="([^"]+)"/g;
  while ((m = vidPattern.exec(cooked)) !== null) {
    const src = m[1].startsWith("http") ? m[1] : BASE + m[1].replace(/^\//, "");
    const extMatch = src.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : "mp4";
    // Filename will be enriched from raw markdown if available
    items.push({ url: src, filename: `video.${ext}`, type: "video" });
  }

  // Audio: <audio><source src="URL">
  const audPattern = /<source\s+src="([^"]+)"/g;
  while ((m = audPattern.exec(cooked)) !== null) {
    const src = m[1].startsWith("http") ? m[1] : BASE + m[1].replace(/^\//, "");
    const extMatch = src.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : "mp3";
    items.push({ url: src, filename: `audio.${ext}`, type: "audio" });
  }

  return items;
}

/**
 * Enrich filenames from raw markdown when possible.
 * Raw patterns: upload://HASH.EXT with suffixes |attachment, |video, |audio
 */
function enrichFromRaw(raw: string, items: MediaItem[]): void {
  // Image: ![...](upload://HASH.EXT)
  const rawImgPattern = /!\[[^\]]*]\(upload:\/\/([a-zA-Z0-9]+\.[a-zA-Z0-9]+)\)/g;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = rawImgPattern.exec(raw)) !== null) {
    const imgs = items.filter((i) => i.type === "image");
    if (idx < imgs.length) {
      imgs[idx].filename = m[1];
    }
    idx++;
  }

  // Attachment: [...|attachment](upload://HASH.EXT)
  const rawAttPattern = /\[[^\]]*?(\|attachment)?\]\(upload:\/\/([a-zA-Z0-9]+\.[a-zA-Z0-9]+)\)/g;
  idx = 0;
  while ((m = rawAttPattern.exec(raw)) !== null) {
    const atts = items.filter((i) => i.type === "attachment");
    if (idx < atts.length) {
      atts[idx].filename = m[2];
    }
    idx++;
  }

  // Video: [...|video](upload://HASH.EXT)
  const rawVidPattern = /\[[^\]]*?\|video\]\(upload:\/\/([a-zA-Z0-9]+\.[a-zA-Z0-9]+)\)/g;
  idx = 0;
  while ((m = rawVidPattern.exec(raw)) !== null) {
    const vids = items.filter((i) => i.type === "video");
    if (idx < vids.length) {
      vids[idx].filename = m[1];
    }
    idx++;
  }

  // Audio: [...|audio](upload://HASH.EXT)
  const rawAudPattern = /\[[^\]]*?\|audio\]\(upload:\/\/([a-zA-Z0-9]+\.[a-zA-Z0-9]+)\)/g;
  idx = 0;
  while ((m = rawAudPattern.exec(raw)) !== null) {
    const auds = items.filter((i) => i.type === "audio");
    if (idx < auds.length) {
      auds[idx].filename = m[1];
    }
    idx++;
  }
}

async function downloadBatch(
  client: { downloadBinary: (path: string) => Promise<Uint8Array> },
  items: MediaItem[],
  concurrency: number
): Promise<Array<{ item: MediaItem; data?: Uint8Array; ok: boolean; error?: string }>> {
  const results: Array<{ item: MediaItem; data?: Uint8Array; ok: boolean; error?: string }> = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (item) => {
        const path = new URL(item.url).pathname;
        const data = await client.downloadBinary(path);
        return { item, data };
      })
    );
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === "fulfilled") {
        results.push({ item: r.value.item, data: r.value.data, ok: true });
      } else {
        results.push({ item: batch[j], ok: false, error: r.reason?.message });
      }
    }
  }
  return results;
}

export const registerDownloadMedia: RegisterFn = (server, ctx) => {
  const schema = z.object({
    topic_id: z.number().int().positive().describe("Topic ID to download media from"),
    output_dir: z.string().describe("Local directory to save media files (relative or absolute)"),
    start_post_number: z.number().int().min(1).optional().describe("Start from this post number (1-based)"),
    max_posts: z.number().int().min(1).max(500).optional().default(200).describe("Max posts to scan for media (default 200)"),
    concurrency: z.number().int().min(1).max(20).optional().default(CONCURRENCY).describe("Parallel download concurrency (default 5)"),
  });

  server.registerTool(
    "shuiyuan_download_media",
    {
      title: "Download Media",
      description: "Download all images, attachments, videos, and audio from a topic. Saves files to a local directory. Returns a manifest of downloaded files.",
      inputSchema: schema.shape,
    },
    async ({ topic_id, output_dir, start_post_number, max_posts = 200, concurrency = CONCURRENCY }, _extra) => {
      try {
        const { client } = ctx.siteState.ensureSelectedSite();
        const absDir = resolve(output_dir);
        await mkdir(absDir, { recursive: true });

        // Fetch topic metadata
        const topicData = (await client.get(`/t/${topic_id}.json`)) as any;
        const postsCount = Number(topicData?.posts_count || 0);
        const title = topicData?.title || `Topic ${topic_id}`;

        // Determine page range
        const RAW_POSTS_PER_PAGE = 100;
        const start = start_post_number ?? 1;
        const endPost = Math.min(start + max_posts - 1, postsCount || start + max_posts - 1);
        const startPage = Math.floor((start - 1) / RAW_POSTS_PER_PAGE) + 1;
        const endPage = Math.floor((endPost - 1) / RAW_POSTS_PER_PAGE) + 1;

        // Collect all media items across pages
        const allItems: MediaItem[] = [];
        const seen = new Set<string>();

        for (let page = startPage; page <= endPage; page++) {
          // Fetch cooked content via topic JSON pages
          const pageUrl = page === 1
            ? `/t/${topic_id}.json?include_raw=true`
            : `/t/${topic_id}.json?page=${page}&include_raw=true`;
          const data = (await client.get(pageUrl)) as any;
          const posts: any[] = data?.post_stream?.posts || [];

          for (const post of posts) {
            const cooked = post?.cooked || "";
            const raw = post?.raw || "";
            const items = extractMediaFromCooked(cooked);
            if (raw) enrichFromRaw(raw, items);

            for (const item of items) {
              if (!seen.has(item.url)) {
                seen.add(item.url);
                allItems.push(item);
              }
            }
          }
        }

        if (allItems.length === 0) {
          return jsonResponse({
            topic_id,
            title,
            output_dir: absDir,
            total: 0,
            downloaded: 0,
            failed: 0,
            files: [],
            meta: { message: "No media found in scanned posts" },
          });
        }

        // Download in parallel batches
        const results = await downloadBatch(
          { downloadBinary: (p) => client.downloadBinary(p) },
          allItems,
          concurrency
        );

        // Write files
        const manifest: Array<{ url: string; filename: string; type: string; local_path: string; ok: boolean }> = [];
        let downloaded = 0;
        let failed = 0;

        for (const r of results) {
          const localPath = join(absDir, r.item.filename);
          if (r.ok && r.data) {
            await writeFile(localPath, r.data);
            downloaded++;
            manifest.push({ url: r.item.url, filename: r.item.filename, type: r.item.type, local_path: localPath, ok: true });
          } else {
            failed++;
            manifest.push({ url: r.item.url, filename: r.item.filename, type: r.item.type, local_path: localPath, ok: false });
          }
        }

        return jsonResponse({
          topic_id,
          title,
          output_dir: absDir,
          total: allItems.length,
          downloaded,
          failed,
          files: manifest,
        });
      } catch (e: any) {
        return jsonError(`Failed to download media: ${e?.message || String(e)}`);
      }
    }
  );
};
