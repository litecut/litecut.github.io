// node test/model.test.mjs <timeline.jsonld|.otio> [out.json]: load, write back unchanged (must be identical), then edit and write.
import {readFileSync, writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {detect, collectionItems, fromTimeline, toTimeline, moveClip, trimClip, splitClip, deleteClip, shiftAnchor, fromLegacy, describe} from '../js/model.js';

const path = process.argv[2], out = process.argv[3];
const raw = readFileSync(path, 'utf8');
let doc = JSON.parse(raw), raw2 = raw;
if (detect(doc) === 'collection') { const items = collectionItems(doc); console.log(`collection: ${items.length} timelines, first "${items[0]?.name}"`); doc = items[0].doc; raw2 = JSON.stringify(doc); }
assert.equal(detect(doc), 'timeline');

// 1. a round trip without edits leaves the document exactly as it was
const m = fromTimeline(doc, 'https://example.org/fable/');
assert.deepEqual(JSON.parse(JSON.stringify(toTimeline(m))), JSON.parse(raw2), 'round trip changed the document');
console.log(`ok: ${m.lanes.length} lanes, ${m.lanes.reduce((a, l) => a + l.clips.length, 0)} clips, ${m.markers.length} markers, ${m.duration} frames at ${m.fps} fps, video ${m.video}`);

// 2. anchors
assert.equal(shiftAnchor('line:L7+33', 10), 'line:L7+43');
assert.equal(shiftAnchor('beat:B3_x', -5), 'beat:B3_x+-5');
assert.equal(shiftAnchor('line:L7+10', -10), 'line:L7');

// 3. edits on the first effects lane, if any: move a cue (its anchor follows), trim, split, delete
const fx = m.lanes.find((l) => l.name === 'Effects');
if (fx && fx.clips.length) {
  const c = fx.clips[0], a0 = c.node.anchor;
  moveClip(m, c, c.start + 15);
  assert.equal(c.node.anchor, shiftAnchor(a0, 15));
  trimClip(m, c, 'end', -5);
  const c2 = splitClip(m, fx, c, c.start + 10);
  assert.ok(c2 && c2.start === c.start + 10);
  deleteClip(m, fx, c2);
  console.log(`ok: moved ${c.node.name} 15 frames, anchor ${a0} -> ${c.node.anchor}`);
}
const d2 = toTimeline(m);
if (out) writeFileSync(out, JSON.stringify(d2, null, 1));

// 4. the proof of concept's format comes in as a timeline
const legacy = fromLegacy({version: 'litecut/0.0.2', name: 'p', media_pool: [{id: 'm1', name: 'a.mp4', type: 'video', source_url: 'a.mp4', duration: 4}],
  tracks: {video: [{id: 'c1', media_id: 'm1', start_time: 2, duration: 4, trim_start: 1}], audio: []}}, 'litecut-0.0.2');
const lm = fromTimeline(legacy);
assert.equal(lm.lanes[0].clips[0].start, 60);
assert.equal(lm.lanes[0].clips[0].dur, 120);
console.log('ok: legacy 0.0.2 import;', describe(m.lanes.find((l) => l.name === 'Dialogue')?.clips[0]?.node || {}).map((x) => x.label).join(', '));
