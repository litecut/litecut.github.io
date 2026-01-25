// Media pool management
import { state } from './state.js';
import { fmt, generateId } from './utils.js';
import { isValidMediaUrl } from './validation.js';

// Add media item from file
export async function addMediaFromFile(file) {
  const url = URL.createObjectURL(file);
  const type = file.type.startsWith('video') ? 'video' : 'audio';

  // Get duration
  const el = document.createElement(type);
  el.src = url;
  await new Promise(r => el.onloadedmetadata = r);

  const item = {
    id: generateId(),
    name: file.name,
    type,
    url,
    file,
    duration: el.duration
  };
  state.media.push(item);
  return item;
}

// Add media item from URL
export async function addMediaFromUrl(trackUrl) {
  // Validate URL before loading
  const urlValidation = isValidMediaUrl(trackUrl);
  if (!urlValidation.valid) {
    throw new Error(urlValidation.error);
  }

  // Determine type from extension
  const ext = trackUrl.split('.').pop().toLowerCase().split('?')[0];
  const type = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext) ? 'video' :
               ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext) ? 'audio' : 'video';

  // Get filename from URL
  const name = decodeURIComponent(trackUrl.split('/').pop().split('?')[0]) || 'media';

  // Create element to get duration
  const el = document.createElement(type);
  el.crossOrigin = 'anonymous';
  el.src = trackUrl;

  await new Promise((resolve, reject) => {
    el.onloadedmetadata = resolve;
    el.onerror = () => reject(new Error('Failed to load media'));
    setTimeout(() => reject(new Error('Timeout loading media')), 15000);
  });

  const item = {
    id: generateId(),
    name,
    type,
    url: trackUrl,
    duration: el.duration,
    isRemote: true
  };
  state.media.push(item);
  return item;
}

// Render media list to DOM
export function renderMediaList(container) {
  container.innerHTML = '';
  state.media.forEach(m => {
    const div = document.createElement('div');
    div.className = 'media-item';
    div.draggable = true;
    div.dataset.id = m.id;
    // Use textContent to prevent XSS from malicious filenames
    div.textContent = `[${m.type}] ${m.name} (${fmt(m.duration)})`;
    div.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', m.id);
    });
    container.appendChild(div);
  });

  // Update empty state visibility
  const emptyState = document.getElementById('media-empty');
  if (emptyState) {
    emptyState.classList.toggle('hidden', state.media.length > 0);
  }
}

// Get media item by ID
export function getMediaById(id) {
  return state.media.find(m => m.id === id);
}
