// Utility functions

// Format seconds to M:SS
export function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Generate unique ID
export function generateId() {
  return Math.random().toString(36).slice(2);
}
