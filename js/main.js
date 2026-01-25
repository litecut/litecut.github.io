// Main entry point - initializes the application
import { state, PX_PER_SEC, selectClip, resetState } from './state.js';
import { fmt } from './utils.js';
import { addMediaFromFile, addMediaFromUrl, renderMediaList, getMediaById } from './media.js';
import { renderRuler, renderTimeline, addClip, deleteSelectedClip, splitAtPlayhead, getClipAtTime, getNextClip, canSplit } from './timeline.js';
import { saveProject, loadProject, listProjects, loadProjectFromUrl } from './storage.js';

// DOM Elements
const fileInput = document.getElementById('file-input');
const mediaList = document.getElementById('media-list');
const preview = document.getElementById('preview');
const timeDisplay = document.getElementById('time-display');
const timeline = document.getElementById('timeline');

console.log('LITECUT change=6');

// Dual video for seamless playback
const videoB = document.createElement('video');
videoB.id = 'preview-b';
videoB.controls = true;
videoB.style.display = 'none';
preview.parentNode.insertBefore(videoB, preview.nextSibling);

let activeVideo = preview;
let nextVideo = videoB;
let clipIndex = -1;
let clips = [];

function loadClips() {
  clips = state.clips.filter(c => c.track === 'video').sort((a, b) => a.startTime - b.startTime);
}

function getClipUrl(index) {
  if (index < 0 || index >= clips.length) return null;
  const media = getMediaById(clips[index].mediaId);
  return media ? media.url : null;
}

function playClip(index) {
  loadClips();
  if (index < 0 || index >= clips.length) return;

  console.log(`playClip(${index})`);
  clipIndex = index;

  // First clip - just load and play
  if (activeVideo.src === '' || !activeVideo.src.includes(getClipUrl(index)?.split('/').pop())) {
    activeVideo.src = getClipUrl(index);
    activeVideo.currentTime = clips[index].trimStart || 0;
  }

  // Preload next into the other video
  const nextUrl = getClipUrl(index + 1);
  if (nextUrl) {
    nextVideo.src = nextUrl;
    nextVideo.load();
  }

  updatePreviewEmpty();
}

function swapToNext() {
  if (clipIndex + 1 >= clips.length) return;

  console.log(`swapToNext: ${clipIndex} -> ${clipIndex + 1}`);
  clipIndex++;

  // Swap videos
  activeVideo.style.display = 'none';
  activeVideo.pause();

  nextVideo.style.display = 'block';
  nextVideo.currentTime = clips[clipIndex].trimStart || 0;
  nextVideo.play();

  // Swap references
  [activeVideo, nextVideo] = [nextVideo, activeVideo];

  // Preload next
  const nextUrl = getClipUrl(clipIndex + 1);
  if (nextUrl) {
    nextVideo.src = nextUrl;
    nextVideo.load();
  }
}
const playhead = document.getElementById('playhead');
const ruler = document.getElementById('ruler');
const videoTrack = document.getElementById('video-track');
const audioTrack = document.getElementById('audio-track');
const btnSplit = document.getElementById('btn-split');
const btnDelete = document.getElementById('btn-delete');
const btnNew = document.getElementById('btn-new');
const btnSave = document.getElementById('btn-save');
const btnLoad = document.getElementById('btn-load');
const btnRename = document.getElementById('btn-rename');
const projectNameEl = document.getElementById('project-name');
const projectListEl = document.getElementById('project-list');
const saveStatus = document.getElementById('save-status');
const previewEmpty = document.getElementById('preview-empty');

// Update project name display
function updateProjectName() {
  projectNameEl.textContent = state.projectName;
}

// Update preview empty state visibility
function updatePreviewEmpty() {
  const hasSource = activeVideo.src && activeVideo.src !== '' && activeVideo.src !== window.location.href;
  previewEmpty.classList.toggle('hidden', hasSource);
}

