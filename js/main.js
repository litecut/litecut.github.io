// Main entry point - initializes the application
import { state, PX_PER_SEC, selectClip, resetState } from './state.js';
import { fmt } from './utils.js';
import { addMediaFromFile, addMediaFromUrl, renderMediaList, getMediaById } from './media.js';
import { renderRuler, renderTimeline, addClip, deleteSelectedClip, splitAtPlayhead, getClipAtTime, getNextClip, canSplit } from './timeline.js';
import { saveProject, loadProject, listProjects, loadProjectFromUrl } from './storage.js';

// DOM Elements
const fileInput = document.getElementById('file-input');
const mediaList = document.getElementById('media-list');
const video = document.getElementById('preview');
const audio = document.createElement('audio');
const timeDisplay = document.getElementById('time-display');
const timeline = document.getElementById('timeline');
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

console.log('LITECUT canvas=1');

// Canvas for seamless transitions
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.id = 'transition-canvas';
canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;pointer-events:none;';
video.parentNode.style.position = 'relative';
video.parentNode.appendChild(canvas);

function showCanvasFreeze() {
  // Capture current frame to canvas
  canvas.width = video.videoWidth || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.style.display = 'block';
}

function hideCanvas() {
  canvas.style.display = 'none';
}

// Simple playback state
let videoClips = [];
let audioClips = [];
let clipIndex = -1;

// Load clips from state
function loadClips() {
  videoClips = state.clips.filter(c => c.track === 'video').sort((a, b) => a.startTime - b.startTime);
  audioClips = state.clips.filter(c => c.track === 'audio').sort((a, b) => a.startTime - b.startTime);
}

// Get URL for a video clip
function getVideoUrl(index) {
  if (index < 0 || index >= videoClips.length) return null;
  const media = getMediaById(videoClips[index].mediaId);
  return media ? media.url : null;
}

// Get URL for first audio clip (simple: just one audio track)
function getAudioUrl() {
  if (audioClips.length === 0) return null;
  const media = getMediaById(audioClips[0].mediaId);
  return media ? media.url : null;
}

// Play a specific video clip
let lastLoadedUrl = null;
let isTransitioning = false;

function playVideoClip(index, useCanvasMask = false) {
  loadClips();
  if (index < 0 || index >= videoClips.length) return;

  const url = getVideoUrl(index);
  if (!url) return;

  console.log(`playVideoClip(${index}): mask=${useCanvasMask}`);

  // Skip if already loaded this exact URL
  if (url === lastLoadedUrl) {
    clipIndex = index;
    return;
  }

  // Freeze frame during transition
  if (useCanvasMask && video.readyState >= 2) {
    showCanvasFreeze();
    isTransitioning = true;
  }

  clipIndex = index;
  lastLoadedUrl = url;
  video.src = url;
  video.currentTime = videoClips[index].trimStart || 0;
  updatePreviewEmpty();
}

// Hide canvas when video starts playing (wait for frame to paint)
video.addEventListener('playing', () => {
  if (isTransitioning) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hideCanvas();
        isTransitioning = false;
      });
    });
  }
});

// Initialize audio (load once)
function initAudio() {
  const url = getAudioUrl();
  if (!url) return;

  // Only set src if different (avoid reload)
  const needsLoad = !audio.src.endsWith(url.split('/').pop());
  if (needsLoad) {
    console.log(`initAudio: ${url}`);
    audio.src = url;
  }
}

// When video ends, play next with canvas masking
video.addEventListener('ended', () => {
  console.log(`video ended, clipIndex=${clipIndex}`);
  if (clipIndex + 1 < videoClips.length) {
    playVideoClip(clipIndex + 1, true);  // Use canvas mask for seamless transition
    video.play();
  }
});

// Sync time display and playhead
video.addEventListener('timeupdate', () => {
  const clip = videoClips[clipIndex];
  if (clip) {
    state.currentTime = clip.startTime + video.currentTime - (clip.trimStart || 0);
  } else {
    state.currentTime = video.currentTime;
  }
  timeDisplay.textContent = `${fmt(state.currentTime)} / ${fmt(state.duration)}`;
  playhead.style.left = `${10 + state.currentTime * PX_PER_SEC}px`;
  updateToolbar();
});

