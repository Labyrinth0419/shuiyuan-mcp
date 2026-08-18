#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
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
 * Follows docs/shuiyuan-api-key.md: generate an RSA key pair, open the
 * /user-api-key/new authorization page in a browser, decrypt the returned
 * payload, and save a profile that authenticates via the `User-Api-Key`
 * header instead of cookies. Default scopes are read-only.
 */

export interface ApiKeyLoginOptions {
  site: string;
  profileFile: string;
  scopes: string;
  applicationName: string;
  clientId: string;
  nonce: string;
  payload?: string;
  noOpen?: boolean;
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

async function promptForPayload(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("Paste the encrypted payload here: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
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
  const nonce = typeof args.nonce === "string" ? args.nonce : randomNonce();
  const payload = typeof args.payload === "string" ? args.payload : undefined;
  const noOpen = Boolean(args["no-open"]);

  await mkdir(dirname(profileFile), { recursive: true });

  const { publicKey, privateKey } = generateKeyPair();
  const authUrl = buildAuthorizationUrl(
    { site, scopes, applicationName, clientId, nonce },
    publicKey,
  );

  process.stderr.write(`Shuiyuan User API Key login\n`);
  process.stderr.write(`Site: ${site}\n`);
  process.stderr.write(`Scopes: ${scopes}\n`);
  process.stderr.write(`Authorize this application in your browser:\n${authUrl}\n`);
  process.stderr.write("After authorizing, paste the encrypted payload below.\n");
  if (!noOpen) openBrowser(authUrl);

  const encrypted = payload ?? (await promptForPayload());
  if (!encrypted) throw new Error("No payload provided");

  const decrypted = decryptPayload(encrypted, privateKey);
  const result = JSON.parse(decrypted) as { key?: string; nonce?: string };
  if (!result.key) throw new Error("Invalid response: missing 'key' field");
  if (result.nonce !== nonce) {
    throw new Error("Nonce mismatch: authorization response does not match this request");
  }

  await saveProfile(profileFile, site, result.key, clientId);

  process.stderr.write(`Saved Shuiyuan profile: ${profileFile}\n`);
  process.stderr.write("Start the MCP server with: shuiyuan-mcp\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    const msg = err?.message || String(err);
    process.stderr.write(`[${new Date().toISOString()}] ERROR ${msg}\n`);
    process.exit(1);
  });
}
