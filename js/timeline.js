// Timeline rendering and clip management
import { state, PX_PER_SEC } from './state.js';
import { fmt, generateId } from './utils.js';
import { getMediaById } from './media.js';

// Render ruler with time markers
export function renderRuler(rulerEl) {
  rulerEl.innerHTML = '';
  for (let t = 0; t <= state.duration; t += 5) {
    const mark = document.createElement('div');
    mark.className = 'ruler-mark';
    mark.style.left = `${t * PX_PER_SEC}px`;
    mark.textContent = fmt(t);
    rulerEl.appendChild(mark);
  }
}

// Render all clips on timeline
export function renderTimeline(videoTrack, audioTrack, onSelect) {
  // Clear existing clips
  document.querySelectorAll('.clip').forEach(el => el.remove());

  state.clips.forEach(clip => {
    const mediaItem = getMediaById(clip.mediaId);
    if (!mediaItem) return;

    const trackEl = clip.track === 'video' ? videoTrack : audioTrack;

    const div = document.createElement('div');
    div.className = `clip ${clip.track}${clip.id === state.selectedClipId ? ' selected' : ''}`;
    div.textContent = mediaItem.name;
    div.style.left = `${clip.startTime * PX_PER_SEC}px`;
    div.style.width = `${clip.duration * PX_PER_SEC}px`;
    div.dataset.id = clip.id;

    // Click to select
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(clip.id);
    });

    // Draggable within timeline
    div.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startLeft = clip.startTime * PX_PER_SEC;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        clip.startTime = Math.max(0, (startLeft + dx) / PX_PER_SEC);
        div.style.left = `${clip.startTime * PX_PER_SEC}px`;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    trackEl.appendChild(div);
  });

  // Update track hint visibility
  const videoHint = document.getElementById('video-hint');
  const audioHint = document.getElementById('audio-hint');
  const hasVideoClips = state.clips.some(c => c.track === 'video');
  const hasAudioClips = state.clips.some(c => c.track === 'audio');

  if (videoHint) videoHint.classList.toggle('hidden', hasVideoClips);
  if (audioHint) audioHint.classList.toggle('hidden', hasAudioClips);
}

// Add clip to timeline
export function addClip(mediaId, trackType, startTime) {
  const mediaItem = getMediaById(mediaId);
  if (!mediaItem) return null;

  const clip = {
    id: generateId(),
    mediaId,
    type: mediaItem.type,
    startTime,
    duration: mediaItem.duration,
    track: trackType
  };
  state.clips.push(clip);

  // Extend duration if needed
  const newDuration = Math.max(state.duration, startTime + mediaItem.duration + 5);
  if (newDuration > state.duration) {
    state.duration = newDuration;
  }

  return clip;
}

// Delete selected clip
export function deleteSelectedClip() {
  if (!state.selectedClipId) return false;
  const idx = state.clips.findIndex(c => c.id === state.selectedClipId);
  if (idx !== -1) {
    state.clips.splice(idx, 1);
    state.selectedClipId = null;
    return true;
  }
  return false;
}

// Split clip at playhead position
export function splitAtPlayhead() {
  const clip = state.clips.find(c =>
    state.currentTime > c.startTime && state.currentTime < c.startTime + c.duration
  );
  if (!clip) return false;

  const splitPoint = state.currentTime - clip.startTime;
  const originalDuration = clip.duration;

  // Shorten original clip
  clip.duration = splitPoint;

  // Create new clip for the right part
  const newClip = {
    id: generateId(),
    mediaId: clip.mediaId,
    type: clip.type,
    startTime: state.currentTime,
    duration: originalDuration - splitPoint,
    track: clip.track,
    trimStart: (clip.trimStart || 0) + splitPoint
  };
  state.clips.push(newClip);

  return true;
}

// Get clip at specific time
export function getClipAtTime(time, trackType = null) {
  return state.clips.find(c =>
    (trackType === null || c.type === trackType) &&
    time >= c.startTime &&
    time < c.startTime + c.duration
  );
}

// Get next clip after a given time on a track
export function getNextClip(time, trackType) {
  const trackClips = state.clips
    .filter(c => c.type === trackType && c.startTime >= time)
    .sort((a, b) => a.startTime - b.startTime);
  return trackClips[0] || null;
}

// Check if playhead is over a clip
export function canSplit() {
  return state.clips.some(c =>
    state.currentTime > c.startTime && state.currentTime < c.startTime + c.duration
  );
}
