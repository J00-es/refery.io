#!/usr/bin/env node
/**
 * Deploy a Refery Brain edge function without the Supabase CLI.
 *
 * The CLI ships as a Bun binary that segfaults on `supabase login` on this
 * Windows machine, which leaves no way to deploy from the terminal. This talks
 * to the same Management API the CLI does, over plain Node fetch, so nothing
 * depends on Bun.
 *
 * Usage, from the repository root:
 *
 *   PowerShell:
 *     $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
 *     node scripts/deploy-brain-function.mjs refery-brain-gmail
 *
 *   bash:
 *     SUPABASE_ACCESS_TOKEN=sbp_... node scripts/deploy-brain-function.mjs refery-brain-gmail
 *
 * Get the token from https://supabase.com/dashboard/account/tokens. It is a
 * personal access token: keep it out of the repository and out of chat.
 *
 * Add --dry to list exactly what would be uploaded and stop before sending.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "ofujlvuejuvhpzemjaic";
const API = "https://api.supabase.com";

/**
 * Functions whose auth is their own. Both check a shared secret in the request
 * body or headers, so Supabase's JWT gate has always been off for them and
 * turning it on would lock out the cron that drives them.
 */
const NO_JWT = new Set(["refery-brain-gmail", "refery-brain-slack", "refery-brain-drive-sync"]);

const slug = process.argv[2];
const dryRun = process.argv.includes("--dry");

if (!slug) {
  console.error("Which function? e.g. node scripts/deploy-brain-function.mjs refery-brain-gmail");
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token && !dryRun) {
  console.error("SUPABASE_ACCESS_TOKEN is not set.");
  console.error("Create one at https://supabase.com/dashboard/account/tokens, then:");
  console.error('  PowerShell:  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."');
  process.exit(1);
}

const root = join(process.cwd(), "supabase", "functions");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const paths = await walk(root);
const entrypoint = `${slug}/index.ts`;

// Everything under supabase/functions goes up: the function's own directory
// plus _shared, which every one of them imports. Sending a partial set is
// rejected outright rather than half-applied, which is the safe direction, but
// there is no reason to risk it.
const files = [];
for (const p of paths) {
  const name = relative(root, p).split(sep).join("/");
  files.push({ name, content: await readFile(p, "utf8") });
}
files.sort((a, b) => a.name.localeCompare(b.name));

if (!files.some((f) => f.name === entrypoint)) {
  console.error(`Entrypoint ${entrypoint} is not in supabase/functions. Found:`);
  for (const f of files) console.error(`  ${f.name}`);
  process.exit(1);
}

const verifyJwt = !NO_JWT.has(slug);

console.log(`function     ${slug}`);
console.log(`project      ${PROJECT_REF}`);
console.log(`entrypoint   ${entrypoint}`);
console.log(`verify_jwt   ${verifyJwt}${verifyJwt ? "" : "  (this function authenticates itself)"}`);
console.log(`files        ${files.length}`);
for (const f of files) console.log(`  ${f.name.padEnd(34)} ${String(f.content.length).padStart(6)} bytes`);

if (dryRun) {
  console.log("\n--dry given, nothing sent.");
  process.exit(0);
}

const form = new FormData();
form.append(
  "metadata",
  new Blob(
    [JSON.stringify({ name: slug, entrypoint_path: entrypoint, verify_jwt: verifyJwt, static_patterns: [] })],
    { type: "application/json" },
  ),
);
for (const f of files) {
  form.append("file", new File([f.content], f.name, { type: "application/typescript" }));
}

console.log("\nuploading...");
const response = await fetch(`${API}/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(slug)}`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}` },
  body: form,
});

const text = await response.text();
if (!response.ok) {
  console.error(`\nFAILED  HTTP ${response.status}`);
  console.error(text.slice(0, 2000));
  console.error("\nNothing was changed. Supabase rejects an incomplete or invalid deploy outright.");
  process.exit(1);
}

let result;
try {
  result = JSON.parse(text);
} catch {
  console.log(text.slice(0, 1000));
  process.exit(0);
}

console.log(`\nDEPLOYED  version ${result.version}  status ${result.status}`);
console.log(`checksum  ${result.ezbr_sha256 ?? "(none returned)"}`);
console.log(`verify_jwt ${result.verify_jwt}`);
