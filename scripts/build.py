"""Build the generated files from tracks.csv (the only hand-maintained data file).

    python scripts/build.py

Writes:
  tracks.json        stations with their tracks and listening links
  docs/tracks.json   the same file for the GitHub Pages site (served from /docs)
  TRACKLIST.md       the readable list

  README.md          the station index between the station-index markers

Listening links: an exact Spotify / Apple Music track link when scripts/resolve_links.py found a confident
match (links.json), otherwise a search link built from the artist and title. YouTube Music is always a search.

Artist names: the game stores most of them in capitals. They are shown in normal capitalisation, using the
spelling Spotify or Apple Music give the same artist where known, and simple title case otherwise.
tracks.csv keeps the game's spelling; tracks.json has both ("artist" and "artist_game").

Station details (station_info.json, optional) are copied into tracks.json as "info".
"""
import csv
import json
import os
import re
from collections import OrderedDict
from urllib.parse import quote, quote_plus

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NON_STATIONS = ("Talk shows", "Podcasts", "Unassigned")
SEPARATORS = re.compile(r"(\s+(?:FT\.?|FEAT\.?|FEATURING|VS\.?|X|&|AND|WITH)\s+|\s*,\s*)", re.I)
SMALL_WORDS = {"of", "the", "and", "in", "on", "at", "a", "an", "de", "del", "la", "le", "los", "las", "y",
               "van", "von", "der", "da", "do", "dos", "for", "to", "with"}


def read_json(name, default):
    path = os.path.join(ROOT, name)
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def title_word(word, first):
    if not any(c.isalpha() for c in word) or any(c.isdigit() for c in word):
        return word                                    # "!!!", "112", "CA7RIEL" stay as they are
    if "." in word.strip("."):
        return word.upper()                            # "B.B.", "D.J."
    low = word.lower()
    core = re.sub(r"[^a-z]", "", low)
    if core in ("dj", "mc", "uk", "usa", "ii", "iii", "iv") or (2 < len(core) <= 5 and not re.search("[aeiouy]", core)):
        return word.upper()                            # "DJ", "TLC", "MGMT" are acronyms, not words
    if not first and low in SMALL_WORDS:
        return low
    out = re.sub(r"(^|[-'/(\"])(\w)", lambda m: m.group(1) + m.group(2).upper(), low)
    return re.sub(r"^Mc(\w)", lambda m: "Mc" + m.group(1).upper(), out)


def title_case(name):
    return " ".join(title_word(w, i == 0) for i, w in enumerate(name.split()))


def display_artist(artist, known):
    """Normal capitalisation for a game artist string such as "BURNA BOY FT. SEYI VIBEZ"."""
    if not artist or artist != artist.upper():
        return artist                                  # already mixed case in the game text
    if artist.lower() in known:
        return known[artist.lower()]
    parts = SEPARATORS.split(artist)
    out = []
    for i, part in enumerate(parts):
        if i % 2:                                      # a separator
            sep = part.strip().lower()
            out.append(", " if sep == "," else f" {'ft.' if sep.startswith('f') else sep} ")
        elif part.strip():
            out.append(known.get(part.lower().strip(), title_case(part.strip())))
    return "".join(out)


def known_artists(resolved):
    known = {}
    for e in resolved.values():
        for name in (e.get("spotify_artists") or []) + (e.get("apple_artists") or []):
            known.setdefault(name.lower(), name)
    return known


def slug(name):
    """GitHub's heading anchor for a name."""
    return re.sub(r"\s", "-", re.sub(r"[^\w\s-]", "", name.lower()))


def search_query(artist, title):
    # "FT." credits and bracketed notes make searches worse; keep the main artist and the title
    artist = re.split(r"\s+(?:FT\.|FEAT\.|FEATURING)\s+", artist, flags=re.I)[0]
    title = re.sub(r"\s*[\(\[].*?[\)\]]", "", title)
    return f"{artist} {title}".strip()


