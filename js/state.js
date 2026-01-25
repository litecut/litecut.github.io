// State management module
export const state = {
  media: [],
  clips: [],
  currentTime: 0,
  duration: 30,
  selectedClipId: null
};

export const PX_PER_SEC = 20;

export function selectClip(clipId, renderTimeline, updateToolbar) {
  state.selectedClipId = clipId;
  renderTimeline();
  updateToolbar();
}
