#!/usr/bin/env node
// Turn card.json into a Job Pocket link. Node 18+, no packages.
//   node scripts/make_link.mjs card.json          → https://yourjobpocket.com/ai#d=...
//   node scripts/make_link.mjs card.json --post   → create the draft now, print a 24-hour link
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SITE = "https://yourjobpocket.com";
const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
if (!file) {
  console.error("usage: node scripts/make_link.mjs card.json [--post]");
  process.exit(2);
}
let text = (file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8")).trim();
if (text.startsWith("JPCARD")) text = text.split("\n").slice(1).join("\n");
let data = JSON.parse(text);
if (!data.card && data.name) data = { v: 1, card: data };
if (data.v !== 1 || !data.card?.name) {
  console.error('card.json needs "v": 1 and card.name');
  process.exit(1);
}

if (args.includes("--post")) {
  const response = await fetch(`${SITE}/v1/cards/drafts/structured`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "jobpocket-card-skill/1" },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Job Pocket said ${response.status}: ${body.error || "request failed"}`);
    process.exit(1);
  }
  console.log(body.link);
} else {
  const encoded = deflateSync(Buffer.from(JSON.stringify(data)), { level: 9 }).toString("base64url");
  console.log(`${SITE}/ai#d=${encoded}`);
}
