# LiteCut format

One document, two readings.

- **OpenTimelineIO.** The document is an OTIO `Timeline.1` (or a `SerializableCollection.1` of timelines). Tracks
  (`Track.1`, kind `Video` or `Audio`) hold `Clip.2` and `Gap.1` children in order; a clip's place on the timeline is the sum of
  what comes before it. Times are `RationalTime.1` frames (`rate` is the frame rate). Markers (`Marker.2`) sit on clips. Any OTIO
  reader (opentimelineio's `otio_json` adapter) opens it.
- **JSON-LD.** With an `@context`, the same nodes are linked data: the timeline is a `Movie`, clips have an `@id`, dialogue clips
  are `Quotation`s with `spokenByCharacter` and an `actor`, generated clips carry `isBasedOn` (the prompt) and `creator` (the
  model), recordings carry their licence and author. OTIO ignores these keys; LiteCut shows them and keeps them.

LiteCut edits the document in place: fields it does not know are carried through unchanged, and a load followed by a save with no
edits writes the same document back.

## Fields LiteCut reads

| On | Field | Meaning |
|---|---|---|
| Timeline | `video.contentUrl` (or the first video clip's media) | the film to play under the lanes |
| Clip | `media_references[active_media_reference_key].target_url` | the clip's media |
| Clip | `source_range` | in-point and duration in the media |
| Clip | `text`, `description` | a line's words, its acting direction |
| Clip | `isBasedOn.text` | the prompt a generated clip was made from |
| Clip | `anchor` | where an effect was written against the script, e.g. `line:L7+33`: moving the clip shifts the offset |
| Clip | `gain` | an effect's level |

## Film-backed clips

When a clip's media is the film itself (shots, dialogue, score cut from the rendered film), its `source_range.start_time` equals
its place on the timeline, and LiteCut keeps it so.

## Older LiteCut projects

`{"version": "0.0.1", "tracks": {"video": [...], "audio": [...]}}` and `{"version": "litecut/0.0.2", "media_pool": [...], ...}`
open and become a two-track timeline.
