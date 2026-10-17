// LiteCut data model. A project is one JSON document that is both an OpenTimelineIO Timeline (Timeline.1 / Stack.1 / Track.1 /
// Clip.2 / Gap.1 / Marker.2) and, when it carries an @context, JSON-LD. LiteCut keeps the document itself and edits it in place:
// every field it does not understand (prompts, directions, credits, @id) is carried through untouched.
// Pure functions only (no DOM), so they run in the browser and under node for the tests.

export const VERSION = '0.0.1';

const RT = (value, rate) => ({OTIO_SCHEMA: 'RationalTime.1', value, rate});
const TR = (start, dur, rate) => ({OTIO_SCHEMA: 'TimeRange.1', start_time: RT(start, rate), duration: RT(dur, rate)});
const val = (t) => (t ? Number(t.value) : 0);
const isClip = (n) => /^Clip\./.test(n?.OTIO_SCHEMA || '');
const isGap = (n) => /^Gap\./.test(n?.OTIO_SCHEMA || '');

/** The kind of document: 'timeline' (OTIO, with or without JSON-LD), 'library' (a series listing films), 'litecut-0.0.1' or
 *  'litecut-0.0.2' (the 2025/26 proof of concept's formats), or null. */
export function detect(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (/^Timeline\./.test(doc.OTIO_SCHEMA || '')) return 'timeline';
  if (/^SerializableCollection\./.test(doc.OTIO_SCHEMA || '')) return 'collection';
  if (Array.isArray(doc['@graph']) && doc['@graph'].some((n) => n.hasPart)) return 'library';
  if (doc.version === '0.0.1' && doc.tracks && !Array.isArray(doc.tracks)) return 'litecut-0.0.1';
  if (doc.version === 'litecut/0.0.2') return 'litecut-0.0.2';
  return null;
}

/** The films a library document lists: [{name, url (the timeline), video}] resolved against base. */
export function libraryItems(doc, base) {
  const series = doc['@graph'].find((n) => n.hasPart);
  const movies = new Map(doc['@graph'].filter((n) => n['@type'] === 'Movie').map((n) => [n['@id'], n]));
  return series.hasPart.map((p) => {
    const m = movies.get(p['@id']) || {}, id = p['@id'].split('#')[0];
    return {name: m.name || id, url: new URL(id, base).href, video: m.video?.contentUrl ? new URL(m.video.contentUrl, base).href : null};
  });
}

/** The timelines inside an OTIO SerializableCollection (a series of seasons of episodes), depth first: [{name, path, doc}]. */
export function collectionItems(doc, trail = []) {
  const out = [];
  for (const c of doc.children || []) {
    if (/^Timeline\./.test(c.OTIO_SCHEMA || '')) out.push({name: [...trail, c.name].filter(Boolean).join(' / '), doc: c});
    else if (/^SerializableCollection\./.test(c.OTIO_SCHEMA || '')) out.push(...collectionItems(c, [...trail, c.name]));
  }
  return out;
}

/** The editable view of a timeline document: lanes of clips with absolute start frames (gaps resolved), plus markers. Clip
 *  objects keep a reference to their node in the document, so edits land in the document. */
export function fromTimeline(doc, base = '') {
  const tracks = doc.tracks?.children || [];
  let fps = 30;
  for (const t of tracks) for (const c of t.children || []) if (c.source_range?.duration?.rate) { fps = c.source_range.duration.rate; break; }
  const video = doc.video?.contentUrl || doc.associatedMedia?.contentUrl || firstMedia(tracks.find((t) => t.kind === 'Video'));
  const lanes = [], markers = [];
  let duration = 0;
  tracks.forEach((t, i) => {
    let pos = 0;
    const clips = [];
    for (const n of t.children || []) {
      const d = val(n.source_range?.duration);
      if (isGap(n)) { pos += d; continue; }
      if (!isClip(n)) continue;
      const url = mediaUrl(n);
      clips.push({start: pos, dur: d, node: n, film: !!url && !!video && sameMedia(url, video)});
      for (const m of n.markers || []) {
        const ms = val(m.marked_range?.start_time) - val(n.source_range?.start_time) + pos;
        markers.push({start: ms, dur: val(m.marked_range?.duration), name: m.name, color: m.color, type: m['@type'] || '', node: m});
      }
      pos += d;
    }
    duration = Math.max(duration, pos);
    lanes.push({id: t['@id'] || `track-${i}`, name: t.name || `Track ${i + 1}`, kind: t.kind || 'Video', clips, node: t, mute: false, solo: false});
  });
  return {doc, base, fps, duration, video: video ? resolve(video, base) : null, lanes, markers};
}

