# LiteCut Project Formats

## Quick Reference

```
0.0.1 (simple):  {version,name,media_pool:[{id,source_url,duration}],tracks:{video:[],audio:[]}}
0.0.2 (storage): {version,name,media_pool:[{id,target_url,duration}],tracks:[{kind,items:[]}]}
```

| Field | 0.0.1 | 0.0.2 |
|-------|-------|-------|
| version | `"litecut/0.0.1"` | `"litecut/0.0.2"` |
| tracks | `{video:[], audio:[]}` | `[{kind:"video", items:[]}]` |
| media url | `source_url` | `target_url` |
| clip position | `start_time` | `timeline_range.start` |
| clip reference | `media_id` | `media_ref` |

**When to use:**
- 0.0.1: Sharing projects via URL, human editing
- 0.0.2: IndexedDB storage, OTIO compatibility

---

## litecut/0.0.1 (Simple Format)

Minimal format for sharing and URL loading.

### Example

```json
{
  "version": "litecut/0.0.1",
  "name": "My Project",
  "created": "2025-01-25T12:00:00.000Z",
  "modified": "2025-01-25T12:00:00.000Z",

  "media_pool": [
    {
      "id": "media-1",
      "name": "video.mp4",
      "type": "video",
      "source_url": "https://example.com/video.mp4",
      "duration": 10.5
    },
    {
      "id": "media-2",
      "name": "audio.mp3",
      "type": "audio",
      "source_url": "audio.mp3",
      "duration": 30.0
    }
  ],

  "tracks": {
    "video": [
      {
        "id": "clip-1",
        "media_id": "media-1",
        "start_time": 0,
        "duration": 10.5,
        "trim_start": 0
      }
    ],
    "audio": [
      {
        "id": "clip-2",
        "media_id": "media-2",
        "start_time": 0,
        "duration": 30.0,
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
- `start_time`: position on timeline (seconds)
- `trim_start`: in-point offset in source media (default: 0)

---

## litecut/0.0.2 (Storage Format)

OTIO-inspired format for IndexedDB persistence.

### Example

```json
{
  "version": "litecut/0.0.2",
  "id": "project-1706184000000-abc123",
  "name": "My Project",
  "created": "2025-01-25T12:00:00.000Z",
  "modified": "2025-01-25T12:00:00.000Z",
  "rate": 30,

  "media_pool": [
    {
      "id": "media-1",
      "name": "video.mp4",
      "media_type": "video",
      "duration": 10.5,
      "target_url": "local://media-1"
    }
  ],

  "tracks": [
    {
      "id": "track-video",
      "name": "Video",
      "kind": "video",
      "items": [
        {
          "type": "clip",
          "id": "clip-1",
          "media_ref": "media-1",
          "timeline_range": {"start": 0, "duration": 10.5},
          "source_range": {"start": 0, "duration": 10.5}
        }
      ]
    },
    {
      "id": "track-audio",
      "name": "Audio",
      "kind": "audio",
      "items": []
    }
  ]
}
```

### Schema

**Root:** `{version, id, name, created?, modified?, rate?, media_pool, tracks}`

**Media item:** `{id, name, media_type, duration, target_url}`
- `media_type`: `"video"` | `"audio"`
- `target_url`: `"local://id"` for IndexedDB blobs, or full URL

**Tracks:** `Track[]` (array, not object)

**Track:** `{id, name, kind, items}`
- `kind`: `"video"` | `"audio"`

**Item:** `{type, id, media_ref, timeline_range, source_range}`
- `type`: `"clip"` (future: `"gap"`, `"transition"`)
- `timeline_range`: `{start, duration}` position on timeline
- `source_range`: `{start, duration}` range within source media

---

## Converting Between Formats

### 0.0.1 → 0.0.2

```javascript
function convertV001toV002(project) {
  return {
    version: 'litecut/0.0.2',
    id: generateId(),
    name: project.name,
    created: project.created,
    modified: project.modified,
    rate: 30,
    media_pool: project.media_pool.map(m => ({
      id: m.id,
      name: m.name,
      media_type: m.type,
      duration: m.duration,
      target_url: m.source_url
    })),
    tracks: [
      {
        id: 'track-video', name: 'Video', kind: 'video',
        items: project.tracks.video.map(c => ({
          type: 'clip',
          id: c.id,
          media_ref: c.media_id,
          timeline_range: {start: c.start_time, duration: c.duration},
          source_range: {start: c.trim_start || 0, duration: c.duration}
        }))
      },
      {
        id: 'track-audio', name: 'Audio', kind: 'audio',
        items: project.tracks.audio.map(c => ({
          type: 'clip',
          id: c.id,
          media_ref: c.media_id,
          timeline_range: {start: c.start_time, duration: c.duration},
          source_range: {start: c.trim_start || 0, duration: c.duration}
        }))
      }
    ]
  };
}
```

### 0.0.2 → 0.0.1

```javascript
function convertV002toV001(project) {
  const videoTrack = project.tracks.find(t => t.kind === 'video');
  const audioTrack = project.tracks.find(t => t.kind === 'audio');

  return {
    version: 'litecut/0.0.1',
    name: project.name,
    created: project.created,
    modified: project.modified,
    media_pool: project.media_pool.map(m => ({
      id: m.id,
      name: m.name,
      type: m.media_type,
      source_url: m.target_url.replace('local://', ''),
      duration: m.duration
    })),
    tracks: {
      video: (videoTrack?.items || []).filter(i => i.type === 'clip').map(c => ({
        id: c.id,
        media_id: c.media_ref,
        start_time: c.timeline_range.start,
        duration: c.timeline_range.duration,
        trim_start: c.source_range.start
      })),
      audio: (audioTrack?.items || []).filter(i => i.type === 'clip').map(c => ({
        id: c.id,
        media_id: c.media_ref,
        start_time: c.timeline_range.start,
        duration: c.timeline_range.duration,
        trim_start: c.source_range.start
      }))
    }
  };
}
```

---

## URL Loading

```
https://litecut.org/?project=https://example.com/project.json
```

- Only 0.0.1 format supported for URL loading
- JSON and media must have CORS headers
- Relative `source_url` resolved against JSON location

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.0.1 | 2025-01-25 | Initial simple format |
| 0.0.2 | 2025-01-26 | OTIO-inspired storage format |

---

## OTIO Comparison

| OTIO | litecut | Rationale |
|------|---------|-----------|
| RationalTime | float seconds | Browser video uses seconds |
| OTIO_SCHEMA per object | single version field | Simpler |
| Stack/Track hierarchy | flat tracks array | Only 2 tracks |
| .otio extension | .json | Standard tooling |