def links(artist, title, resolved=None):
    """Listening links plus which of them are exact track links."""
    q = search_query(artist, title)
    out = {
        "spotify": "https://open.spotify.com/search/" + quote(q, safe=""),
        "youtube_music": "https://music.youtube.com/search?q=" + quote_plus(q),
        "apple_music": "https://music.apple.com/us/search?term=" + quote_plus(q),
    }
    exact = []
    for key in ("spotify", "apple_music"):
        url = (resolved or {}).get(key)
        if url:
            out[key] = url
            exact.append(key)
    return out, exact


def load():
    with open(os.path.join(ROOT, "tracks.csv"), encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    resolved = read_json("links.json", {})
    known = known_artists(resolved)
    stations = OrderedDict()
    for r in rows:
        r["artist_display"] = display_artist(r["artist"], known)
        r["links"], r["exact"] = links(r["artist"], r["title"], resolved.get(r["artist"] + "\t" + r["title"]))
        stations.setdefault(r["station"], []).append(r)
    order = sorted(stations, key=lambda s: (s.startswith(NON_STATIONS), s.lower()))
    return rows, OrderedDict((s, stations[s]) for s in order)


def build_json(stations):
    info = read_json("station_info.json", {})
    out = []
    for name, rows in stations.items():
        st = {"name": name, "slug": slug(name), "kind": rows[0]["kind"], "confidence": rows[0]["confidence"]}
        if name in info:
            st["info"] = info[name]
        st["tracks"] = [{"artist": r["artist_display"], "artist_game": r["artist"], "title": r["title"],
                         "links": r["links"], "exact": r["exact"]} for r in rows]
        out.append(st)
    # Stations with facts but no track list yet (e.g. talk stations): listed after the rest, with no tracks
    talk_words = ("talk", "podcast")
    for name, st_info in info.items():
        if name not in stations:
            kind = "talk" if any(w in (st_info.get("genre") or "").lower() for w in talk_words) else "music"
            out.append({"name": name, "slug": slug(name), "kind": kind, "confidence": None,
                        "info": st_info, "tracks": []})
    return {"stations": out}


def render_markdown(stations):
    """TRACKLIST.md. Kept in one function so the layout can change without touching the data code.

    Layout: intro, a jump table, then one section per station. Music stations come first,
    then Podcasts and Talk shows (and any unassigned block). Headings are the plain station names,
    so their GitHub anchors equal slug(name), the same slug that tracks.json uses.
    """
    meaning = {
        "high": "the record order and the artists' genre agree, or the names match outright (podcasts)",
        "medium": "one source of evidence only, or no on-screen station name found",
        "low": "a best guess from the artists' genre",
    }

    # Per-section wording: only the half of the "high" definition that applies to that kind of section
    short = {("high", "music"): "the record order and the artists' genre agree",
             ("high", "talk"): "the names match outright"}

    def cell(text):
        # Escape characters that GitHub-flavoured markdown would read as formatting or a column break
        return re.sub(r"([\\`*_\[\]<>|])", r"\\\1", text.strip()) or "—"

    def rank(name):
        if name == "Podcasts":
            return 1
        if name == "Talk shows":
            return 2
        if name.startswith("Unassigned"):
            return 3
        return 0 if stations[name][0]["kind"] == "music" else 2

    def count(name):
        n = len(stations[name])
        if stations[name][0]["kind"] == "music":
            return f"{n} track" + ("" if n == 1 else "s")
        return f"{n} " + ("entry" if n == 1 else "entries")

    order = sorted(stations, key=lambda s: (rank(s), s.lower()))
    music = [s for s in order if rank(s) == 0]
    other = [s for s in order if rank(s) > 0]
    total = sum(len(v) for v in stations.values())

    def jump_table(names):
        rows = ["| Station | Entries | Confidence |", "|---|---:|---|"]
        rows += [f"| [{cell(s)}](#{slug(s)}) | {len(stations[s])} | {stations[s][0]['confidence']} |"
                 for s in names]
        return rows

    def section(name):
        v = stations[name]
        conf = v[0]["confidence"]
        first, second = ("Artist", "Title") if v[0]["kind"] == "music" else ("Show", "Episode")
        has_second = any(r["title"].strip() for r in v)
        head = f"| {first} | {second} | Listen |" if has_second else f"| {first} | Listen |"
        out = ["", f"### {name}", "",
               f"> {count(name)} · Confidence **{conf}**: {short.get((conf, v[0]['kind']), meaning.get(conf, conf))}", "",
               head, "|---|---|---|" if has_second else "|---|---|"]
        for r in v:
            l, exact = r["links"], r["exact"]
            mark = lambda key: "" if key in exact else " 🔍"
            listen = (f"[Spotify{mark('spotify')}]({l['spotify']}) · [YT Music 🔍]({l['youtube_music']}) · "
                      f"[Apple{mark('apple_music')}]({l['apple_music']})")
            cols = [cell(r["artist_display"])] + ([cell(r["title"])] if has_second else []) + [listen]
            out.append("| " + " | ".join(cols) + " |")
        out += ["", "[↑ Back to contents](#contents)"]
        return out

    md = [
        "# GTA VI radio tracklist", "",
        f"Every radio station in Grand Theft Auto VI (Xbox Series build 1.0.2.1) with its artists and titles: "
        f"{total} entries in {len(music)} music stations, plus podcasts and talk shows. "
        "Names only.", "",
        "- **Confidence** says how sure the station match is: "
        + "; ".join(f"**{k}** = {meaning[k]}" for k in ("high", "medium", "low"))
        + ". See [how the stations were matched](README.md#how-the-stations-were-matched).",
        "- **Listen** links go straight to the track on Spotify or Apple Music when a confident match was found. "
        "Links marked 🔍 open a search for the artist and title instead (YouTube Music always does), "
        "so check the result.",
        "- An empty cell (—) means the game's text has no title or artist for that entry. "
        "The list doesn't show the order the tracks play in.", "",
        "This file is generated by `scripts/build.py` from `tracks.csv`. To fix something, edit the CSV, "
        "not this file. You can also browse the list on the [website](https://rgvxsthi.github.io/vi-radio-db/).", "",
        "## Contents", "",
        "**Music stations**", "",
        *jump_table(music), "",
        "**Podcasts and talk shows**", "",
        *jump_table(other), "",
        "## Music stations",
    ]
    for s in music:
        md += section(s)
    md += ["", "## Podcasts and talk shows"]
    for s in other:
        md += section(s)
    return "\n".join(md) + "\n"


def readme_index(stations):
    """The station index in README.md, between the station-index markers."""
    def rank(name):
        if name == "Podcasts":
            return 1
        if name == "Talk shows":
            return 2
        if name.startswith("Unassigned"):
            return 3
        return 0 if stations[name][0]["kind"] == "music" else 2
    order = sorted(stations, key=lambda s: (rank(s), s.lower()))

    def table(names):
        rows = ["| Station | Tracks | Confidence |", "|---|---:|---|"]
        return rows + [f"| [{s}](TRACKLIST.md#{slug(s)}) | {len(stations[s])} | {stations[s][0]['confidence']} |"
                       for s in names]
    music = [s for s in order if rank(s) == 0]
    other = [s for s in order if rank(s) > 0]
    total = sum(len(v) for v in stations.values())
    block = (["**Music stations**", ""] + table(music) + ["", "**Podcasts and talk shows**", ""]
             + table(other) + ["", f"Total: {total} entries."])
    path = os.path.join(ROOT, "README.md")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    pat = re.compile(r"(<!-- station-index:start[^>]*-->\n).*?(<!-- station-index:end -->)", re.S)
    if pat.search(text):
        text = pat.sub(lambda m: m.group(1) + "\n" + "\n".join(block) + "\n\n" + m.group(2), text)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)


def main():
    rows, stations = load()
    data = json.dumps(build_json(stations), ensure_ascii=False, indent=1) + "\n"
    for path in ("tracks.json", os.path.join("docs", "tracks.json")):
        with open(os.path.join(ROOT, path), "w", encoding="utf-8", newline="\n") as f:
            f.write(data)
    with open(os.path.join(ROOT, "TRACKLIST.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write(render_markdown(stations))
    readme_index(stations)
    print(f"{len(rows)} tracks, {len(stations)} sections")


if __name__ == "__main__":
    main()