export function resolve(u, base) { try { return new URL(u, base || undefined).href; } catch { return u; } }
function firstMedia(track) { const c = (track?.children || []).find(isClip); return c ? mediaUrl(c) : null; }
export function mediaUrl(n) {
  const refs = n.media_references, key = n.active_media_reference_key || 'DEFAULT_MEDIA';
  return (refs && refs[key]?.target_url) || n.media_reference?.target_url || n.contentUrl || null;
}
const sameMedia = (a, b) => a.split('/').pop() === b.split('/').pop();

/** Write the lanes back into the document: each track's children become its clips in order with Gaps between them. Film-backed
 *  clips (whose media is the film itself) keep their source start equal to their timeline start, so they stay in sync. */
export function toTimeline(model) {
  const {doc, fps} = model;
  for (const lane of model.lanes) {
    const kids = [];
    let pos = 0;
    for (const c of [...lane.clips].sort((a, b) => a.start - b.start)) {
      const start = Math.max(c.start, pos);
      if (start > pos) kids.push({OTIO_SCHEMA: 'Gap.1', source_range: TR(0, start - pos, fps)});
      const src = c.film ? start : val(c.node.source_range?.start_time);
      c.node.source_range = TR(src, c.dur, fps);
      kids.push(c.node);
      pos = start + c.dur;
    }
    lane.node.children = kids;
  }
  return doc;
}

// ── edits: each returns nothing and changes the model; the caller snapshots for undo ──

/** An anchor such as "line:L7+33" or "beat:B3_x" (where an effect was written against the script): shift its offset. */
export function shiftAnchor(anchor, delta) {
  const m = /^([^+]+?)(?:\+(-?\d+))?$/.exec(anchor || '');
  if (!m) return anchor;
  const off = (Number(m[2]) || 0) + delta;
  return off ? `${m[1]}+${off}` : m[1];
}

export function moveClip(model, clip, toStart) {
  const to = Math.max(0, Math.round(toStart)), delta = to - clip.start;
  if (!delta) return;
  if (clip.node.anchor) clip.node.anchor = shiftAnchor(clip.node.anchor, delta);
  clip.start = to;
}

export function trimClip(model, clip, side, frames) {
  const f = Math.round(frames);
  if (side === 'start') {
    const d = Math.max(-clip.start, Math.min(f, clip.dur - 1));
    clip.start += d; clip.dur -= d;
    if (!clip.film && clip.node.source_range) {
      const s = val(clip.node.source_range.start_time) + d;
      clip.node.source_range = TR(Math.max(0, s), clip.dur, model.fps);
    }
    if (clip.node.anchor) clip.node.anchor = shiftAnchor(clip.node.anchor, d);
  } else clip.dur = Math.max(1, clip.dur + f);
}

export function splitClip(model, lane, clip, at) {
  const cut = Math.round(at) - clip.start;
  if (cut <= 0 || cut >= clip.dur) return null;
  const node2 = JSON.parse(JSON.stringify(clip.node));
  if (node2['@id']) node2['@id'] += `/split-${Date.now().toString(36)}`;
  if (node2.anchor) node2.anchor = shiftAnchor(node2.anchor, cut);
  const src = val(clip.node.source_range?.start_time);
  node2.source_range = TR(clip.film ? clip.start + cut : src + cut, clip.dur - cut, model.fps);
  const c2 = {start: clip.start + cut, dur: clip.dur - cut, node: node2, film: clip.film};
  clip.dur = cut;
  lane.clips.splice(lane.clips.indexOf(clip) + 1, 0, c2);
  return c2;
}

export function deleteClip(model, lane, clip) { lane.clips.splice(lane.clips.indexOf(clip), 1); }

// ── the proof of concept's formats, read once and turned into a timeline ──

