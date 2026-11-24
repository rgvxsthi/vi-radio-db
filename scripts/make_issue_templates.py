"""Write the GitHub issue forms in .github/ISSUE_TEMPLATE from the current station list.

    python scripts/make_issue_templates.py

Rerun it when a station is added or renamed, so the station dropdowns stay in sync with tracks.json.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".github", "ISSUE_TEMPLATE")
SITE = "https://rgvxsthi.github.io/vi-radio-db/"

with open(os.path.join(ROOT, "tracks.json"), encoding="utf-8") as f:
    stations = json.load(f)["stations"]
MUSIC = [s["name"] for s in stations if s["kind"] == "music"]
TALK = [s["name"] for s in stations if s["kind"] == "talk"]

RULES = ("Names and links only, please: **no lyrics, no audio files, no game files**. "
         "Screenshots of the in-game radio screen are fine.")


def q(s):
    """A YAML double-quoted string."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def dropdown(id_, label, options, required=True, desc=None):
    lines = [f"  - type: dropdown", f"    id: {id_}", f"    attributes:", f"      label: {q(label)}"]
    if desc:
        lines.append(f"      description: {q(desc)}")
    lines.append("      options:")
    lines += [f"        - {q(o)}" for o in options]
    lines += ["    validations:", f"      required: {'true' if required else 'false'}"]
    return lines


def field(kind, id_, label, required=False, desc=None, placeholder=None):
    lines = [f"  - type: {kind}", f"    id: {id_}", f"    attributes:", f"      label: {q(label)}"]
    if desc:
        lines.append(f"      description: {q(desc)}")
    if placeholder:
        lines.append(f"      placeholder: {q(placeholder)}")
    lines += ["    validations:", f"      required: {'true' if required else 'false'}"]
    return lines


def markdown(text):
    return ["  - type: markdown", "    attributes:", "      value: |"] + [f"        {l}" for l in text.split("\n")]


def source(required=True):
    return field("textarea", "source", "Source", required,
                 "How do you know? A link (wiki page, video with a timestamp, official soundtrack list), "
                 "or what you saw in the game (station, time of day, a screenshot).")


def form(name, filename, description, title, labels, body):
    lines = [f"name: {q(name)}", f"description: {q(description)}", f"title: {q(title)}",
             "labels: [" + ", ".join(q(l) for l in labels) + "]", "body:"]
    lines += markdown(RULES)
    lines += body
    lines += field("textarea", "notes", "Anything else?")
    with open(os.path.join(OUT, filename), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def main():
    os.makedirs(OUT, exist_ok=True)
    all_stations = MUSIC + TALK
    form("Missing song", "1-missing-song.yml", "A song plays on a station but isn't in the list.",
         "[Missing song] ", ["missing song"],
         dropdown("station", "Station", MUSIC + ["Other / not listed"])
         + field("input", "artist", "Artist", True, placeholder="e.g. Gloria Estefan")
         + field("input", "title", "Title", True)
         + source())
    form("Wrong song or wrong station", "2-wrong-song.yml",
         "A song is listed under the wrong station, or isn't in the game at all.",
         "[Wrong song] ", ["wrong song"],
         dropdown("station", "Station it's listed under", all_stations)
         + field("input", "artist", "Artist (as listed)", True)
         + field("input", "title", "Title (as listed)", True)
         + dropdown("problem", "What's wrong?", ["It belongs to another station", "It isn't in the game",
                                                 "It's listed twice", "Something else"])
         + field("input", "correct_station", "Correct station (if another station)")
         + source())
    form("Artist or title correction", "3-artist-title.yml",
         "A misspelled or incomplete artist or title, a missing featured artist, or wrong capitalisation.",
         "[Correction] ", ["correction"],
         dropdown("station", "Station", all_stations)
         + field("input", "current", "As listed now", True, placeholder="Artist - Title")
         + field("input", "corrected", "Should be", True, placeholder="Artist - Title")
         + source(required=False))
    form("Listening link", "4-listening-link.yml",
         "A Spotify, Apple Music or YouTube Music link is wrong, or you found the exact track for a search link.",
         "[Link] ", ["link"],
         dropdown("station", "Station", all_stations)
         + field("input", "track", "Track", True, placeholder="Artist - Title")
         + dropdown("service", "Service", ["Spotify", "Apple Music", "YouTube Music"])
         + dropdown("problem", "What's wrong?", ["Opens the wrong song", "Opens a different version (live, remix, cover)",
                                                 "Search only: here's the exact track", "Link is broken"])
         + field("input", "url", "Correct link", desc="The track's own page, e.g. https://open.spotify.com/track/…"))
    form("Station details", "5-station-details.yml",
         "Hosts, genre, frequency, a station with no or only part of its track list, or a full-station mix on YouTube.",
         "[Station] ", ["station info"],
         dropdown("station", "Station", all_stations + ["A station that isn't listed"])
         + dropdown("what", "What do you want to add or fix?",
                    ["Host or DJ", "Genre", "Frequency", "Missing or incomplete track list",
                     "Full-station mix on YouTube", "Something else"])
         + field("textarea", "details", "Details", True,
                 desc="For a YouTube mix, paste the video link and say who uploaded it. Official uploads are preferred.")
         + source())
    form("Podcast or talk show", "6-podcast-talk.yml",
         "A missing or wrong podcast episode or talk show, or a link to listen to one.",
         "[Podcast / talk] ", ["podcast / talk"],
         dropdown("station", "Podcast or talk station", TALK + ["Other / not listed"])
         + field("input", "show", "Show", True)
         + field("input", "episode", "Episode (if any)")
         + dropdown("what", "What's this about?", ["Missing show or episode", "Wrong name", "A link to listen",
                                                   "Something else"])
         + field("input", "url", "Link (if any)")
         + source(required=False))
    with open(os.path.join(OUT, "config.yml"), "w", encoding="utf-8", newline="\n") as f:
        f.write("blank_issues_enabled: true\n"
                "contact_links:\n"
                "  - name: Browse the stations\n"
                f"    url: {SITE}\n"
                "    about: Check the website first; the song may already be listed under another station.\n")
    print(f"issue forms written: {len(MUSIC)} music and {len(TALK)} talk stations in the dropdowns")


if __name__ == "__main__":
    main()
