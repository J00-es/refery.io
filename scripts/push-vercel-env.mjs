#!/usr/bin/env node
/**
 * Copy environment variables from a local .env file into Vercel Production.
 *
 * Vercel's dashboard has moved its bulk-paste box around, and clicking five
 * secrets in one at a time is exactly the sort of thing that ends with one of
 * them subtly wrong. This pushes them over the API instead.
 *
 * Usage, from the repository root:
 *
 *   PowerShell:
 *     $env:VERCEL_TOKEN = "..."
 *     node scripts/push-vercel-env.mjs .env.vercel-paste
 *
 * Create the token at https://vercel.com/account/settings/tokens with scope
 * over the lily-5796's projects team. It is a credential: keep it out of the
 * repository and out of chat.
 *
 * Values are never printed. The script reports key names and lengths only, so
 * a copy/paste accident is visible without the secret being.
 *
 * Add --dry to see what would be sent and stop.
 */

import { readFile } from "node:fs/promises";

const PROJECT = process.env.VERCEL_PROJECT_ID ?? "prj_YpcfhVEVVNcZoJGEzYA29VVUAA0R";
const TEAM = process.env.VERCEL_TEAM_ID ?? "team_WPb38GRRjUaB9GPWSiMJijlG";
const TARGET = "production";

const file = process.argv[2] ?? ".env.vercel-paste";
const dryRun = process.argv.includes("--dry");

const token = process.env.VERCEL_TOKEN;
if (!token && !dryRun) {
  console.error("VERCEL_TOKEN is not set.");
  console.error("Create one at https://vercel.com/account/settings/tokens, then:");
  console.error('  PowerShell:  $env:VERCEL_TOKEN = "..."');
  process.exit(1);
}

let raw;
try {
  raw = await readFile(file, "utf8");
} catch {
  console.error(`Cannot read ${file}`);
  process.exit(1);
}

const vars = [];
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) continue;
  vars.push({ key: match[1], value: match[2].replace(/^["']|["']$/g, "") });
}

if (!vars.length) {
  console.error(`No KEY=value lines found in ${file}`);
  process.exit(1);
}

console.log(`file      ${file}`);
console.log(`project   ${PROJECT}`);
console.log(`target    ${TARGET}`);
console.log(`variables ${vars.length}`);
for (const v of vars) console.log(`  ${v.key.padEnd(24)} ${String(v.value.length).padStart(4)} characters`);

if (dryRun) {
  console.log("\n--dry given, nothing sent.");
  process.exit(0);
}

// upsert so re-running is safe and a variable that already exists is updated
// rather than throwing a conflict half way through the list.
const url = `https://api.vercel.com/v10/projects/${PROJECT}/env?teamId=${TEAM}&upsert=true`;
const body = vars.map((v) => ({ key: v.key, value: v.value, type: "encrypted", target: [TARGET] }));

console.log("\nsending...");
const response = await fetch(url, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(body),
});

const text = await response.text();
if (!response.ok) {
  console.error(`\nFAILED  HTTP ${response.status}`);
  console.error(text.slice(0, 1500));
  process.exit(1);
}

let result;
try {
  result = JSON.parse(text);
} catch {
  console.log(text.slice(0, 800));
  process.exit(0);
}

const created = Array.isArray(result.created) ? result.created : [];
console.log(`\nOK  ${created.length || vars.length} variables now set on ${TARGET}`);
for (const item of created) console.log(`  ${item.key}`);
if (result.failed?.length) {
  console.error("\nfailed:");
  for (const f of result.failed) console.error(`  ${f.error?.key ?? "?"}: ${f.error?.message ?? JSON.stringify(f)}`);
  process.exit(1);
}
console.log("\nA new deployment is needed before the code can see these.");
