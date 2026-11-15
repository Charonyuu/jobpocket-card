#!/usr/bin/env node
// Turn card.json into a Job Pocket link. Node 18+, no packages.
//   node scripts/make_link.mjs card.json          → link + jobpocket-card.html (opens the link)
//   node scripts/make_link.mjs card.json --open   → also open it in the user's browser
//   node scripts/make_link.mjs card.json --post   → create the draft now, print a short 24-hour link
// The long link is ~1,000 random characters; an AI retyping it into chat often breaks it.
// Give the user jobpocket-card.html (or use --open / --post) instead of copying it by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
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

let url;
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
  url = body.link;
} else {
  url = `${SITE}/ai#d=${deflateSync(Buffer.from(JSON.stringify(data)), { level: 9 }).toString("base64url")}`;
}
const esc = (value) => value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;");
const opener = resolve("jobpocket-card.html");
writeFileSync(opener, `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta http-equiv="refresh" content="0; url=${esc(url)}">\n<title>打開我的 Job Pocket 履歷卡</title>\n<p style="font: 16px/1.6 system-ui, sans-serif; padding: 24px">正在打開你的履歷卡預覽… 沒有自動跳轉的話，<a href="${esc(url)}">按這裡</a>。</p>\n<script>location.replace(${JSON.stringify(url)});</script>\n`);
console.log(url);
console.error(`opener page: ${opener}`);
if (args.includes("--open")) {
  const cmd = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try { execFileSync(cmd[0], cmd[1], { stdio: "ignore", timeout: 15000 }); console.error("opened in the browser"); }
  catch { console.error("could not open a browser here; give the user the opener page"); }
}
