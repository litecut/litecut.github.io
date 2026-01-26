// IndexedDB storage operations
import { state } from './state.js';
import { validateProject, validateProjectV001, detectAndValidateProject } from './validation.js';
import { generateId } from './utils.js';

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

// Generate unique project ID
function generateProjectId() {
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Serialize project to OTIO-inspired format
export function serializeProject() {
  // Generate ID if new project
  if (!state.projectId) {
    state.projectId = generateProjectId();
  }

  return {
    version: 'litecut/0.0.2',
    id: state.projectId,
    name: state.projectName,
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

// List all saved projects
export async function listProjects() {
  const db = await openDB();
  const tx = db.transaction('projects', 'readonly');
  const store = tx.objectStore('projects');

  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const projects = req.result.map(p => ({
        id: p.id,
        name: p.name,
        modified: p.modified
      }));
      // Sort by modified date, newest first
      projects.sort((a, b) => new Date(b.modified) - new Date(a.modified));
      resolve(projects);
    };
    req.onerror = reject;
  });
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

    statusEl.textContent = `✓ Saved "${state.projectName}" at ${new Date().toLocaleTimeString()}`;
    console.log('Saved project:', project);
    return project;
  } catch (err) {
    statusEl.textContent = `✗ Error: ${err.message}`;
    console.error('Save error:', err);
    throw err;
  }
}

// Load project from IndexedDB by ID
export async function loadProject(statusEl, renderCallbacks, projectId = null) {
  try {
    statusEl.textContent = 'Loading...';
    const db = await openDB();

    // If no projectId specified, get the most recent project
    if (!projectId) {
      const projects = await listProjects();
      if (projects.length === 0) {
        statusEl.textContent = 'No saved projects found';
        return null;
      }
      projectId = projects[0].id;
    }

    // Load project JSON
    const projTx = db.transaction('projects', 'readonly');
    const projStore = projTx.objectStore('projects');
    const project = await new Promise((resolve, reject) => {
      const req = projStore.get(projectId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });

    if (!project) {
      statusEl.textContent = 'Project not found';
      return null;
    }

    // Validate project structure
    const validation = validateProject(project);
    if (!validation.valid) {
      console.error('Invalid project structure:', validation.errors);
      statusEl.textContent = `✗ Invalid project: ${validation.errors[0]}`;
      return null;
    }

    // Clear current state
    state.media.length = 0;
    state.clips.length = 0;

    // Set project info
    state.projectId = project.id;
    state.projectName = project.name || 'Untitled Project';

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
      if (renderCallbacks.updateProjectName) {
        renderCallbacks.updateProjectName();
      }
    }

    statusEl.textContent = `✓ Loaded "${state.projectName}"`;
    console.log('Loaded project:', project);
    return project;
  } catch (err) {
    statusEl.textContent = `✗ Error: ${err.message}`;
    console.error('Load error:', err);
    throw err;
  }
}

// Delete a project by ID
export async function deleteProject(projectId) {
  const db = await openDB();
  const tx = db.transaction('projects', 'readwrite');
  const store = tx.objectStore('projects');

  return new Promise((resolve, reject) => {
    const req = store.delete(projectId);
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

// Resolve relative URL against base URL
function resolveUrl(sourceUrl, baseUrl) {
  try {
    // If it's already absolute, return as-is
    new URL(sourceUrl);
    return sourceUrl;
  } catch (e) {
    // Relative URL - resolve against base
    if (baseUrl) {
      const base = new URL(baseUrl);
      // Get directory of base URL
      const baseDir = base.href.substring(0, base.href.lastIndexOf('/') + 1);
      return new URL(sourceUrl, baseDir).href;
    }
    return sourceUrl;
  }
}

// Build media item from JSON (trust the duration from JSON, don't preload)
function buildMediaItem(mediaItem, baseUrl) {
  const url = resolveUrl(mediaItem.source_url, baseUrl);
  return {
    id: mediaItem.id,
    name: mediaItem.name,
    type: mediaItem.type,
    url: url,
    duration: mediaItem.duration,
    isRemote: true
  };
}

// Load project from remote URL (litecut/0.0.1 format)
export async function loadProjectFromUrl(projectUrl, statusEl, renderCallbacks) {
  try {
    statusEl.textContent = 'Fetching project...';

    // Fetch the project JSON
    const response = await fetch(projectUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const project = await response.json();

    // Detect and validate format
    const validation = detectAndValidateProject(project);
    if (!validation.valid) {
      console.error('Project validation errors:', validation.errors);
      throw new Error(validation.errors[0]);
    }

    if (validation.version !== 'litecut/0.0.1') {
      throw new Error(`Unsupported format: ${validation.version}`);
    }

    statusEl.textContent = 'Loading project...';

    // Clear current state
    state.media.length = 0;
    state.clips.length = 0;
    state.selectedClipId = null;

    // Set project info (generate new ID for remote projects)
    state.projectId = generateId();
    state.projectName = project.name;

    // Build media items from JSON (no preloading)
    for (const m of project.media_pool) {
      state.media.push(buildMediaItem(m, projectUrl));
    }

    // Load clips from tracks
    for (const clip of project.tracks.video) {
      state.clips.push({
        id: clip.id,
        mediaId: clip.media_id,
        type: 'video',
        track: 'video',
        startTime: clip.start_time,
        duration: clip.duration,
        trimStart: clip.trim_start || 0
      });
    }

    for (const clip of project.tracks.audio) {
      state.clips.push({
        id: clip.id,
        mediaId: clip.media_id,
        type: 'audio',
        track: 'audio',
        startTime: clip.start_time,
        duration: clip.duration,
        trimStart: clip.trim_start || 0
      });
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
      if (renderCallbacks.updateProjectName) {
        renderCallbacks.updateProjectName();
      }
    }

    statusEl.textContent = `Loaded "${state.projectName}" from URL`;
    console.log('Loaded project from URL:', project);
    return project;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error('Load from URL error:', err);
    throw err;
  }
}
