# LiteCut Project Format Specification

## Version: litecut/0.0.1

This document describes the JSON format used by LiteCut for project files.

## Design Principles

The litecut format is inspired by [OpenTimelineIO (OTIO)](https://opentimelineio.readthedocs.io/) but simplified for browser-based editing:

| Principle | Implementation |
|-----------|----------------|
| Human readable | Indented JSON, descriptive field names |
| Self-contained | All media references are URLs (no binary embedding) |
| Version aware | Top-level `version` field for format evolution |
| Minimal | Only essential fields, no redundant nesting |

## Schema

### Root Object

```json
{
  "version": "litecut/0.0.1",
  "name": "Project Name",
  "created": "2025-01-25T12:00:00.000Z",
  "modified": "2025-01-25T12:00:00.000Z",
  "media_pool": [...],
  "tracks": {...}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Format version, must be `"litecut/0.0.1"` |
| `name` | string | Yes | Project display name |
| `created` | string | No | ISO 8601 creation timestamp |
| `modified` | string | No | ISO 8601 last modified timestamp |
| `media_pool` | array | Yes | Array of media items |
| `tracks` | object | Yes | Track containers |

### Media Pool Item

```json
{
  "id": "media-1",
  "name": "video.mp4",
  "type": "video",
  "source_url": "https://example.com/video.mp4",
  "duration": 120.5
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for referencing in clips |
| `name` | string | Yes | Display name |
| `type` | string | Yes | Either `"video"` or `"audio"` |
| `source_url` | string | Yes | URL to media file (absolute or relative) |
| `duration` | number | Yes | Duration in seconds |

#### URL Resolution

- **Absolute URLs**: Used as-is (e.g., `https://example.com/video.mp4`)
- **Relative URLs**: Resolved relative to the project JSON file location

### Tracks Object

```json
{
  "video": [...],
  "audio": [...]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `video` | array | Yes | Array of video track clips |
| `audio` | array | Yes | Array of audio track clips |

### Clip Object

```json
{
  "id": "clip-1",
  "media_id": "media-1",
  "start_time": 0,
  "duration": 10.5,
  "trim_start": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique clip identifier |
| `media_id` | string | Yes | Reference to media pool item `id` |
| `start_time` | number | Yes | Position on timeline in seconds |
| `duration` | number | Yes | Clip duration in seconds |
| `trim_start` | number | No | In-point offset from media start (default: 0) |

## Complete Example

```json
{
  "version": "litecut/0.0.1",
  "name": "My Video Project",
  "created": "2025-01-25T12:00:00.000Z",
  "modified": "2025-01-25T14:30:00.000Z",

  "media_pool": [
    {
      "id": "media-1",
      "name": "intro.mp4",
      "type": "video",
      "source_url": "https://cdn.example.com/intro.mp4",
      "duration": 5.0
    },
    {
      "id": "media-2",
      "name": "main-content.mp4",
      "type": "video",
      "source_url": "main-content.mp4",
      "duration": 120.0
    },
    {
      "id": "media-3",
      "name": "background-music.mp3",
      "type": "audio",
      "source_url": "audio/bgm.mp3",
      "duration": 180.0
    }
  ],

  "tracks": {
    "video": [
      {
        "id": "clip-1",
        "media_id": "media-1",
        "start_time": 0,
        "duration": 5.0,
        "trim_start": 0
      },
      {
        "id": "clip-2",
        "media_id": "media-2",
        "start_time": 5.0,
        "duration": 60.0,
        "trim_start": 30.0
      }
    ],
    "audio": [
      {
        "id": "clip-3",
        "media_id": "media-3",
        "start_time": 0,
        "duration": 65.0,
        "trim_start": 0
      }
    ]
  }
}
```

## Loading via Query String

Projects can be loaded via URL:

```
https://litecut.org/?project=https://example.com/my-project.json
```

## CORS Requirements

When loading projects from remote URLs:

- The project JSON file must be served with appropriate CORS headers
- Media files referenced in `source_url` must also allow cross-origin access
- For local development, use a local server or data URLs

## Differences from OTIO

| OTIO | litecut/0.0.1 | Rationale |
|------|---------------|-----------|
| `OTIO_SCHEMA` per object | Single `version` field | Simpler for small projects |
| RationalTime (rate + value) | Float seconds | Browser video uses seconds |
| Stack → Track hierarchy | Flat `tracks.video[]` | Only 2 tracks needed |
| MediaReference objects | `source_url` string | Direct URL loading |
| `.otio` extension | `.json` extension | Standard JSON tooling |

## Version History

### litecut/0.0.1 (2025-01-25)

- Initial format specification
- Basic media pool and clip support
- Video and audio track support
- URL-based media references

## Future Considerations (post-0.0.1)

- Frame rate support for precise timing
- Transitions between clips
- Effects metadata
- Markers and annotations
- Nested sequences
