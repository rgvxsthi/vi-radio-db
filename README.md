# VI Radio DB

The radio stations in Grand Theft Auto VI and what plays on them: the artist and title of every track.

**[Browse the stations on the website →](https://rgvxsthi.github.io/vi-radio-db/)**

Or read the [full tracklist](TRACKLIST.md), or grab the data as [CSV](tracks.csv) or [JSON](tracks.json).

**854 entries:** 22 music stations, plus podcasts and talk shows.

> [!NOTE]
> **Names only.** This repo holds station names, artist names and titles. It has no audio, no lyrics, no game files and nothing copied out of the game's archives. It's a fan project and isn't affiliated with Rockstar Games or Take-Two Interactive.

## Stations

Each link opens that station's section in [TRACKLIST.md](TRACKLIST.md). [Confidence](#confidence) says how sure the station match is.

<!-- station-index:start (generated from tracks.csv; don't edit the rows by hand) -->

**Music stations**

| Station | Tracks | Confidence |
|---|---:|---|
| [AfroBank FM](TRACKLIST.md#afrobank-fm) | 31 | high |
| [Back Country Radio](TRACKLIST.md#back-country-radio) | 24 | high |
| [Circoloco Records Radio](TRACKLIST.md#circoloco-records-radio) | 28 | high |
| [Cocoteo FM](TRACKLIST.md#cocoteo-fm) | 28 | high |
| [Dirty South Classics](TRACKLIST.md#dirty-south-classics) | 41 | high |
| [Emotion 98.3](TRACKLIST.md#emotion-983) | 35 | high |
| [Flash FM](TRACKLIST.md#flash-fm) | 89 | high |
| [Gloriana Blues Radio](TRACKLIST.md#gloriana-blues-radio) | 22 | high |
| [Honey FM](TRACKLIST.md#honey-fm) | 49 | high |
| [Kaleidoscope FM](TRACKLIST.md#kaleidoscope-fm) | 18 | high |
| [Leonida Jazz Radio](TRACKLIST.md#leonida-jazz-radio) | 37 | high |
| [Radio La Ola](TRACKLIST.md#radio-la-ola) | 25 | high |
| [Radio On-U](TRACKLIST.md#radio-on-u) | 16 | high |
| [Stockyard FM](TRACKLIST.md#stockyard-fm) | 30 | high |
| [Symphony FM](TRACKLIST.md#symphony-fm) | 16 | high |
| [The Chamber 106.6](TRACKLIST.md#the-chamber-1066) | 24 | high |
| [The Sniper of La Perle](TRACKLIST.md#the-sniper-of-la-perle) | 25 | high |
| [The Vault Radio](TRACKLIST.md#the-vault-radio) | 24 | high |
| [V-Rock](TRACKLIST.md#v-rock) | 58 | medium |
| [VCRR](TRACKLIST.md#vcrr) | 84 | high |
| [Vice City FM](TRACKLIST.md#vice-city-fm) | 82 | high |
| [Worldwide FM](TRACKLIST.md#worldwide-fm) | 43 | high |

**Podcasts and talk shows**

| Station | Tracks | Confidence |
|---|---:|---|
| [Podcasts](TRACKLIST.md#podcasts) | 20 | high |
| [The Wipe](TRACKLIST.md#the-wipe) | 3 | high |
| [WKTT](TRACKLIST.md#wktt) | 2 | high |

Total: 854 entries.

<!-- station-index:end -->

## Files

| File | What it holds |
|---|---|
| [`TRACKLIST.md`](TRACKLIST.md) | Every station with its tracks and listening links, easy to read |
| [`tracks.csv`](tracks.csv) | The source data, one row per track: `station, kind, artist, title, confidence` |
| [`station_info.json`](station_info.json) | Short facts about each station (host, genre, sources) and optional full-station mixes |
| [`links.json`](links.json) | Exact Spotify and Apple Music track links found by `scripts/resolve_links.py` |
| [`tracks.json`](tracks.json) | Everything above combined, grouped by station |
| [`scripts/build.py`](scripts/build.py) | Builds `tracks.json`, `docs/tracks.json`, `TRACKLIST.md` and the station table in this README |
| [`docs/`](docs/) | The [website](https://rgvxsthi.github.io/vi-radio-db/) (GitHub Pages) |

The game stores most artist names in capitals. The list shows them in normal capitalisation, spelled the way Spotify or Apple Music spell the artist where a match was found. `tracks.csv` keeps the game's own spelling.

## How the stations were matched

1. **Pair titles with artists.** The game's text has a numbered title entry and a numbered artist entry for each track, and the numbers pair them up. The numbers fall in blocks of 100, one block per track list.
2. **Match each block to a station.** Two sources of evidence:
   - **Order in the audio config.** The music records in the game's audio config are in the alphabetical order of the stations' internal names, so a block's position points to a station.
   - **Genre.** The genre of the block's artists has to fit the station.

   VCRR is the exception: it comes from the station records in the audio config.
3. **Find the on-screen name.** The game's text labels map each internal station name to the name you see in the game (Flash FM, Emotion 98.3, and so on).

### Confidence

| Level | Meaning |
|---|---|
| **high** | The order and the genre agree. For podcasts: the names match outright. |
| **medium** | One source of evidence only, or no on-screen station name was found. |
| **low** | A best guess from the genre. |

## Known gaps

- **No track list found** for Thrillbilly Mud Club Radio.
- **Talk stations have show names only.** The Wipe and WKTT list their shows; the game text has no episode titles for them.
- **Unlockable extras aren't marked** separately from the other tracks.
- **Incomplete entries.** Five songs have no title in the game's text and one podcast episode has no show name.
- **No play order.** The list says which tracks a station has, not the order they play in.

## Listening links

Each track has Spotify, YouTube Music and Apple Music links.

- **Exact links.** Where `scripts/resolve_links.py` found a confident match (same title, same main artist), the Spotify and Apple Music links go straight to the track.
- **Search links.** Everything else opens a search for the artist and title, so check that the result is the right song. These are marked 🔍 in the tracklist. YouTube Music links are always searches.

## Full-station mixes

If a whole station is posted on YouTube as one mix, it can be added to the station's page. Add a `youtube_mix` entry to that station in [`station_info.json`](station_info.json):

```json
"youtube_mix": {"id": "<11-character video id>", "title": "Video title", "credit": "Uploaded by …"}
```

The website shows it as a click-to-play player: nothing loads from YouTube until a visitor presses play. Official uploads are preferred over re-uploads.

## Contributing

Corrections are welcome. [Open an issue](https://github.com/rgvxsthi/vi-radio-db/issues/new/choose) and pick the form that fits (missing song, wrong song or station, artist or title correction, listening link, station details, podcast or talk show), or send a pull request. Please include a source, and keep it to names and links: no lyrics, audio or game files.

To change the data:

1. Edit [`tracks.csv`](tracks.csv) for tracks, or [`station_info.json`](station_info.json) for station facts and mixes.
2. Run `python scripts/build.py`. It regenerates `tracks.json`, `docs/tracks.json`, `TRACKLIST.md` and the station table in this README.
3. Optional: run `python scripts/resolve_links.py` to look up exact links for new tracks. Spotify needs your own app's client ID and secret in `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`; Apple Music needs nothing.

## Credits

Made with help from Claude Code (Claude Opus 5.5).
