// LiteCut app: load a timeline (OTIO, OTIO + JSON-LD, an OTIO collection, a library of films, or the 0.0.x proof-of-concept
// formats) from ?project=<url>, ?library=<url>, ?track=<video>, a file or the library; show it as lanes over the film; move, trim,
// split and delete clips; edit prompts and directions; save in the browser, download, or PUT back to its URL (a Solid pod).
import {VERSION, detect, libraryItems, collectionItems, fromTimeline, toTimeline, fromLegacy, fromVideo, moveClip, trimClip, splitClip,
  deleteClip, describe, setPath, resolve} from './model.js';

const DEFAULT_LIBRARY = 'https://melvin.me/public/aesop/universe.jsonld';
const $ = (id) => document.getElementById(id);
const video = $('video'), lanesEl = $('lanes'), headsEl = $('heads'), rulerEl = $('ruler'), canvas = $('canvas'), scroller = $('scroller');
let model = null, srcUrl = null, sel = null, undo = [], pxPerFrame = 2, films = [], tab = 'films';
$('ver').textContent = 'v' + VERSION;

const status = (t) => { $('status').textContent = t; if (t) setTimeout(() => { if ($('status').textContent === t) $('status').textContent = ''; }, 4000); };
const fmt = (frames) => { const s = frames / (model?.fps || 30); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
const MARK = {YELLOW: '#d4a017', ORANGE: '#e07b2a', GREEN: '#2e9d5b', CYAN: '#2a8fb0', PURPLE: '#8a5bd0', RED: '#d04545', BLUE: '#3d6be0', PINK: '#d0508a', MAGENTA: '#b040a0'};
const colour = (name) => { const k = (name || '').toLowerCase().split(' ')[0]; return getComputedStyle(document.documentElement).getPropertyValue(`--c-${k}`).trim() || 'var(--c-other)'; };

// ── loading ──
async function fetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }

async function open(url) {
  try {
    status('Loading…');
    const doc = await fetchJson(url);
    await openDoc(doc, url);
  } catch (e) { status(`Could not open: ${e.message}`); }
}

async function openDoc(doc, url) {
  const kind = detect(doc);
  if (kind === 'library') { showLibrary(libraryItems(doc, url).map((it) => ({...it, open: () => open(it.url)}))); status('Library loaded'); return; }
  if (kind === 'collection') {
    const items = collectionItems(doc);
    showLibrary(items.map((it) => ({name: it.name, open: () => load(it.doc, url)})));
    return load(items[0].doc, url);
  }
  if (kind === 'litecut-0.0.1' || kind === 'litecut-0.0.2') return load(fromLegacy(doc, kind), url);
  if (kind === 'timeline') return load(doc, url);
  status('Not a timeline LiteCut knows (OTIO Timeline, OTIO collection, a film library, or litecut 0.0.x)');
}

function load(doc, url) {
  srcUrl = url; model = fromTimeline(doc, url || location.href); sel = null; undo = [];
  $('title').textContent = doc.name || 'Untitled';
  document.title = `${doc.name || 'Untitled'} · LiteCut`;
  if (model.video) { video.src = model.video; }
  const w = scroller.clientWidth - 20;
  pxPerFrame = model.duration ? Math.max(0.2, Math.min(12, w / model.duration)) : 2;
  $('zoom').value = pxPerFrame;
  render(); inspect(null); status('');
  if (!films.length) setTab('lines'); else if (!$('library').hidden && tab !== 'films') drawPanel();
}

function showLibrary(items) { films = items; $('library').hidden = false; setTab('films'); }

