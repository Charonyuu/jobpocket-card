#!/usr/bin/env python3
"""Turn card.json into a Job Pocket link. Standard library only.

    python3 scripts/make_link.py card.json          # https://yourjobpocket.com/ai#d=...
    python3 scripts/make_link.py card.json --post   # create the draft now, print a 24-hour link
    cat card.json | python3 scripts/make_link.py -

The default link keeps the résumé content after '#', which browsers never send to a server.
"""
import argparse
import base64
import json
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


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", help="card.json, or - for stdin")
    parser.add_argument("--post", action="store_true", help="create the draft now and print a short 24-hour link")
    parser.add_argument("--site", default=SITE, help=argparse.SUPPRESS)
    args = parser.parse_args()
    data = load(args.file)
    problems = check(data)
    if problems:
        raise SystemExit("card.json has problems:\n- " + "\n- ".join(problems))
    print(post(data, args.site) if args.post else link(data, args.site))


if __name__ == "__main__":
    main()
