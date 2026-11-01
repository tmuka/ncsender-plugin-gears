const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/gear-geometry.cjs');
const GC = require('../lib/gear-gcode.cjs');

const base = { job: 'A', module: 3.5, pressureDeg: 20, backlash: 0.3, clearance: 0.875, bitDiameter: 3.175, feedRate: 1372,
  plungeFeedRate: 412, spindleRpm: 18000, spindleDelay: 2, depth: 12.5, depthOfCut: 3, tabs: { count: 3, width: 4, height: 1.5 },
  gears: { A: { teeth: 36, bore: 8, holes: 5 }, B: { teeth: 18, bore: 8, holes: 0 } }, origin: 'center' };

// Runs a program: every move with where it starts and ends, its feed, and
// the comment section it's in.
function run(gcode) {
  let x = 0, y = 0, z = 50, f = 0, section = '';
  const moves = [];
  for (const raw of gcode.split('\n')) {
    if (/^\(/.test(raw)) { section = raw; continue; }
    const l = raw.replace(/;.*$/, '').trim();
    const v = (a) => { const m = l.match(new RegExp('\\b' + a + '(-?[\\d.]+)')); return m ? +m[1] : null; };
    if (v('F') != null) f = v('F');
    const g = /^G([0123])\b/.exec(l);
    if (!g || /G53/.test(l)) continue;
    const nx = v('X') ?? x, ny = v('Y') ?? y, nz = v('Z') ?? z;
    let len = Math.hypot(nx - x, ny - y);
    if (g[1] === '2' || g[1] === '3') {
      const cx = x + v('I'), cy = y + v('J');
      let sw = Math.atan2(ny - cy, nx - cx) - Math.atan2(y - cy, x - cx);
      if (g[1] === '2') sw = -sw;
      while (sw <= 1e-9) sw += 2 * Math.PI;
      len = Math.hypot(v('I'), v('J')) * sw;
    }
    moves.push({ g: +g[1], x0: x, y0: y, z0: z, x: nx, y: ny, z: nz, f, len, section, line: l, raw });
    x = nx; y = ny; z = nz;
  }
  return moves;
}

test('nothing below Total Depth, no rapids at depth, Z never faster than the Plunge Rate', () => {
  for (const o of [base, { ...base, job: 'both' }, { ...base, job: 'frame' }, { ...base, gears: { A: { teeth: 12, bore: 3.175, holes: 0 }, B: base.gears.B }, module: 4 }, { ...base, gears: { A: { teeth: 36, bore: 12.7, boreShape: 'hex', holes: 5 }, B: base.gears.B } }]) {
    const r = GC.generate(o);
    assert.deepEqual(r.problems, []);
    for (const m of run(r.gcode)) {
      assert.ok(m.z >= -o.depth - 1e-6, m.line);
      if (m.g === 0) assert.ok(m.z >= 0 || (m.x === m.x0 && m.y === m.y0), 'rapid at depth: ' + m.line);
      if (m.g > 0 && m.z < m.z0 - 1e-6 && m.z < 0) {
        const zSpeed = m.f * (m.z0 - m.z) / Math.hypot(m.len, m.z0 - m.z);
        assert.ok(zSpeed <= o.plungeFeedRate * 1.02, `Z at ${zSpeed.toFixed(0)} on ${m.line}`);
      }
    }
  }
});

test('the teeth are cut a bit radius out from the gear, never into it', () => {
  for (const o of [base, { ...base, gears: { A: { teeth: 12, bore: 8, holes: 0 }, B: base.gears.B }, module: 4 }]) {
    const r = GC.generate(o), g = G.gear({ module: o.module, teeth: o.gears.A.teeth, pressureDeg: o.pressureDeg, backlash: o.backlash, clearance: o.clearance, bitRadius: 1.5875 });
    const out = G.simplifyClosed(g.outline, 0.001), oc = out.concat([out[0]]);
    const teeth = run(r.gcode).filter((m) => /teeth/.test(m.section) && m.g === 1 && m.z < 0);
    assert.ok(teeth.length > 1000);
    for (let i = 0; i < teeth.length; i += 7) {
      let d = Infinity;
      for (let j = 0; j + 1 < oc.length; j++) d = Math.min(d, G.distToSegment(teeth[i], oc[j], oc[j + 1]));
      assert.ok(d > 1.5875 - 0.0002 && d < 1.5875 + 0.01, `cut ${d.toFixed(4)} from the gear at ${teeth[i].line}`);
    }
  }
});

test('tabs are on tooth tips, only on the passes below their top', () => {
  const r = GC.generate(base), moves = run(r.gcode), tabTop = base.depth - base.tabs.height;
  const lifts = moves.filter((m) => /Tab/.test(m.line) || (m.z === -tabTop && m.z0 < -tabTop && m.x === m.x0));
  const tabLines = r.gcode.split('\n').filter((l) => /; Tab/.test(l));
  assert.equal(tabLines.length, 3 * 2);
  // Each lift is at a tooth tip: as far out as the path goes, on a tooth's center line.
  for (const m of moves.filter((m) => /teeth/.test(m.section) && m.g === 1 && Math.abs(m.z + tabTop) < 1e-6 && m.z0 < m.z - 1e-6)) {
    const a = Math.atan2(m.y, m.x), pitch = 2 * Math.PI / 36, off = Math.abs(((a / pitch) % 1 + 1.5) % 1 - 0.5) * pitch * Math.hypot(m.x, m.y);
    assert.ok(off < (base.tabs.width + base.bitDiameter) / 2 + 0.5, `tab lift ${off.toFixed(2)} mm off a tip`);
  }
  assert.equal(lifts.length >= 6, true);
});

test('holes: a bore, lightening holes that fit, frame holes at the center distance', () => {
  const r = GC.generate(base);
  assert.equal(r.gcode.split('\n').filter((l) => /lightening hole/.test(l)).length, 5);
  assert.match(GC.generate({ ...base, gears: { ...base.gears, A: { teeth: 36, bore: 8, holes: 40 } } }).problems.join(), /lightening holes don.t fit/);
  assert.match(GC.generate({ ...base, gears: { ...base.gears, A: { teeth: 36, bore: 2, holes: 0 } } }).problems.join(), /Bore is smaller than the bit/);
  const fr = GC.generate({ ...base, job: 'frame' }), holes = fr.gcode.split('\n').filter((l) => /^G0 X/.test(l));
  assert.deepEqual(fr.holes.map((h) => h.x), [0, 94.5]);
  // A bit-sized hole is pecked straight down.
  const peck = GC.generate({ ...base, gears: { ...base.gears, A: { teeth: 36, bore: 3.175, holes: 0 } } }).gcode;
  assert.match(peck, /bore: 3.17 mm[^]*?G1 Z-3.000 F412/);
});

test('mm programs; an inch machine gets G20 back at the end; the origin can be the front-left corner', () => {
  assert.match(GC.generate(base).gcode, /^G21/m);
  assert.doesNotMatch(GC.generate(base).gcode, /^G20/m);
  assert.match(GC.generate({ ...base, imperial: true }).gcode, /G20 ; Back to inches\nM30/);
  const fl = GC.generate({ ...base, origin: 'front-left' });
  const xs = run(fl.gcode).filter((m) => m.z < 0).map((m) => m.x);
  assert.ok(Math.min(...xs) > 0 && Math.min(...xs) < 3.2, String(Math.min(...xs)));
});

test('bad settings are refused with what to change', () => {
  assert.match(GC.generate({ ...base, module: 2 }).problems.join(), /bit is too big/);
  assert.match(GC.generate({ ...base, tabs: { count: 3, width: 4, height: 20 } }).problems.join(), /Tab Height/);
  assert.match(GC.generate({ ...base, gears: { ...base.gears, A: { teeth: 3.5, bore: 8 } } }).problems.join(), /whole number/);
});

test('a hex bore: cleared to the flats, a dog-bone reaching each corner, the frame hole across the corners', () => {
  const F = 12.7, r = base.bitDiameter / 2, o = { ...base, gears: { A: { teeth: 36, bore: F, boreShape: 'hex', holes: 5 }, B: base.gears.B } };
  const res = GC.generate(o);
  assert.deepEqual(res.problems, []);
  const moves = run(res.gcode).filter((m) => /hex bore/.test(m.section) && m.g === 1 && m.z < 0);
  const normals = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos((k + 0.5) * Math.PI / 3), Math.sin((k + 0.5) * Math.PI / 3)]);
  const reach = (p) => Math.max(...normals.map((n) => p.x * n[0] + p.y * n[1]));
  const tips = moves.filter((m) => /Corner relief/.test(m.raw));
  assert.equal(tips.length, 6 * GC.depthLevels(o.depth, o.depthOfCut).length);
  for (const t of tips) assert.ok(Math.abs(Math.hypot(t.x, t.y) - (F / 2 / Math.cos(Math.PI / 6) - r)) < 1e-3, 'corner relief misses the corner: ' + t.line);
  for (const m of moves) if (!/Corner relief/.test(m.raw)) assert.ok(reach(m) <= F / 2 - r + 1e-3, 'past a flat: ' + m.line);
  // Every point of the hex is within the bit's radius of a cut at full depth.
  const floor = moves.filter((m) => Math.abs(m.z + o.depth) < 1e-6 && Math.abs(m.z0 + o.depth) < 1e-6);
  for (let x = -F; x <= F; x += 0.25) for (let y = -F; y <= F; y += 0.25) {
    if (reach({ x, y }) > F / 2 - 0.01) continue;
    const d = Math.min(...floor.map((m) => G.distToSegment({ x, y }, { x: m.x0, y: m.y0 }, m)));
    assert.ok(d <= r + 1e-6, `(${x}, ${y}) left uncut`);
  }
  // The lightening holes clear the hex's corners.
  const lh = GC.gearHoles(o.gears.A, G.gear({ ...o, teeth: 36, bitRadius: r }), o, 'Gear A').holes.filter((h) => /lightening/.test(h.label));
  for (const h of lh) assert.ok(Math.hypot(h.dx, h.dy) - h.diameter / 2 > F / 2 / Math.cos(Math.PI / 6) + r);
  const frame = GC.generate({ ...o, job: 'frame', depth: 19, depthOfCut: 3 });
  assert.match(frame.gcode, /Axle hole A: 14\.66 mm/);
  assert.deepEqual(GC.generate({ ...o, gears: { A: { teeth: 36, bore: 3.2, boreShape: 'hex', holes: 0 }, B: base.gears.B } }).problems, ['Gear A’s Hex Bore must be wider across the flats than the bit']);
});