// every clip with words (dialogue, captions): time, speaker, text; and the cast with its voices, from the document itself
function lines() {
  if (!model) return [];
  const out = [];
  for (const l of model.lanes) for (const c of l.clips) if (c.node.text) out.push({lane: l, clip: c, who: (c.node.spokenByCharacter?.['@id'] || '').split('#char/').pop(), text: c.node.text});
  return out.sort((a, b) => a.clip.start - b.clip.start);
}
function cast() {
  if (!model) return [];
  const voices = [].concat(model.doc.actor || []), chars = [].concat(model.doc.character || []);
  const rows = voices.map((v) => ({name: (v.character?.['@id'] || v['@id'] || '').split(/#char\/|\/voice\//).pop(), voice: v.name, engine: v.engine?.name, about: v.description}));
  for (const c of chars) { const id = (c['@id'] || '').split('#char/').pop(); if (id && !rows.some((r) => r.name === id)) rows.push({name: c.characterName || id, about: c.description}); }
  return rows;
}
function setTab(t) {
  tab = t; $('library').hidden = false;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $('lib-filter').value = ''; drawPanel();
}
function drawPanel() {
  const q = $('lib-filter').value.toLowerCase(), list = $('lib-list'), li = (html, onclick) => { const e = document.createElement('li'); e.innerHTML = html; if (onclick) e.onclick = onclick; return e; };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  let rows = [];
  if (tab === 'films') rows = films.filter((i) => i.name.toLowerCase().includes(q)).map((i) => li(esc(i.name), (e) => { list.querySelectorAll('li').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); i.open(); }));
  if (tab === 'lines') rows = lines().filter((x) => (x.who + ' ' + x.text).toLowerCase().includes(q)).map((x) =>
    li(`<span class="t">${fmt(x.clip.start)}</span><span class="w">${esc(x.who)}</span>${esc(x.text)}`, () => { fresh = false; video.currentTime = x.clip.start / model.fps; select(x.lane, x.clip); }));
  if (tab === 'cast') rows = cast().filter((r) => JSON.stringify(r).toLowerCase().includes(q)).map((r) =>
    li(`<span class="w">${esc(r.name)}</span>${esc(r.voice || '')}${r.engine ? ` <span class="t">${esc(r.engine)}</span>` : ''}${r.about ? `<span class="d">${esc(r.about)}</span>` : ''}`, () => { $('lib-filter').value = r.name; setTab('lines'); $('lib-filter').value = r.name; drawPanel(); }));
  list.replaceChildren(...rows);
  $('lib-count').textContent = `${rows.length}`;
}
$('lib-filter').oninput = () => drawPanel();
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

// ── drawing ──
function render() {
  if (!model) return;
  const W = Math.max(scroller.clientWidth, model.duration * pxPerFrame + 40);
  canvas.style.width = `${W}px`;
  // ruler: a tick every 1, 5, 10 or 30 s depending on zoom; markers (beats, effects) as small bars
  const step = [1, 2, 5, 10, 30, 60].find((s) => s * model.fps * pxPerFrame > 60) || 60;
  const ticks = [];
  for (let s = 0; s * model.fps <= model.duration; s += step) { const d = document.createElement('div'); d.className = 'tick'; d.style.left = `${s * model.fps * pxPerFrame}px`; d.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; ticks.push(d); }
  for (const m of model.markers) { const d = document.createElement('div'); d.className = 'mk'; d.title = m.name; d.style.left = `${m.start * pxPerFrame}px`; d.style.width = `${Math.max(2, m.dur * pxPerFrame)}px`; d.style.background = MARK[(m.color || 'YELLOW').toUpperCase()] || '#d4a017'; ticks.push(d); }
  rulerEl.replaceChildren(...ticks);
  headsEl.replaceChildren(...model.lanes.map((l) => {
    const h = document.createElement('div'); h.className = 'head';
    const n = document.createElement('span'); n.className = 'n'; n.textContent = l.name; n.style.borderLeft = `4px solid ${colour(l.name)}`; n.style.paddingLeft = '6px'; n.title = `${l.name} (${l.kind}, ${l.clips.length} clips)`;
    const mb = document.createElement('button'); mb.textContent = 'M'; mb.title = 'Mute'; mb.className = l.mute ? 'on' : ''; mb.onclick = () => { l.mute = !l.mute; render(); };
    const sb = document.createElement('button'); sb.textContent = 'S'; sb.title = 'Solo'; sb.className = l.solo ? 'on' : ''; sb.onclick = () => { l.solo = !l.solo; render(); };
    h.append(n, mb, sb); return h;
  }));
  const anySolo = model.lanes.some((l) => l.solo);
  lanesEl.replaceChildren(...model.lanes.map((l) => {
    const row = document.createElement('div'); row.className = 'lane';
    for (const c of l.clips) {
      const el = document.createElement('div'); el.className = 'clip' + (sel?.clip === c ? ' sel' : '') + (l.mute || (anySolo && !l.solo) ? ' muted' : '');
      el.style.left = `${c.start * pxPerFrame}px`; el.style.width = `${Math.max(3, c.dur * pxPerFrame)}px`; el.style.background = colour(l.name);
      el.textContent = c.node.text || c.node.name || '';
      el.title = `${c.node.name || ''} ${fmt(c.start)} +${fmt(c.dur)}${c.node.anchor ? ' @ ' + c.node.anchor : ''}`;
      const hl = document.createElement('div'); hl.className = 'h l'; const hr = document.createElement('div'); hr.className = 'h r';
      el.append(hl, hr);
      el.onpointerdown = (e) => grab(e, l, c, e.target === hl ? 'start' : e.target === hr ? 'end' : 'move');
      row.append(el);
    }
    return row;
  }));
  headsEl.style.marginTop = `${-scroller.scrollTop}px`;
  drawPlayhead();
}
function drawPlayhead() { if (model) $('playhead').style.left = `${video.currentTime * model.fps * pxPerFrame}px`; $('time').textContent = model ? `${fmt(video.currentTime * model.fps)} / ${fmt(model.duration)}` : ''; }

// ── editing ──
const snapshot = () => { undo.push(JSON.stringify(toTimeline(model))); if (undo.length > 100) undo.shift(); };
function restore() {
  if (!undo.length) return status('Nothing to undo');
  const t = video.currentTime; load(JSON.parse(undo.pop()), srcUrl); video.currentTime = t; status('Undone');
}
function grab(e, lane, clip, mode) {
  e.preventDefault(); e.stopPropagation();
  select(lane, clip);
  const x0 = e.clientX, s0 = clip.start, d0 = clip.dur; let moved = false;
  const onMove = (ev) => {
    const df = Math.round((ev.clientX - x0) / pxPerFrame);
    if (!moved && Math.abs(df) < 1) return;
    if (!moved) { snapshot(); moved = true; }
    if (mode === 'move') moveClip(model, clip, s0 + df);
    else if (mode === 'end') { clip.dur = d0; trimClip(model, clip, 'end', df); }
    else { const back = s0 - clip.start; trimClip(model, clip, 'start', back); trimClip(model, clip, 'start', df); }
    render();
  };
  const onUp = () => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); if (moved) { toTimeline(model); inspect(sel); } };
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
}
function select(lane, clip) { sel = clip ? {lane, clip} : null; render(); inspect(sel); }

function inspect(s) {
  const box = $('inspector');
  if (!s) { box.innerHTML = '<p class="hint">Select a clip to see its prompt, direction and credits.</p>'; return; }
  const {clip, lane} = s, h = document.createElement('h3');
  h.textContent = clip.node.text ? `${lane.name}: ${clip.node.name}` : clip.node.name || lane.name;
  const parts = [h, field('Lane', lane.name), field('Time', `${fmt(clip.start)} for ${fmt(clip.dur)}`)];
  for (const f of describe(clip.node)) {
    if (!f.edit) { parts.push(field(f.label, f.label === 'Media' ? resolve(f.value, model.base) : f.value)); continue; }
    const wrap = document.createElement('div'); wrap.className = 'field';
    const lab = document.createElement('label'); lab.textContent = f.label;
    const inp = document.createElement(String(f.value).length > 40 ? 'textarea' : 'input'); inp.value = f.value; if (inp.tagName === 'TEXTAREA') inp.rows = Math.min(8, Math.ceil(String(f.value).length / 40));
    inp.onchange = () => { snapshot(); setPath(clip.node, f.path, inp.value); render(); status(`${f.label} changed`); };
    wrap.append(lab, inp); parts.push(wrap);
  }
  box.replaceChildren(...parts);
}
function field(label, value) { const d = document.createElement('div'); d.className = 'field'; d.innerHTML = '<label></label><div class="v"></div>'; d.children[0].textContent = label; d.children[1].textContent = value; return d; }

// ── saving ──
const json = () => JSON.stringify(toTimeline(model), null, 1);
function download() {
  const a = document.createElement('a'), name = (model.doc.name || 'timeline').replace(/[^\w.-]+/g, '-');
  a.href = URL.createObjectURL(new Blob([json()], {type: 'application/ld+json'})); a.download = `${name}.jsonld`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function db() { return new Promise((ok, no) => { const r = indexedDB.open('litecut', 1); r.onupgradeneeded = () => r.result.createObjectStore('projects'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function saveLocal() {
  const d = await db(), tx = d.transaction('projects', 'readwrite');
  tx.objectStore('projects').put({url: srcUrl, doc: json(), saved: new Date().toISOString()}, srcUrl || model.doc.name || 'untitled');
  tx.oncomplete = () => status('Saved in this browser');
}
async function putBack() {
  const url = prompt('Save to which URL? (a Solid pod resource you can write)', srcUrl || '');
  if (!url) return;
  try {
    const r = await fetch(url, {method: 'PUT', headers: {'Content-Type': 'application/ld+json'}, body: json()});
    status(r.ok ? `Saved to ${url}` : `The server said ${r.status}: sign-in to the pod comes in a later version; Download for now`);
  } catch (e) { status(`Could not save: ${e.message}`); }
}

// ── controls ──
$('b-play').onclick = () => (video.paused ? video.play() : video.pause());
video.onplay = () => ($('b-play').textContent = 'Pause'); video.onpause = () => ($('b-play').textContent = 'Play');
video.ontimeupdate = drawPlayhead;
(function tick() { if (!video.paused) drawPlayhead(); requestAnimationFrame(tick); })();
// a still instead of a black box: until the first play, show a frame a few seconds in (past a title card), then play from the start
let fresh = true;
video.onloadedmetadata = () => {
  if (model && !model.duration) { const doc = fromVideo(model.video, video.duration); load(doc, srcUrl); return; }
  if (video.paused && video.currentTime === 0) { fresh = true; video.currentTime = Math.min(3.5, video.duration * 0.1); }
};
video.addEventListener('play', () => { if (fresh) { fresh = false; video.currentTime = 0; } });
rulerEl.addEventListener('click', () => { fresh = false; });
rulerEl.onclick = (e) => { const r = canvas.getBoundingClientRect(); video.currentTime = Math.max(0, (e.clientX - r.left) / pxPerFrame / model.fps); drawPlayhead(); };
lanesEl.onclick = (e) => { if (e.target === lanesEl || e.target.classList.contains('lane')) select(null, null); };
scroller.onscroll = () => { headsEl.style.marginTop = `${-scroller.scrollTop}px`; };
$('zoom').oninput = (e) => { pxPerFrame = Number(e.target.value); render(); };
$('b-library').onclick = () => { const lib = $('library'); if (!films.length) open(new URLSearchParams(location.search).get('library') || DEFAULT_LIBRARY); else lib.hidden = !lib.hidden; };
$('b-open').onclick = () => { const u = prompt('Timeline URL (.otio or .jsonld)'); if (u) open(u); };
$('f-open').onchange = async (e) => { const f = e.target.files[0]; if (f) openDoc(JSON.parse(await f.text()), null); };
$('b-undo').onclick = restore; $('b-save').onclick = saveLocal; $('b-download').onclick = download; $('b-put').onclick = putBack;
addEventListener('resize', render);
addEventListener('keydown', (e) => {
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (e.key === ' ') { e.preventDefault(); $('b-play').click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); restore(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveLocal(); }
  else if (!model || !sel) return;
  else if (e.key === 's' || e.key === 'S') { snapshot(); const c2 = splitClip(model, sel.lane, sel.clip, video.currentTime * model.fps); if (c2) { toTimeline(model); render(); status('Split'); } else undo.pop(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { snapshot(); deleteClip(model, sel.lane, sel.clip); toTimeline(model); select(null, null); status('Deleted'); }
  else if (e.key === 'Escape') select(null, null);
});

// ── start: ?project=, ?track= (a bare video), ?library=, else the default library ──
const q = new URLSearchParams(location.search);
if (q.get('project')) open(q.get('project'));
else if (q.get('track')) load(fromVideo(q.get('track')), null);
else open(q.get('library') || DEFAULT_LIBRARY);
