#!/usr/bin/env python3
"""Turn card.json into a Job Pocket link. Standard library only.

    python3 scripts/make_link.py card.json          # link + jobpocket-card.html (opens the link)
    python3 scripts/make_link.py card.json --open   # also open it in the user's browser
    python3 scripts/make_link.py card.json --post   # create the draft now, print a short 24-hour link
    cat card.json | python3 scripts/make_link.py -

The default link keeps the résumé content after '#', which browsers never send to a server.
It is about 1,000 random-looking characters: an AI that retypes it into a chat message often
gets a character wrong and the link breaks. So the script also writes jobpocket-card.html, a tiny
page that forwards to the exact link; give the user that file (or use --open / --post) instead of
copying the long link by hand.
"""
import argparse
import base64
import html
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import zlib

SITE = "https://yourjobpocket.com"
FIELDS = ("name", "title", "summary", "location", "experiences", "education", "skills", "links")
CHAT_FIELDS = ("title", "summary", "location", "experiences", "education", "skills", "links")


def load(path):
    text = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
    text = text.strip()
    if text.startswith("JPCARD"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
    data = json.loads(text)
    if "card" not in data and "name" in data:  # a bare card object
        data = {"v": 1, "card": data}
    return data


def check(data):
    problems = []
    if data.get("v") != 1:
        problems.append('"v" must be 1')
    card = data.get("card")
    if not isinstance(card, dict):
        return problems + ['"card" must be an object']
    if not str(card.get("name", "")).strip():
        problems.append("card.name is required")
    extra = [key for key in card if key not in FIELDS]
    if extra:
        problems.append("unknown card fields (they would be dropped): " + ", ".join(extra))
    for link in card.get("links", []) or []:
        if not str(link.get("url", "")).startswith("https://"):
            problems.append("links must start with https://: " + str(link.get("url")))
    bad_chat = [key for key in data.get("fromChat", []) or [] if key not in CHAT_FIELDS]
    if bad_chat:
        problems.append("fromChat may only list: " + ", ".join(CHAT_FIELDS))
    return problems


def link(data, site=SITE):
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded = base64.urlsafe_b64encode(zlib.compress(raw, 9)).decode("ascii").rstrip("=")
    return f"{site}/ai#d={encoded}"


def post(data, site=SITE):
    request = urllib.request.Request(
        f"{site}/v1/cards/drafts/structured",
        data=json.dumps(data, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "jobpocket-card-skill/1"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)["link"]
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get("error", "")
        except Exception:  # noqa: BLE001
            message = ""
        raise SystemExit(f"Job Pocket said {error.code}: {message or 'request failed'}")


def write_opener(url, path):
    """A one-file page that forwards to the exact link, so nobody has to copy 1,000 characters."""
    safe = html.escape(url, quote=True)
    page = f"""<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url={safe}">
<title>打開我的 Job Pocket 履歷卡</title>
<p style="font: 16px/1.6 system-ui, sans-serif; padding: 24px">正在打開你的履歷卡預覽… 沒有自動跳轉的話，<a href="{safe}">按這裡</a>。</p>
<script>location.replace({json.dumps(url)});</script>
"""
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(page)
    return os.path.abspath(path)


def open_in_browser(target):
    commands = {"darwin": ["open"], "win32": ["cmd", "/c", "start", ""]}.get(sys.platform, ["xdg-open"])
    try:
        subprocess.run([*commands, target], check=True, timeout=15, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:  # noqa: BLE001
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", help="card.json, or - for stdin")
    parser.add_argument("--post", action="store_true", help="create the draft now and print a short 24-hour link")
    parser.add_argument("--open", action="store_true", help="open the link in the user's browser")
    parser.add_argument("--html", default="jobpocket-card.html", help="where to write the opener page (default: ./jobpocket-card.html)")
    parser.add_argument("--site", default=SITE, help=argparse.SUPPRESS)
    args = parser.parse_args()
    data = load(args.file)
    problems = check(data)
    if problems:
        raise SystemExit("card.json has problems:\n- " + "\n- ".join(problems))
    url = post(data, args.site) if args.post else link(data, args.site)
    opener = write_opener(url, args.html)
    opened = open_in_browser(url) if args.open else False
    print(url)
    print(f"opener page: {opener}", file=sys.stderr)
    if args.open:
        print("opened in the browser" if opened else "could not open a browser here; give the user the opener page", file=sys.stderr)


if __name__ == "__main__":
    main()
