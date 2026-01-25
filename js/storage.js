// IndexedDB storage operations
import { state } from './state.js';

const DB_NAME = 'litecut';
const DB_VERSION = 1;

// Open IndexedDB connection
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'id' });
      }
    };
  });
}

// Serialize project to OTIO-inspired format
export function serializeProject() {
  return {
    otio_compat: 'litecut/1.0',
    id: 'project-1',
    name: 'Untitled Project',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    rate: 30,

    media_pool: state.media.map(m => ({
      id: m.id,
      name: m.name,
      media_type: m.type,
      duration: m.duration,
      target_url: `local://${m.id}`
    })),

    tracks: [
      {
        id: 'track-video',
        name: 'Video',
        kind: 'video',
        items: state.clips.filter(c => c.track === 'video').map(c => ({
          type: 'clip',
          id: c.id,
          media_ref: c.mediaId,
          timeline_range: { start: c.startTime, duration: c.duration },
          source_range: { start: c.trimStart || 0, duration: c.duration }
        }))
      },
      {
        id: 'track-audio',
        name: 'Audio',
        kind: 'audio',
        items: state.clips.filter(c => c.track === 'audio').map(c => ({
          type: 'clip',
          id: c.id,
          media_ref: c.mediaId,
          timeline_range: { start: c.startTime, duration: c.duration },
          source_range: { start: c.trimStart || 0, duration: c.duration }
        }))
      }
    ]
  };
}

// Save project to IndexedDB
export async function saveProject(statusEl) {
  try {
    statusEl.textContent = 'Saving...';
    const db = await openDB();

    // Save media files (blobs)
    const mediaTx = db.transaction('media', 'readwrite');
    const mediaStore = mediaTx.objectStore('media');
    for (const m of state.media) {
      await new Promise((resolve, reject) => {
        const req = mediaStore.put({ id: m.id, name: m.name, type: m.type, file: m.file });
        req.onsuccess = resolve;
        req.onerror = reject;
      });
    }

    // Save project JSON
    const project = serializeProject();
    const projTx = db.transaction('projects', 'readwrite');
    const projStore = projTx.objectStore('projects');
    await new Promise((resolve, reject) => {
      const req = projStore.put(project);
      req.onsuccess = resolve;
      req.onerror = reject;
    });

    statusEl.textContent = `✓ Saved at ${new Date().toLocaleTimeString()}`;
    console.log('Saved project:', project);
    return project;
  } catch (err) {
    statusEl.textContent = `✗ Error: ${err.message}`;
    console.error('Save error:', err);
    throw err;
  }
}

// Load project from IndexedDB
export async function loadProject(statusEl, renderCallbacks) {
  try {
    statusEl.textContent = 'Loading...';
    const db = await openDB();

    // Load project JSON
    const projTx = db.transaction('projects', 'readonly');
    const projStore = projTx.objectStore('projects');
    const project = await new Promise((resolve, reject) => {
      const req = projStore.get('project-1');
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });

    if (!project) {
      statusEl.textContent = 'No saved project found';
      return null;
    }

    // Clear current state
    state.media.length = 0;
    state.clips.length = 0;

    // Load media files
    const mediaTx = db.transaction('media', 'readonly');
    const mediaStore = mediaTx.objectStore('media');

    for (const m of project.media_pool) {
      const localId = m.target_url.replace('local://', '');
      const stored = await new Promise((resolve, reject) => {
        const req = mediaStore.get(localId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
      });

      if (stored && stored.file) {
        const url = URL.createObjectURL(stored.file);
        state.media.push({
          id: stored.id,
          name: stored.name,
          type: stored.type,
          file: stored.file,
          url: url,
          duration: m.duration
        });
      }
    }

    // Load clips from tracks
    for (const track of project.tracks) {
      for (const item of track.items) {
        if (item.type === 'clip') {
          state.clips.push({
            id: item.id,
            mediaId: item.media_ref,
            type: track.kind,
            track: track.kind,
            startTime: item.timeline_range.start,
            duration: item.timeline_range.duration,
            trimStart: item.source_range.start
          });
        }
      }
    }

    // Update duration
    const maxEnd = state.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 30);
    state.duration = maxEnd + 5;

    // Re-render everything
    if (renderCallbacks) {
      renderCallbacks.renderMediaList();
      renderCallbacks.renderTimeline();
      renderCallbacks.renderRuler();
      renderCallbacks.updateToolbar();
    }

    statusEl.textContent = `✓ Loaded project`;
    console.log('Loaded project:', project);
    return project;
  } catch (err) {
    statusEl.textContent = `✗ Error: ${err.message}`;
    console.error('Load error:', err);
    throw err;
  }
}
