// State management module
export const state = {
  media: [],
  clips: [],
  currentTime: 0,
  duration: 30,
  selectedClipId: null,
  projectId: null,
  projectName: 'Untitled Project'
};

// Reset state for new project
export function resetState() {
  state.media.length = 0;
  state.clips.length = 0;
  state.currentTime = 0;
  state.duration = 30;
  state.selectedClipId = null;
  state.projectId = null;
  state.projectName = 'Untitled Project';
}

// Calculate pixels per second based on container width
export function getPxPerSec(containerWidth) {
  const padding = 20; // Some padding on right side
  return (containerWidth - padding) / state.duration;
}

// Default for when container not available
export const PX_PER_SEC = 20;

export function selectClip(clipId, renderTimeline, updateToolbar) {
  state.selectedClipId = clipId;
  renderTimeline();
  updateToolbar();
}
