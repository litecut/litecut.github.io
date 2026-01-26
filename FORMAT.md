# LiteCut Project Formats

## Quick Reference

```
0.0.1 (legacy):  {version:"0.0.1", tracks:{video:[{source_url,duration}]}}        — sequential, no IDs
0.0.2 (current): {version:"litecut/0.0.2", media_pool:[], tracks:{video:[{id,media_id,start_time}]}}
```

| Field | 0.0.1 (legacy) | 0.0.2 (current) |
|-------|----------------|-----------------|
| version | `"0.0.1"` | `"litecut/0.0.2"` |
| media_pool | none (inline) | separate array |
| clip IDs | none | required |
| positioning | sequential | explicit `start_time` |
| trimming | none | `trim_start` |
| codec metadata | yes | no |

---

## 0.0.1 (Legacy Format)

Original format from ffmpeg-based tooling. Clips are sequential (no timeline positioning).

### Example

```json
{
  "version": "0.0.1",
  "created": "2025-09-15T17:38:02.995Z",
  "name": "Compiled Media Timeline",
  "tracks": {
    "video": [
      {
        "name": "input1.mp4",
        "source_url": "input1.mp4",
        "duration": 10.17,
        "width": 1370,
        "height": 768,
        "codec_name": "h264",
        "frame_rate": null
      },
      {
        "name": "input2.mp4",
        "source_url": "input2.mp4",
        "duration": 10.17,
        "width": 1370,
        "height": 768,
        "codec_name": "h264",
        "frame_rate": null
      }
    ],
    "audio": [
      {
        "name": "audio1.mp3",
        "source_url": "audio1.mp3",
        "duration": 19.96,
        "codec_name": "mp3",
        "sample_rate": "44100",
        "channels": 2
      }
    ]
  }
}
```

### Schema

**Root:** `{version, name, created?, tracks}`

**Tracks:** `{video: Item[], audio: Item[]}`

**Item:** `{name, source_url, duration, ...metadata}`
- Items are played sequentially (no start_time)
- Optional: `width`, `height`, `codec_name`, `frame_rate`, `sample_rate`, `channels`
- Optional: `start_time` (if present, overrides sequential positioning)

---

## 0.0.2 (Current Format)

LiteCut native format with media pool, clip IDs, and timeline positioning.

### Example

```json
{
  "version": "litecut/0.0.2",
  "name": "My Project",
  "created": "2025-01-25T12:00:00.000Z",
  "modified": "2025-01-25T12:00:00.000Z",

  "media_pool": [
    {
      "id": "media-1",
      "name": "input1.mp4",
      "type": "video",
      "source_url": "input1.mp4",
      "duration": 10.17
    },
    {
      "id": "media-2",
      "name": "audio1.mp3",
      "type": "audio",
      "source_url": "audio1.mp3",
      "duration": 19.96
    }
  ],

  "tracks": {
    "video": [
      {
        "id": "clip-1",
        "media_id": "media-1",
        "start_time": 0,
        "duration": 10.17,
        "trim_start": 0
      }
    ],
    "audio": [
      {
        "id": "clip-2",
        "media_id": "media-2",
        "start_time": 0,
        "duration": 19.96,
        "trim_start": 0
      }
    ]
  }
}
```

### Schema

**Root:** `{version, name, created?, modified?, media_pool, tracks}`

**Media item:** `{id, name, type, source_url, duration}`
- `type`: `"video"` | `"audio"`
- `source_url`: absolute or relative to JSON file

**Tracks:** `{video: Clip[], audio: Clip[]}`

**Clip:** `{id, media_id, start_time, duration, trim_start?}`
- `media_id`: references media_pool item
- `start_time`: position on timeline (seconds)
- `trim_start`: in-point offset in source media (default: 0)

---

## Converting 0.0.1 → 0.0.2

```javascript
function convertV001toV002(project) {
  let videoTime = 0;
  let audioTime = 0;
  const media = [];
  const videoClips = [];
  const audioClips = [];

  // Convert video items
  project.tracks.video.forEach((item, i) => {
    const mediaId = `media-v${i}`;
    media.push({
      id: mediaId,
      name: item.name,
      type: 'video',
      source_url: item.source_url,
      duration: item.duration
    });
    const startTime = item.start_time ?? videoTime;
    videoClips.push({
      id: `clip-v${i}`,
      media_id: mediaId,
      start_time: startTime,
      duration: item.duration,
      trim_start: 0
    });
    videoTime = startTime + item.duration;
  });

  // Convert audio items
  project.tracks.audio.forEach((item, i) => {
    const mediaId = `media-a${i}`;
    media.push({
      id: mediaId,
      name: item.name,
      type: 'audio',
      source_url: item.source_url,
      duration: item.duration
    });
    const startTime = item.start_time ?? audioTime;
    audioClips.push({
      id: `clip-a${i}`,
      media_id: mediaId,
      start_time: startTime,
      duration: item.duration,
      trim_start: 0
    });
    audioTime = startTime + item.duration;
  });

  return {
    version: 'litecut/0.0.2',
    name: project.name,
    created: project.created,
    modified: new Date().toISOString(),
    media_pool: media,
    tracks: { video: videoClips, audio: audioClips }
  };
}
```

---

## URL Loading

```
https://litecut.org/?project=https://example.com/project.json
```

- Both 0.0.1 and 0.0.2 supported for URL loading
- JSON and media must have CORS headers
- Relative `source_url` resolved against JSON location

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.0.1 | 2025-09 | Legacy format from ffmpeg tooling |
| 0.0.2 | 2025-01 | LiteCut native with media_pool, IDs, positioning |

---

## Internal Storage Format

For IndexedDB persistence, 0.0.2 is extended with OTIO-inspired structure:

```json
{
  "version": "litecut/0.0.2",
  "id": "project-1706184000000-abc123",
  "media_pool": [{
    "id": "media-1",
    "name": "video.mp4",
    "media_type": "video",
    "duration": 10.5,
    "target_url": "local://media-1"
  }],
  "tracks": [{
    "id": "track-video",
    "kind": "video",
    "items": [{
      "type": "clip",
      "id": "clip-1",
      "media_ref": "media-1",
      "timeline_range": {"start": 0, "duration": 10.5},
      "source_range": {"start": 0, "duration": 10.5}
    }]
  }]
}
```

Key differences from URL format:
- `target_url: "local://id"` for IndexedDB blob references
- `tracks` is array with `kind` field (not object)
- Clips use `timeline_range`/`source_range` objects
