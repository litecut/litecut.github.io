// Input validation module

// Validate URL format and protocol
export function isValidMediaUrl(urlString) {
  try {
    const url = new URL(urlString);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Only HTTP/HTTPS URLs are allowed' };
    }
    // Check for valid media extension
    const ext = url.pathname.split('.').pop().toLowerCase();
    const validExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'm4a', 'flac'];
    if (!validExts.includes(ext)) {
      return { valid: false, error: `Unsupported file type: .${ext}` };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

// Validate project JSON structure
export function validateProject(project) {
  const errors = [];

  if (!project || typeof project !== 'object') {
    return { valid: false, errors: ['Project must be an object'] };
  }

  // Check required fields
  if (typeof project.otio_compat !== 'string') {
    errors.push('Missing or invalid otio_compat field');
  }

  if (!Array.isArray(project.media_pool)) {
    errors.push('Missing or invalid media_pool array');
  } else {
    project.media_pool.forEach((m, i) => {
      if (typeof m.id !== 'string') errors.push(`media_pool[${i}]: missing id`);
      if (typeof m.name !== 'string') errors.push(`media_pool[${i}]: missing name`);
      if (typeof m.duration !== 'number' || m.duration < 0) errors.push(`media_pool[${i}]: invalid duration`);
    });
  }

  if (!Array.isArray(project.tracks)) {
    errors.push('Missing or invalid tracks array');
  } else {
    project.tracks.forEach((track, i) => {
      if (typeof track.kind !== 'string') errors.push(`tracks[${i}]: missing kind`);
      if (!Array.isArray(track.items)) errors.push(`tracks[${i}]: missing items array`);
      else {
        track.items.forEach((item, j) => {
          if (item.type === 'clip') {
            if (typeof item.id !== 'string') errors.push(`tracks[${i}].items[${j}]: missing id`);
            if (typeof item.media_ref !== 'string') errors.push(`tracks[${i}].items[${j}]: missing media_ref`);
            if (!item.timeline_range || typeof item.timeline_range.start !== 'number') {
              errors.push(`tracks[${i}].items[${j}]: invalid timeline_range`);
            }
          }
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

// Sanitize string for safe display
export function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength);
}
