"""Find exact Spotify and Apple Music links for the tracks in tracks.csv.

    python scripts/resolve_links.py [--only spotify|apple] [--limit N]

Writes links.json: {"<artist>\t<title>": {"spotify": url|null, "apple_music": url|null, ...}}.
scripts/build.py uses an exact link when there is one and falls back to a search link otherwise.

Spotify needs an app's client ID and secret (developer.spotify.com/dashboard), read from the environment
(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET) or from ~/.spotify_credentials (KEY=value lines). They are never
written anywhere. Apple Music uses Apple's public iTunes Search API, which needs no key but is rate-limited
(about 20 requests a minute), so that part is slow.

A link is kept only when the result's title and main artist both match the track closely; anything less
stays a search link. Results already in links.json are not looked up again, so the script can be rerun.
"""
import argparse
import base64
import csv
import difflib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

try:  # use the OS certificate store when available (Python on Windows may lack a CA bundle)
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "links.json")
FEAT = re.compile(r"\s+(?:ft\.?|feat\.?|featuring|with|x|&|,|and)\s+.*$", re.I)


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\s*[\(\[].*?[\)\]]", "", s)            # (Remastered), [Live], (feat. X)
    s = re.sub(r"\s+-\s+.*$", "", s)                     # " - 2011 Remaster", " - Single Version"
    s = s.replace("&", "and")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def main_artist(a):
    return norm(FEAT.sub("", a)) or norm(a)


def similar(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def good_match(artist, title, cand_title, cand_artists):
    t, ct = norm(title), norm(cand_title)
    title_ok = t == ct or (len(t) > 3 and (t in ct or ct in t) and similar(t, ct) > 0.6) or similar(t, ct) >= 0.9
    ma = main_artist(artist)
    artist_ok = any(ma == norm(c) or similar(ma, norm(c)) >= 0.85 or (len(ma) > 3 and ma in norm(c))
                    for c in cand_artists)
    return title_ok and artist_ok


def http_json(url, headers=None, data=None, tries=6):
    for attempt in range(tries):
        req = urllib.request.Request(url, data=data, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 403, 500, 502, 503) and attempt < tries - 1:
                wait = int(e.headers.get("Retry-After") or 0) or min(60, 5 * 2 ** attempt)
                if wait > 300:                                 # a long ban: stop instead of hanging for hours
                    sys.exit(f"rate-limited by {urllib.parse.urlsplit(url).netloc} for {wait} s; "
                             "progress is saved in links.json, rerun later")
                print(f"  waiting {wait} s (HTTP {e.code})", flush=True)
                time.sleep(wait)
                continue
            raise
        except urllib.error.URLError:
            if attempt < tries - 1:
                time.sleep(5)
                continue
            raise


def spotify_token():
    cid, secret = os.environ.get("SPOTIFY_CLIENT_ID"), os.environ.get("SPOTIFY_CLIENT_SECRET")
    path = os.path.join(os.path.expanduser("~"), ".spotify_credentials")
    if (not cid or not secret) and os.path.exists(path):
        kv = dict(l.strip().split("=", 1) for l in open(path, encoding="utf-8") if "=" in l)
        cid, secret = kv.get("SPOTIFY_CLIENT_ID"), kv.get("SPOTIFY_CLIENT_SECRET")
    if not cid or not secret:
        sys.exit("no Spotify credentials (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET or ~/.spotify_credentials)")
    auth = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    tok = http_json("https://accounts.spotify.com/api/token", {"Authorization": "Basic " + auth},
                    b"grant_type=client_credentials")
    return tok["access_token"]


def spotify_find(token, artist, title):
    queries = [f'track:"{norm(title)}" artist:"{main_artist(artist)}"', f"{main_artist(artist)} {norm(title)}"]
    for q in queries:
        url = "https://api.spotify.com/v1/search?" + urllib.parse.urlencode({"q": q, "type": "track", "limit": 10})
        res = http_json(url, {"Authorization": "Bearer " + token})
        for it in res.get("tracks", {}).get("items", []):
            if good_match(artist, title, it["name"], [a["name"] for a in it["artists"]]):
                return it["external_urls"]["spotify"], [a["name"] for a in it["artists"]]
    return None, []


def apple_find(artist, title):
    q = f"{main_artist(artist)} {norm(title)}"
    url = "https://itunes.apple.com/search?" + urllib.parse.urlencode(
        {"term": q, "media": "music", "entity": "song", "limit": 10, "country": "US"})
    res = http_json(url)
    time.sleep(3.2)                                          # stay under ~20 requests a minute
    for it in res.get("results", []):
        if good_match(artist, title, it.get("trackName", ""), [it.get("artistName", "")]):
            url = re.sub(r"[?&]uo=\d+", "", it["trackViewUrl"]).replace("itunes.apple.com", "music.apple.com")
            return url, [it.get("artistName", "")]
    return None, []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["spotify", "apple"])
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    rows = [r for r in csv.DictReader(open(os.path.join(ROOT, "tracks.csv"), encoding="utf-8", newline=""))
            if r["kind"] == "music" and r["artist"] and r["title"]]
    links = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    services = [args.only] if args.only else ["spotify", "apple"]
    token = spotify_token() if "spotify" in services else None
    done = 0
    for i, r in enumerate(rows, 1):
        key = f"{r['artist']}\t{r['title']}"
        entry = links.setdefault(key, {})
        changed = False
        if "spotify" in services and "spotify" not in entry:
            entry["spotify"], entry["spotify_artists"] = spotify_find(token, r["artist"], r["title"]); changed = True
        if "apple" in services and "apple_music" not in entry:
            entry["apple_music"], entry["apple_artists"] = apple_find(r["artist"], r["title"]); changed = True
        if changed:
            done += 1
            if done % 25 == 0:
                json.dump(links, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
                print(f"{i}/{len(rows)}", flush=True)
            if args.limit and done >= args.limit:
                break
    json.dump(links, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    for svc, k in (("spotify", "spotify"), ("apple", "apple_music")):
        vals = [e.get(k) for e in links.values() if k in e]
        if vals:
            print(f"{svc}: {sum(1 for v in vals if v)} exact of {len(vals)} looked up")


if __name__ == "__main__":
    main()