// Render callbacks for passing to other modules
const renderCallbacks = {
  renderMediaList: () => renderMediaList(mediaList),
  renderTimeline: () => renderTimeline(videoTrack, audioTrack, handleSelectClip),
  renderRuler: () => renderRuler(ruler),
  updateToolbar,
  updateProjectName
};

// Update toolbar button states
function updateToolbar() {
  const hasSelection = state.selectedClipId !== null;
  btnDelete.disabled = !hasSelection;
  btnSplit.disabled = !canSplit();
}

// Handle clip selection
function handleSelectClip(clipId) {
  selectClip(clipId, renderCallbacks.renderTimeline, updateToolbar);
}

// Handle delete action
function handleDelete() {
  if (!state.selectedClipId) return;

  if (!confirm('Delete this clip?')) return;

  if (deleteSelectedClip()) {
    renderCallbacks.renderTimeline();
    updateToolbar();
  }
}

// Handle split action
function handleSplit() {
  if (splitAtPlayhead()) {
    renderCallbacks.renderTimeline();
    updateToolbar();
  }
}

// Handle new project
function handleNew() {
  if (state.media.length > 0 || state.clips.length > 0) {
    if (!confirm('Create a new project? Unsaved changes will be lost.')) {
      return;
    }
  }
  resetState();
  clipIndex = -1;
  clips = [];
  preview.src = '';
  preview.removeAttribute('src');
  videoB.src = '';
  videoB.removeAttribute('src');
  activeVideo = preview;
  nextVideo = videoB;
  preview.style.display = 'block';
  videoB.style.display = 'none';
  updatePreviewEmpty();
  renderCallbacks.renderMediaList();
  renderCallbacks.renderTimeline();
  renderCallbacks.renderRuler();
  updateProjectName();
  saveStatus.textContent = '';
}

// Handle rename project
function handleRename() {
  const newName = prompt('Enter project name:', state.projectName);
  if (newName && newName.trim()) {
    state.projectName = newName.trim();
    updateProjectName();
    saveStatus.textContent = 'Project renamed (save to persist)';
  }
}

// Render project list dropdown
async function renderProjectList() {
  const projects = await listProjects();

  if (projects.length === 0) {
    projectListEl.innerHTML = '<div class="dropdown-empty">No saved projects</div>';
    return;
  }

  projectListEl.innerHTML = projects.map(p => {
    const date = new Date(p.modified).toLocaleDateString();
    const isCurrent = p.id === state.projectId;
    return `
      <div class="dropdown-item${isCurrent ? ' current' : ''}" data-id="${p.id}">
        <span>${p.name}</span>
        <span class="project-date">${date}</span>
      </div>
    `;
  }).join('');

  // Add click handlers
  projectListEl.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', async () => {
      const projectId = item.dataset.id;
      projectListEl.classList.remove('show');
      await loadProject(saveStatus, renderCallbacks, projectId);
      playClip(0);
    });
  });
}

// Toggle project list dropdown
function toggleProjectList() {
  const isShowing = projectListEl.classList.contains('show');
  if (isShowing) {
    projectListEl.classList.remove('show');
  } else {
    renderProjectList();
    projectListEl.classList.add('show');
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    projectListEl.classList.remove('show');
  }
});

// Initialize
renderCallbacks.renderRuler();
renderCallbacks.renderTimeline();
renderCallbacks.renderMediaList();
updateProjectName();
updatePreviewEmpty();

// File input handler
fileInput.addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    await addMediaFromFile(file);
    renderCallbacks.renderMediaList();
  }
});

// Track drop handlers
[videoTrack, audioTrack].forEach(track => {
  track.addEventListener('dragover', (e) => e.preventDefault());
  track.addEventListener('drop', (e) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('text/plain');
    const mediaItem = getMediaById(mediaId);
    if (!mediaItem) return;

    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startTime = x / PX_PER_SEC;

    const newClip = addClip(mediaId, track.dataset.type, startTime);
    if (newClip) {
      renderCallbacks.renderTimeline();
      renderCallbacks.renderRuler();
      if (newClip.track === 'video') {
        loadClips();
        const idx = clips.findIndex(c => c.id === newClip.id);
        if (idx >= 0) playClip(idx);
      }
    }
  });
});

