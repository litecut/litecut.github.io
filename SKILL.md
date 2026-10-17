---
name: litecut
description: Make films, timelines and libraries that open in LiteCut (litecut.org). Use when writing an OpenTimelineIO + JSON-LD timeline by hand or from a pipeline, publishing it to a web server or Solid pod, listing several films in a catalogue, or bringing LiteCut edits back into a build.
---

# Making things for LiteCut

LiteCut is a light browser editor. It opens one kind of document, a **timeline** that is both OpenTimelineIO (OTIO) and
JSON-LD, from any URL. You make the film however you like; the timeline says what is in it and where. Full field list:
[FORMAT.md](FORMAT.md). A working example: [examples/minimal.jsonld](examples/minimal.jsonld).

## 1. Make the timeline

Start from `examples/minimal.jsonld` and change it. The rules:

- The top is an OTIO `Timeline.1` with an `@context` (so it is also JSON-LD), an `@type` of `Movie`, a `name`, and
  `video.contentUrl`, the rendered film LiteCut plays under the lanes.
- `tracks.children` are the lanes, top to bottom. Each is a `Track.1` with a `name` and a `kind` of `Video` or `Audio`.
- A lane's `children` are `Clip.2` and `Gap.1` in order. **A clip's place is the sum of the durations before it**: to start a
  clip at frame 120, put a 120-frame gap before it. All times are `RationalTime.1` frames at one `rate` (e.g. 30).
- Each clip has `source_range` (in-point and duration in its media) and a media reference:
  `media_references.DEFAULT_MEDIA.target_url` with `active_media_reference_key: "DEFAULT_MEDIA"`.
- Give every clip an `@id` (`#line/L1`, `#shot/3`, `#fx/7`). Edits and the round trip match clips by it.
- URLs are relative to the timeline's own URL.

What to put on a clip (all optional, all kept through edits):

| You have | Write |
|---|---|
| a spoken line | `@type: "Quotation"`, `text` (the words), `description` (the acting direction), `spokenByCharacter: {name}`, the voice file as media |
| a generated shot | `isBasedOn: {"@type": "CreativeWork", "text": "<the prompt>"}`, `creator` (the model) |
| a sound effect | `kind`, `gain` (0–1), `anchor` (where it belongs in the script, e.g. `line:L7+33`), the effect file as media |
| a recording you used | `creditText`, `license`, `author`, so the inspector can credit it |
| a clip cut from the film itself | the film as media and `source_range.start_time` equal to its place, or `aligned: true` |

Any other field is fine: LiteCut shows what it knows and writes back the rest unchanged.

## 2. Make the sound play live (optional)

LiteCut plays every Audio clip from its own file, so edits are heard. Without separate files it plays the film's sound.

- Use web formats (`.m4a`, `.mp3`, `.ogg`, `.wav`).
- For a full mix, cut stems (dialogue, music, ambience) to the film's length as clips at 0 with `aligned: true`, and put each
  effect as its own clip.
- If effect gains are written for your own mixer, set `effectsGain` on the timeline: the factor that brings `gain` × file to
  the level heard in the film.

## 3. Check it

- **OTIO**: `python -c "import opentimelineio as otio; print(otio.adapters.read_from_file('f.jsonld', adapter_name='otio_json').duration())"`
- **JSON**: valid, one document, no local paths (`/home/...`, `../../`).
- **LiteCut**: open `https://litecut.org/?project=<url of the timeline>`. Every lane should show; click a clip to see its
  words, prompt and credits; Play should say `Live mix: N sound files` if you did step 2.

## 4. Publish

Put the timeline, the film and the media on any web server or Solid pod that sends CORS headers
(`Access-Control-Allow-Origin` for `https://litecut.org`). Share
`https://litecut.org/?project=<timeline url>`. **Save to pod** in LiteCut writes the edited timeline back with HTTP PUT
when the viewer may write there.

## 5. List several films

Pick one:

- **A catalogue** (best): `library.jsonld`, a schema.org `ItemList`. Each item: `name`, `url` (the timeline),
  `thumbnailUrl` (1200×630 works well), `duration` (`PT59S`), `description` (one line), `keywords` (shown as filter chips),
  `video.contentUrl`. Write it from your pipeline every time you publish, so it never goes stale.
  Example: https://melvin.me/public/aesop/library.jsonld
- **A pod folder**: put timelines in a folder on a Solid pod (no `index.html` in it); open the folder URL ending in `/`.

Open it with `https://litecut.org/?library=<url>`, or **Add a library or pod folder…** in the library switcher.

## 6. Bring edits back

LiteCut's **Download** or **Save to pod** gives the same document with the edits in it: clips moved (new gaps), trimmed
(`source_range`), split (new `@id`s), deleted, and changed `text`, `description`, `gain`. Compare it with your original by
`@id` and turn the differences into your pipeline's own inputs (moved effects into new anchors, new words into the script),
then rebuild. Aesop's `tools/litecut_import.py` is one example of this.

## Pitfalls

- A clip's start is never stored: it comes from the gaps. Writing a `start` field does nothing.
- Missing CORS headers show as an empty library or `No playable sound files`.
- Effects written at `gain: 1.0` play at full file level times `effectsGain`; keep files normalised.
- Don't reuse an `@id` within one timeline.
