# VI Radio DB

A list of the radio stations in Grand Theft Auto VI (Xbox Series build 1.0.2.1) and the songs, artists and shows on each one.

It contains **names only**: station names, artist names and song titles. It has no audio, no lyrics, no game files and no data copied out of the game's archives. It's a fan project and isn't affiliated with Rockstar Games or Take-Two Interactive.

## Files

| File | What it holds |
|---|---|
| [`TRACKLIST.md`](TRACKLIST.md) | Every station with its tracks, easy to read |
| [`tracks.csv`](tracks.csv) | One row per track: `station, kind, artist, title, confidence` |
| [`tracks.json`](tracks.json) | The same data, grouped by station |

853 entries across 21 music stations, plus talk shows and podcasts. Artist names keep the game's own spelling, which is often all capitals.

## How the stations were matched

The song titles and artists come from the game's English text, where each track has a numbered title and artist entry. The numbers fall into blocks of 100, one block per track list.

Each block was then matched to a station in one of three ways:

- **The order of the music records in the audio config.** The stations' music sits in contiguous runs, and those runs follow the alphabetical order of the stations' internal names. For most stations, the position and the genre agree.
- **The genre of the artists.** Classical music goes to Symphony FM, blues to Gloriana Blues Radio, and so on.
- **The station records in the audio config**, used for VCRR.

The internal station names are mapped to the on-screen names (Flash FM, Emotion 98.3, …) through the game's text labels.

### Confidence

| Level | Meaning |
|---|---|
| **high** | The record order and the artists' genre agree, or the names match outright (podcasts) |
| **medium** | One source of evidence only, or a station whose on-screen name couldn't be found |
| **low** | Best guess from genre. The order in the config disagrees, or there is no record to check against |

If you know a placement is wrong, open an issue or a PR with the source.

## Known gaps

- **No track list found:** Thrillbilly Mud Club Radio, The Vault Radio, The Wipe and WKTT. Some of these are probably DJ mixes or talk, not separate songs.
- **Unassigned block:** one block of house and techno DJ tracks doesn't match any station yet. It's listed as "Unassigned".
- **Unlockable extras:** some stations have extra songs that unlock later in the game. Those that use the same numbering are included under their station without being marked as extras.
- **Incomplete entries:** four tracks have an artist but no title in the game text, and one has a title but no artist.
- **Not covered:** this list says which songs a station has. It says nothing about the order they play in.

## Credits

Put together with help from Claude Code (Claude Opus 5.5).
