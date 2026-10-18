// LiteCut's live mix: every clip on an audio lane plays from its own media (stems, effect files) at its place on the timeline,
// with mute/solo, so an edit is heard. While the mix is ready the film plays muted; until then (or with no audio media) the film's
// own sound plays. Web Audio, decoded buffers, rescheduled on play, seek and edit.
import {mediaUrl, resolve} from './model.js';

export function createMix(video, getModel, status) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const cache = new Map();          // url -> Promise<AudioBuffer|null>
  let playing = [], ready = false, epoch = 0, gen = 0;  // gen: a start() superseded by a later start() or stop() schedules nothing

  const audioClips = (m) => {
    const anySolo = m.lanes.some((l) => l.solo), out = [];
    for (const l of m.lanes) {
      if (l.kind !== 'Audio') continue;
      for (const c of l.clips) {
        const u = mediaUrl(c.node); if (!u) continue;
        const url = resolve(u, m.base);
        if (m.video && url.split('?')[0] === m.video.split('?')[0]) continue;  // cut from the film itself: no separate sound
        out.push({lane: l, clip: c, url, audible: !l.mute && (!anySolo || l.solo)});
      }
    }
    return out;
  };
  const buffer = (url) => {
    if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? ctx.decodeAudioData(b) : null)).catch((e) => { console.warn('LiteCut: cannot play', url, e?.message || e); return null; }));
    return cache.get(url);
  };

  async function prepare() {
    const m = getModel(); ready = false; video.muted = false;
    const clips = audioClips(m), urls = [...new Set(clips.map((c) => c.url))];
    if (!urls.length) return;
    const my = ++epoch;
    let done = 0;
    status(`Loading sound 0/${urls.length}`);
    const bufs = await Promise.all(urls.map((u) => buffer(u).then((b) => { status(`Loading sound ${++done}/${urls.length}`); return b; })));
    if (my !== epoch) return;
    const ok = bufs.filter(Boolean).length;
    ready = ok > 0; video.muted = ready;
    status(ready ? `Live mix: ${ok} sound file${ok === 1 ? '' : 's'}` : 'No playable sound files: playing the film’s own sound');
    if (!video.paused) start();
  }

  function stop() { gen++; for (const s of playing) { try { s.stop(); } catch {} } playing = []; }

  async function start() {
    stop();
    if (!ready) return;
    const my = gen;  // two starts can overlap (play, then the rewind's seeked): only the last one may schedule, or the mix plays twice
    const m = getModel(), t0 = video.currentTime, fps = m.fps, fxGain = Number(m.doc.effectsGain) || 1;
    if (ctx.state === 'suspended') await ctx.resume();
    if (my !== gen) return;
    const now = ctx.currentTime + 0.05;
    for (const a of audioClips(m)) {
      if (!a.audible) continue;
      const buf = await buffer(a.url); if (my !== gen) return; if (!buf) continue;
      const s = a.clip.start / fps, d = a.clip.dur / fps, end = s + d;
      if (end <= t0) continue;
      const src0 = Number(a.clip.node.source_range?.start_time?.value || 0) / fps;  // the clip's in-point in its media
      const into = Math.max(0, t0 - s), off = src0 + into, len = Math.min(d - into, buf.duration - off);
      if (len <= 0) continue;
      const g = ctx.createGain();
      g.gain.value = a.clip.node.gain !== undefined ? Number(a.clip.node.gain) * fxGain : 1;
      const node = ctx.createBufferSource(); node.buffer = buf; node.connect(g).connect(ctx.destination);
      node.start(now + Math.max(0, s - t0), off, len);
      playing.push(node);
    }
  }

  video.addEventListener('play', () => start());
  video.addEventListener('pause', stop);
  video.addEventListener('seeked', () => { if (!video.paused) start(); });
  return {prepare, restart: () => { if (!video.paused) start(); }, stop};
}
