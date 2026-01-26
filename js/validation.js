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

// Validate project JSON structure (0.0.2 format)
export function validateProject(project) {
  const errors = [];

  if (!project || typeof project !== 'object') {
    return { valid: false, errors: ['Project must be an object'] };
  }

  // Check version field (support both old otio_compat and new version)
  const version = project.version || project.otio_compat;
  if (typeof version !== 'string') {
    errors.push('Missing or invalid version field');
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

// Validate legacy 0.0.1 format (no media_pool, sequential clips)
export function validateLegacyV001(project) {
  const errors = [];

  if (!project || typeof project !== 'object') {
    return { valid: false, errors: ['Project must be an object'] };
  }

  if (!project.tracks || typeof project.tracks !== 'object') {
    errors.push('Missing or invalid tracks object');
  } else {
    if (!Array.isArray(project.tracks.video)) {
      errors.push('Missing or invalid tracks.video array');
    } else {
      project.tracks.video.forEach((item, i) => {
        if (typeof item.source_url !== 'string') errors.push(`tracks.video[${i}]: missing source_url`);
        if (typeof item.duration !== 'number') errors.push(`tracks.video[${i}]: missing duration`);
      });
    }
    if (!Array.isArray(project.tracks.audio)) {
      errors.push('Missing or invalid tracks.audio array');
    } else {
      project.tracks.audio.forEach((item, i) => {
        if (typeof item.source_url !== 'string') errors.push(`tracks.audio[${i}]: missing source_url`);
        if (typeof item.duration !== 'number') errors.push(`tracks.audio[${i}]: missing duration`);
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// Validate litecut/0.0.2 URL format (with media_pool and IDs)
export function validateProjectV002(project) {
  const errors = [];

  if (!project || typeof project !== 'object') {
    return { valid: false, errors: ['Project must be an object'] };
  }

  // Check name
  if (typeof project.name !== 'string' || !project.name.trim()) {
    errors.push('Missing or invalid project name');
  }

  // Check media_pool
  if (!Array.isArray(project.media_pool)) {
    errors.push('Missing or invalid media_pool array');
  } else {
    const mediaIds = new Set();
    project.media_pool.forEach((m, i) => {
      if (typeof m.id !== 'string' || !m.id) {
        errors.push(`media_pool[${i}]: missing or invalid id`);
      } else if (mediaIds.has(m.id)) {
        errors.push(`media_pool[${i}]: duplicate id "${m.id}"`);
      } else {
        mediaIds.add(m.id);
      }
      if (typeof m.name !== 'string') errors.push(`media_pool[${i}]: missing name`);
      if (!['video', 'audio'].includes(m.type)) {
        errors.push(`media_pool[${i}]: invalid type "${m.type}" (must be video or audio)`);
      }
      if (typeof m.source_url !== 'string' || !m.source_url) {
        errors.push(`media_pool[${i}]: missing source_url`);
      }
      if (typeof m.duration !== 'number' || m.duration < 0) {
        errors.push(`media_pool[${i}]: invalid duration`);
      }
    });
  }

  // Check tracks
  if (!project.tracks || typeof project.tracks !== 'object') {
    errors.push('Missing or invalid tracks object');
  } else {
    if (!Array.isArray(project.tracks.video)) {
      errors.push('Missing or invalid tracks.video array');
    }
    if (!Array.isArray(project.tracks.audio)) {
      errors.push('Missing or invalid tracks.audio array');
    }

    // Validate clips in each track
    const validateClips = (clips, trackName) => {
      const clipIds = new Set();
      clips.forEach((clip, i) => {
        if (typeof clip.id !== 'string' || !clip.id) {
          errors.push(`tracks.${trackName}[${i}]: missing or invalid id`);
        } else if (clipIds.has(clip.id)) {
          errors.push(`tracks.${trackName}[${i}]: duplicate id "${clip.id}"`);
        } else {
          clipIds.add(clip.id);
        }
        if (typeof clip.media_id !== 'string' || !clip.media_id) {
          errors.push(`tracks.${trackName}[${i}]: missing media_id`);
        }
        if (typeof clip.start_time !== 'number' || clip.start_time < 0) {
          errors.push(`tracks.${trackName}[${i}]: invalid start_time`);
        }
        if (typeof clip.duration !== 'number' || clip.duration <= 0) {
          errors.push(`tracks.${trackName}[${i}]: invalid duration`);
        }
      });
    };

    if (Array.isArray(project.tracks.video)) {
      validateClips(project.tracks.video, 'video');
    }
    if (Array.isArray(project.tracks.audio)) {
      validateClips(project.tracks.audio, 'audio');
    }
  }

  return { valid: errors.length === 0, errors };
}

// Detect project format version and validate accordingly
export function detectAndValidateProject(project) {
  if (!project || typeof project !== 'object') {
    return { valid: false, errors: ['Project must be an object'], version: null };
  }

  // Check for legacy 0.0.1 format (no "litecut/" prefix)
  if (project.version === '0.0.1') {
    const result = validateLegacyV001(project);
    return { ...result, version: '0.0.1' };
  }

  // Check for litecut/0.0.2 URL format
  if (project.version === 'litecut/0.0.2') {
    // Could be URL format (tracks as object) or storage format (tracks as array)
    if (Array.isArray(project.tracks)) {
      const result = validateProject(project);
      return { ...result, version: 'litecut/0.0.2' };
    } else {
      const result = validateProjectV002(project);
      return { ...result, version: 'litecut/0.0.2' };
    }
  }

  // Check for legacy internal format (otio_compat: litecut/1.0)
  if (project.otio_compat) {
    const result = validateProject(project);
    return { ...result, version: 'litecut/0.0.2' }; // Treat as 0.0.2
  }

  return { valid: false, errors: ['Unknown project format'], version: null };
}

// Sanitize string for safe display
export function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength);
}
