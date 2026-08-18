#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "./util/cli.js";
import {
  SHUIYUAN_SITE,
  defaultShuiyuanProfileFile,
} from "./shuiyuan_defaults.js";
import {
  generateKeyPair,
  buildAuthorizationUrl,
  decryptPayload,
} from "./user-api-key-generator.js";

/**
 * Shuiyuan User API Key login.
 *
 * Two-step flow:
 *   1. First run (no --payload): generate RSA keypair, save private key to
 *      a pending file, print authorization URL.
 *   2. User authorizes in browser, copies the encrypted payload.
 *   3. Second run (with --payload): load private key from pending file,
 *      decrypt payload, save profile, clean up.
 */

function pendingKeyFile(): string {
  const dir = process.env.TEMP || process.env.TMPDIR || "/tmp";
  return resolve(dir, "shuiyuan-api-key-pending.json");
}

function randomNonce(): string {
  return randomBytes(32).toString("base64url");
}

/** Best-effort default browser open; the URL is always printed for manual use. */
function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // Ignore: opening the browser is a convenience, not a requirement.
  }
}

async function saveProfile(profileFile: string, site: string, userApiKey: string, clientId: string) {
  await writeFile(
    profileFile,
    JSON.stringify(
      {
        auth_pairs: [
          {
            site,
            user_api_key: userApiKey,
            user_api_client_id: clientId,
          },
        ],
        read_only: true,
        allow_writes: false,
        site,
        log_level: "info",
        tools_mode: "discourse_api_only",
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function main(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const site = typeof args.site === "string" ? args.site : SHUIYUAN_SITE;
  const profileFile = resolve(typeof args.profile === "string" ? args.profile : defaultShuiyuanProfileFile());
  const scopes = typeof args.scopes === "string" ? args.scopes : "read";
  const applicationName = typeof args["application-name"] === "string" ? args["application-name"] : "shuiyuan-mcp";
  const clientId = typeof args["client-id"] === "string" ? args["client-id"] : "shuiyuan-mcp";
  const noOpen = Boolean(args["no-open"]);
  const payload = typeof args.payload === "string" ? args.payload : undefined;

  await mkdir(dirname(profileFile), { recursive: true });

  if (payload) {
    // ── Step 2: decrypt mode ──────────────────────────────────────
    const pendingFile = pendingKeyFile();
    let saved: { privateKey: string; nonce: string; clientId: string };
    try {
      saved = JSON.parse(await readFile(pendingFile, "utf8"));
    } catch {
      throw new Error(
        `No pending login found at ${pendingFile}.\n` +
        `Run without --payload first to generate the authorization URL.`,
      );
    }

    process.stderr.write(`Shuiyuan User API Key login (decrypt mode)\n`);
    process.stderr.write(`Site: ${site}\n`);

    const decrypted = decryptPayload(payload, saved.privateKey);
    const result = JSON.parse(decrypted) as { key?: string; nonce?: string };
    if (!result.key) throw new Error("Invalid response: missing 'key' field");
    if (result.nonce !== saved.nonce) {
      throw new Error("Nonce mismatch: authorization response does not match this request");
    }

    await saveProfile(profileFile, site, result.key, saved.clientId);

    // Clean up pending file
    try { await unlink(pendingFile); } catch { /* ignore */ }

    process.stderr.write(`Saved Shuiyuan profile: ${profileFile}\n`);
    process.stderr.write("Start the MCP server with: shuiyuan-mcp\n");
    return;
  }

  // ── Step 1: generate mode ──────────────────────────────────────
  const nonce = randomNonce();
  const { publicKey, privateKey } = generateKeyPair();

  const authUrl = buildAuthorizationUrl(
    { site, scopes, applicationName, clientId, nonce },
    publicKey,
  );

  // Save private key + nonce for the next run
  const pendingFile = pendingKeyFile();
  await mkdir(dirname(pendingFile), { recursive: true });
  await writeFile(pendingFile, JSON.stringify({ privateKey, nonce, clientId }), "utf8");

  process.stderr.write(`Shuiyuan User API Key login\n`);
  process.stderr.write(`Site: ${site}\n`);
  process.stderr.write(`Scopes: ${scopes}\n`);
  process.stderr.write(`Authorize this application in your browser:\n${authUrl}\n`);
  process.stderr.write(`\nAfter authorizing, run again with:\n`);
  process.stderr.write(`  node ${process.argv[1]} --payload <encrypted-payload>\n`);
  process.stderr.write(`\n(Private key saved to ${pendingFile})\n`);

  if (!noOpen) openBrowser(authUrl);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    const msg = err?.message || String(err);
    process.stderr.write(`[${new Date().toISOString()}] ERROR ${msg}\n`);
    process.exit(1);
  });
}