// Button handlers
btnSplit.addEventListener('click', handleSplit);
btnDelete.addEventListener('click', handleDelete);
btnNew.addEventListener('click', handleNew);
btnRename.addEventListener('click', handleRename);
btnSave.addEventListener('click', async () => {
  await saveProject(saveStatus);
  updateProjectName();
});
btnLoad.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleProjectList();
});

// Time update - move playhead
function onTimeUpdate() {
  const clip = clips[clipIndex];
  state.currentTime = clip ? clip.startTime + activeVideo.currentTime : activeVideo.currentTime;
  timeDisplay.textContent = `${fmt(state.currentTime)} / ${fmt(state.duration)}`;
  playhead.style.left = `${10 + state.currentTime * PX_PER_SEC}px`;
  updateToolbar();
}
preview.addEventListener('timeupdate', onTimeUpdate);
videoB.addEventListener('timeupdate', onTimeUpdate);

// Video ended - swap to preloaded next
preview.addEventListener('ended', swapToNext);
videoB.addEventListener('ended', swapToNext);

// Timeline click to seek
timeline.addEventListener('click', (e) => {
  if (e.target.classList.contains('clip')) return;
  const rect = timeline.getBoundingClientRect();
  const x = e.clientX - rect.left - 10;
  const time = Math.max(0, x / PX_PER_SEC);

  loadClips();
  const idx = clips.findIndex(c => time >= c.startTime && time < c.startTime + c.duration);
  if (idx >= 0) {
    if (idx !== clipIndex) playClip(idx);
    activeVideo.currentTime = time - clips[idx].startTime;
  }

  state.currentTime = time;
  playhead.style.left = `${10 + time * PX_PER_SEC}px`;
  updateToolbar();

  if (e.target === timeline || e.target.classList.contains('track')) {
    handleSelectClip(null);
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  if (e.ctrlKey || e.metaKey) {
    if (e.code === 'KeyS') {
      e.preventDefault();
      saveProject(saveStatus).then(() => updateProjectName());
      return;
    }
    if (e.code === 'KeyN') {
      e.preventDefault();
      handleNew();
      return;
    }
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (activeVideo.paused) activeVideo.play();
      else activeVideo.pause();
      break;
    case 'KeyS':
      e.preventDefault();
      handleSplit();
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      handleDelete();
      break;
    case 'Escape':
      handleSelectClip(null);
      projectListEl.classList.remove('show');
      break;
  }
});

// Load from query string
async function loadFromQueryString() {
  const params = new URLSearchParams(window.location.search);

  // Check for project URL first (litecut/0.0.1 format)
  const projectUrl = params.get('project');
  if (projectUrl) {
    try {
      await loadProjectFromUrl(projectUrl, saveStatus, renderCallbacks);
      updateProjectName();
      playClip(0); // Start with first video clip
    } catch (err) {
      console.error('Failed to load project:', err);
    }
    return;
  }

  // Check for single track URL (simple mode)
  const trackUrl = params.get('track');
  if (!trackUrl) return;

  saveStatus.textContent = 'Loading from URL...';

  try {
    const item = await addMediaFromUrl(trackUrl);
    addClip(item.id, item.type, 0);

    renderCallbacks.renderMediaList();
    renderCallbacks.renderTimeline();
    renderCallbacks.renderRuler();

    playClip(0);
    saveStatus.textContent = `Loaded: ${item.name}`;
  } catch (err) {
    saveStatus.textContent = `Error loading URL: ${err.message}`;
    console.error('Failed to load track:', err);
  }
}

// Initialize
loadFromQueryString();
