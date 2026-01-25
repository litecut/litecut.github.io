// Main entry point - initializes the application
import { state, PX_PER_SEC, selectClip } from './state.js';
import { fmt } from './utils.js';
import { addMediaFromFile, addMediaFromUrl, renderMediaList, getMediaById } from './media.js';
import { renderRuler, renderTimeline, addClip, deleteSelectedClip, splitAtPlayhead, getClipAtTime, canSplit } from './timeline.js';
import { saveProject, loadProject } from './storage.js';

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
const btnSave = document.getElementById('btn-save');
const btnLoad = document.getElementById('btn-load');
const saveStatus = document.getElementById('save-status');

// Render callbacks for passing to other modules
const renderCallbacks = {
  renderMediaList: () => renderMediaList(mediaList),
  renderTimeline: () => renderTimeline(videoTrack, audioTrack, handleSelectClip),
  renderRuler: () => renderRuler(ruler),
  updateToolbar
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

// Initialize
renderCallbacks.renderRuler();
renderCallbacks.renderTimeline(); // Initialize empty state visibility
renderCallbacks.renderMediaList(); // Initialize empty state visibility

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
btnSave.addEventListener('click', () => saveProject(saveStatus));
btnLoad.addEventListener('click', () => loadProject(saveStatus, renderCallbacks).then(() => {
  const firstVideo = state.media.find(m => m.type === 'video');
  if (firstVideo) preview.src = firstVideo.url;
}));

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
      saveProject(saveStatus);
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