/** litecut 0.0.1 (sequential items) or 0.0.2 (media pool + start times) -> an OTIO Timeline document. */
export function fromLegacy(doc, kind) {
  const fps = 30, F = (s) => Math.round((Number(s) || 0) * fps);
  const lanes = {video: [], audio: []};
  if (kind === 'litecut-0.0.1') {
    for (const k of ['video', 'audio']) {
      let t = 0;
      for (const it of doc.tracks[k] || []) { const s = it.start_time ?? t; lanes[k].push({name: it.name, url: it.source_url, start: F(s), dur: F(it.duration), trim: 0}); t = s + Number(it.duration || 0); }
    }
  } else {
    const pool = new Map((doc.media_pool || []).map((m) => [m.id, m]));
    const tracks = Array.isArray(doc.tracks) ? Object.fromEntries(doc.tracks.map((t) => [t.kind, t.items])) : doc.tracks;
    for (const k of ['video', 'audio']) for (const c of tracks[k] || []) {
      const m = pool.get(c.media_id || c.media_ref) || {};
      const s = c.start_time ?? c.timeline_range?.start ?? 0, d = c.duration ?? c.timeline_range?.duration ?? m.duration;
      lanes[k].push({name: m.name, url: m.source_url || m.target_url, start: F(s), dur: F(d), trim: F(c.trim_start ?? c.source_range?.start ?? 0)});
    }
  }
  const track = (name, kind, items) => {
    const kids = []; let pos = 0;
    for (const it of items.sort((a, b) => a.start - b.start)) {
      if (it.start > pos) kids.push({OTIO_SCHEMA: 'Gap.1', source_range: TR(0, it.start - pos, fps)});
      kids.push({OTIO_SCHEMA: 'Clip.2', name: it.name || it.url, source_range: TR(it.trim, it.dur, fps),
        media_references: {DEFAULT_MEDIA: {OTIO_SCHEMA: 'ExternalReference.1', target_url: it.url}}, active_media_reference_key: 'DEFAULT_MEDIA'});
      pos = Math.max(pos, it.start) + it.dur;
    }
    return {OTIO_SCHEMA: 'Track.1', name, kind, children: kids};
  };
  return {OTIO_SCHEMA: 'Timeline.1', name: doc.name || 'Imported project', global_start_time: RT(0, fps),
    tracks: {OTIO_SCHEMA: 'Stack.1', children: [track('Video', 'Video', lanes.video), track('Audio', 'Audio', lanes.audio)]}};
}

/** A single video by URL (?track=...) as a one-clip timeline; its duration is filled in once the video's metadata loads. */
export function fromVideo(url, seconds = 0, fps = 30) {
  return {OTIO_SCHEMA: 'Timeline.1', name: decodeURIComponent(url.split('/').pop() || 'video'), global_start_time: RT(0, fps),
    video: {contentUrl: url},
    tracks: {OTIO_SCHEMA: 'Stack.1', children: [{OTIO_SCHEMA: 'Track.1', name: 'Picture', kind: 'Video', children: [
      {OTIO_SCHEMA: 'Clip.2', name: 'video', source_range: TR(0, Math.round(seconds * fps), fps),
        media_references: {DEFAULT_MEDIA: {OTIO_SCHEMA: 'ExternalReference.1', target_url: url}}, active_media_reference_key: 'DEFAULT_MEDIA'}]}]}};
}

/** What the inspector shows for a clip: the human-meaningful fields of its node, prompts and directions first. */
export function describe(node) {
  const out = [];
  const add = (label, value, path, edit = false) => { if (value !== undefined && value !== null && value !== '') out.push({label, value, path, edit}); };
  add('Type', node['@type']);
  add('Text', node.text, ['text'], true);
  add('Prompt', node.isBasedOn?.text, ['isBasedOn', 'text'], true);
  add('Direction', node.description, ['description'], true);
  add('Speaker', node.spokenByCharacter?.['@id']?.split('#char/').pop());
  add('Voice', node.actor?.['@id']?.split('/voice/').pop());
  add('Anchor', node.anchor, ['anchor'], true);
  add('Gain', node.gain, ['gain'], true);
  add('Effect', node.kind);
  add('Made with', node.creator?.name);
  add('Credit', node.creditText || node.isBasedOn?.creditText);
  add('Location', node.location);
  add('Media', mediaUrl(node));
  add('@id', node['@id']);
  return out;
}

export function setPath(node, path, value) {
  let o = node;
  for (const k of path.slice(0, -1)) o = o[k] ??= {};
  const last = path[path.length - 1];
  o[last] = typeof o[last] === 'number' ? Number(value) : value;
}
