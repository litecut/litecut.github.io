# LiteCut

A light browser video editor for timelines that are both **OpenTimelineIO** and **JSON-LD**. No install, no build step.

**[litecut.org](https://litecut.org)**

LiteCut shows a film as lanes (picture, shots, dialogue, score, ambience, effects, generated clips) over the playing video, with
each clip's prompt, direction and credits beside it. Move, trim, split and delete clips; edit a line's direction or a clip's prompt;
save in the browser, download, or save back to the URL it came from (a Solid pod).

Open anything made before:

| What | How |
|---|---|
| an OTIO timeline (`.otio`, Resolve, Kdenlive, ...) | `?project=<url>`, Open URL, or File |
| an OTIO + JSON-LD timeline (e.g. an Aesop fable) | `?project=https://melvin.me/public/aesop/fox-and-stork/fox-and-stork.jsonld` |
| an OTIO collection (a series of episodes, e.g. DAY 10) | `?project=<url>`: the episodes appear in the library |
| a library of films (a JSON-LD series with `hasPart`) | `?library=<url>`; the default is the Aesop library |
| a single video | `?track=<video url>` |
| LiteCut 0.0.x projects (the 2025/26 proof of concept) | opened and converted to a timeline |

The data model is in [FORMAT.md](FORMAT.md).

## Keys

Space play/pause · S split at the playhead · Delete delete · drag a clip to move it · drag its edges to trim · Ctrl+Z undo · Ctrl+S save

## Run

Open `index.html` through any static server (`npx serve .`). Tests: `node test/model.test.mjs <timeline.jsonld>`.

## Deployments

LiteCut is the general tool; [Aesop](https://melvin.me/public/aesop/) is one deployment of it (100 short films whose timelines
are OTIO + JSON-LD).

## License

AGPL-3.0-or-later

Making films, timelines and libraries for LiteCut (for people and AI agents): [SKILL.md](SKILL.md).
