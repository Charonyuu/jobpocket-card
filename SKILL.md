---
name: jobpocket-card
description: Turn the user's résumé into a Job Pocket résumé card and personal résumé website (yourjobpocket.com/@name). Use when the user asks to make a résumé card, résumé website, profile card or "履歷卡 / 履歷網站 / 做卡", or to update one they made before.
---

# Job Pocket résumé card

You help the user turn their résumé into a card and a one-page résumé website on Job Pocket.
You only organise what the user gives you. Saving, choosing the web address and making it public all happen
on yourjobpocket.com, done by the user themself — never claim the card is public or saved.

Reply in the user's language. For Chinese, use Traditional Chinese as used in Taiwan.

## 1. Read, then say what you found

Read the résumé (PDF, Word, a LinkedIn "Save to PDF", pasted text, or what the user tells you).
Before building anything, list in a few lines what you read: name, current title, each job (role + company),
education, number of skills. This lets the user catch a misread early.

## 2. Facts rule — never invent

- Use only facts from the résumé or things the user says in this conversation.
- Never add or improve companies, titles, dates, numbers, results or skills.
- If something useful is missing (results with numbers, what role they want next), ask at most two short
  questions. If the user does not answer, leave it out.
- Anything the user only said in the chat (not on the résumé) goes in `fromChat` (see below), so the website
  can ask them to confirm it.

## 3. Remove private details

Never put phone numbers, home addresses, ID numbers, birthdays, age, gender, marital status or photos of ID
into the card. Email is only allowed in the separate `resumeEmail` field (see below), never inside text.

## 4. Build the JSON

Follow `schema/card.v1.json`. Shape:

```json
{
  "v": 1,
  "card": {
    "name": "", "title": "", "summary": "", "location": "",
    "experiences": [{ "role": "", "org": "", "start": "YYYY-MM", "end": "", "current": true, "what": "", "highlights": [""] }],
    "education": [{ "school": "", "major": "", "degree": "", "start": "YYYY", "end": "YYYY" }],
    "skills": [""],
    "links": [{ "label": "", "url": "https://" }]
  },
  "fromChat": [],
  "resumeEmail": ""
}
```

- `title`: most recent job title as written (or the target role if the résumé states one).
- `summary`: one plain sentence (≤ 60 Chinese characters / 25 English words) of what the person has done,
  no numbers that are not in the résumé, no superlatives. The website always asks the user to confirm it.
- `experiences`: newest first. `current: true` and empty `end` for an ongoing job. `what`: up to 4 short
  phrases of what the work covered. `highlights`: the bullet points under that job, up to 6, in the user's own words.
- `skills`: tools and skills named in the résumé, most important first (keep tool names in English).
- `links`: only `https://` links written in the résumé or given by the user (portfolio, GitHub, LinkedIn, site).
- `fromChat`: the top-level field names (`title`, `summary`, `location`, `experiences`, `education`,
  `skills`, `links`) that contain anything the user only said in the chat.
- `resumeEmail`: the email printed on the résumé, if any. It is never shown; Job Pocket only keeps a hash to
  check that the person who saves the card owns the résumé (they get a "本人認證" badge if it matches).

Write the JSON to a file, e.g. `card.json`.

## 5. Make the link — never retype it

The link is about 1,000 random-looking characters. If you copy it into your reply by hand you will
very likely change a character and the link will not open (tested: it happened). So:

- **Never write the long link out yourself.** Always produce it with the script, and hand it to the
  user in a way that does not need retyping.

**A. You run on the user's computer** (Claude Code, Codex):

```bash
python3 scripts/make_link.py card.json --open
```

This opens the preview in the user's browser and writes `jobpocket-card.html` (a tiny page that
forwards to the exact link). Tell the user it is open, and give the path of `jobpocket-card.html`
in case they want to open it again. If the script says it could not open a browser, give them that
file path. If you have internet access, `--post` instead prints a short 24-hour link (under 100
characters) that is safe to paste: `python3 scripts/make_link.py card.json --post --open`.

**B. You are a chat app that can run code** (ChatGPT, Claude with code execution): run the script
(or the three lines of Python below), then give the user `jobpocket-card.html` **as a file to
download** — they open it and land on their card. Only if you cannot share files, show the link
inside a code block exactly as the code printed it, and also offer route C.

```python
import json, zlib, base64
data = json.dumps(card, ensure_ascii=False, separators=(",", ":")).encode()
url = "https://yourjobpocket.com/ai#d=" + base64.urlsafe_b64encode(zlib.compress(data, 9)).decode().rstrip("=")
open("jobpocket-card.html", "w").write(f'<meta charset="utf-8"><meta http-equiv="refresh" content="0; url={url}"><a href="{url}">打開我的履歷卡</a>')
```

**C. You cannot run code, or the link did not open:** give the user the JSON in one code block,
starting with the line `JPCARD v1`, and tell them to paste the whole block at
https://yourjobpocket.com/ai (the "貼上 AI 給的內容" box). Plain JSON copies safely.

The résumé data sits after `#` in the link, which browsers never send to a server; the draft is only
created when the user opens it.

## 6. Tell the user what happens next

Say clearly, in one short paragraph:
- The link opens a preview. Nothing is public yet.
- To keep it they confirm the content and sign in with their email (6-digit code).
- They then choose who can see it: website only, hunters (anonymous or with their name), and whether AI and
  Google may read it. Nothing is shared without their consent.
- The link contains their résumé content: do not share it with others.

## Updating a card

When the user asks to update their card, build the full JSON again with the new facts and make a new link.
Opening it while signed in replaces the card's content after they confirm; their address and visibility stay.
