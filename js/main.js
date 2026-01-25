// Main entry point - initializes the application
import { state, PX_PER_SEC, selectClip, resetState } from './state.js';
import { fmt } from './utils.js';
import { addMediaFromFile, addMediaFromUrl, renderMediaList, getMediaById } from './media.js';
import { renderRuler, renderTimeline, addClip, deleteSelectedClip, splitAtPlayhead, getClipAtTime, canSplit } from './timeline.js';
import { saveProject, loadProject, listProjects } from './storage.js';

// DOM Elements
const fileInput = document.getElementById('file-input');
const mediaList = document.getElementById('media-list');
const preview = document.getElementById('preview');
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

// Update project name display
function updateProjectName() {
  projectNameEl.textContent = state.projectName;
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
  preview.src = '';
  preview.removeAttribute('src');
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
      const firstVideo = state.media.find(m => m.type === 'video');
      if (firstVideo) preview.src = firstVideo.url;
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

    const clip = addClip(mediaId, track.dataset.type, startTime);
    if (clip) {
      renderCallbacks.renderTimeline();
      renderCallbacks.renderRuler();
      preview.src = mediaItem.url;
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

// Video time updates
preview.addEventListener('timeupdate', () => {
  const activeClip = state.clips.find(c => {
    const m = getMediaById(c.mediaId);
    return m && preview.src.includes(m.url.split('/').pop());
  });

  if (activeClip) {
    state.currentTime = activeClip.startTime + preview.currentTime;
  } else {
    state.currentTime = preview.currentTime;
  }

  timeDisplay.textContent = `${fmt(state.currentTime)} / ${fmt(state.duration)}`;
  playhead.style.left = `${10 + state.currentTime * PX_PER_SEC}px`;
  updateToolbar();
});

// Timeline click to seek
timeline.addEventListener('click', (e) => {
  if (e.target.classList.contains('clip')) return;
  const rect = timeline.getBoundingClientRect();
  const x = e.clientX - rect.left - 10;
  const time = Math.max(0, x / PX_PER_SEC);

  const clip = getClipAtTime(time, 'video');
  if (clip) {
    const mediaItem = getMediaById(clip.mediaId);
    if (mediaItem && preview.src !== mediaItem.url) {
      preview.src = mediaItem.url;
    }
    preview.currentTime = time - clip.startTime;
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
      if (preview.paused) preview.play();
      else preview.pause();
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
  const trackUrl = params.get('track');

  if (!trackUrl) return;

  saveStatus.textContent = 'Loading from URL...';

  try {
    const item = await addMediaFromUrl(trackUrl);
    const clip = addClip(item.id, item.type, 0);

    renderCallbacks.renderMediaList();
    renderCallbacks.renderTimeline();
    renderCallbacks.renderRuler();

    preview.src = trackUrl;
    saveStatus.textContent = `✓ Loaded: ${item.name}`;
  } catch (err) {
    saveStatus.textContent = `✗ Error loading URL: ${err.message}`;
    console.error('Failed to load track:', err);
  }
}

// Initialize
loadFromQueryString();