// Sync audio with video
video.addEventListener('play', () => {
  if (audio.src) {
    audio.currentTime = state.currentTime;
    audio.play();
  }
});
video.addEventListener('pause', () => audio.pause());

// Update preview empty state
function updatePreviewEmpty() {
  const hasSource = video.src && video.src !== '' && video.src !== window.location.href;
  previewEmpty.classList.toggle('hidden', hasSource);
}

// Update project name display
function updateProjectName() {
  projectNameEl.textContent = state.projectName;
}

// Render callbacks
const renderCallbacks = {
  renderMediaList: () => renderMediaList(mediaList),
  renderTimeline: () => renderTimeline(videoTrack, audioTrack, handleSelectClip),
  renderRuler: () => renderRuler(ruler),
  updateToolbar,
  updateProjectName
};

// Update toolbar button states
function updateToolbar() {
  btnDelete.disabled = !state.selectedClipId;
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
    if (!confirm('Create a new project? Unsaved changes will be lost.')) return;
  }
  resetState();
  clipIndex = -1;
  videoClips = [];
  audioClips = [];
  video.src = '';
  video.removeAttribute('src');
  audio.src = '';
  audio.removeAttribute('src');
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
    return `<div class="dropdown-item${isCurrent ? ' current' : ''}" data-id="${p.id}">
      <span>${p.name}</span>
      <span class="project-date">${date}</span>
    </div>`;
  }).join('');

  projectListEl.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', async () => {
      projectListEl.classList.remove('show');
      await loadProject(saveStatus, renderCallbacks, item.dataset.id);
      loadClips();
      initAudio();
      playVideoClip(0);
    });
  });
}

// Toggle project list dropdown
function toggleProjectList() {
  if (projectListEl.classList.contains('show')) {
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
      loadClips();
      if (newClip.track === 'video') {
        const idx = videoClips.findIndex(c => c.id === newClip.id);
        if (idx >= 0) playVideoClip(idx);
      } else {
        initAudio();
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

// Timeline click to seek
timeline.addEventListener('click', (e) => {
  if (e.target.classList.contains('clip')) return;
  const rect = timeline.getBoundingClientRect();
  const x = e.clientX - rect.left - 10;
  const time = Math.max(0, x / PX_PER_SEC);

  loadClips();
  const idx = videoClips.findIndex(c => time >= c.startTime && time < c.startTime + c.duration);
  if (idx >= 0) {
    if (idx !== clipIndex) playVideoClip(idx);
    const clip = videoClips[idx];
    video.currentTime = (clip.trimStart || 0) + (time - clip.startTime);
  }

  state.currentTime = time;
  playhead.style.left = `${10 + time * PX_PER_SEC}px`;
  updateToolbar();

  // Sync audio
  if (audio.src) audio.currentTime = time;

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
      if (video.paused) video.play();
      else video.pause();
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

  const projectUrl = params.get('project');
  if (projectUrl) {
    try {
      await loadProjectFromUrl(projectUrl, saveStatus, renderCallbacks);
      updateProjectName();
      loadClips();
      initAudio();
      playVideoClip(0);
    } catch (err) {
      console.error('Failed to load project:', err);
    }
    return;
  }

  const trackUrl = params.get('track');
  if (!trackUrl) return;

  saveStatus.textContent = 'Loading from URL...';
  try {
    const item = await addMediaFromUrl(trackUrl);
    addClip(item.id, item.type, 0);
    renderCallbacks.renderMediaList();
    renderCallbacks.renderTimeline();
    renderCallbacks.renderRuler();
    loadClips();
    if (item.type === 'video') playVideoClip(0);
    else initAudio();
    saveStatus.textContent = `Loaded: ${item.name}`;
  } catch (err) {
    saveStatus.textContent = `Error loading URL: ${err.message}`;
    console.error('Failed to load track:', err);
  }
}

// Initialize
loadFromQueryString();
