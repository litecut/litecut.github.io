# LiteCut

Lightweight browser-based video editor. No install, no build step, just open and edit.

**[Try it now at litecut.org](https://litecut.org)**

## Features

- Import video/audio files
- Timeline with drag & drop
- Split clips (S key)
- Delete clips (Del key)
- Save/load projects locally
- Load from URL: `?track=https://example.com/video.mp4`
- OTIO-inspired project format
- Solid Pod ready

## Usage

Just open `index.html` in a browser, or:

```bash
npx serve .
```

### Query Parameters

Load a video directly:
```
https://litecut.org?track=https://example.com/video.mp4
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| S | Split at playhead |
| Delete | Delete selected clip |
| Escape | Deselect |
| Ctrl+S | Save project |

## Project Format

LiteCut uses an OTIO-inspired JSON format:

```json
{
  "otio_compat": "litecut/1.0",
  "media_pool": [...],
  "tracks": [...]
}
```

## License

AGPL-3.0-or-later
