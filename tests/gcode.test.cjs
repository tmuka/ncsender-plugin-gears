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
  for (const o of [base, { ...base, job: 'both' }, { ...base, job: 'frame' }, { ...base, gears: { A: { teeth: 12, bore: 3.175, holes: 0 }, B: base.gears.B }, module: 4 }, { ...base, gears: { A: { teeth: 36, bore: 12.7, boreShape: 'hex', holes: 5 }, B: base.gears.B } },
    { ...base, direction: 'climb', gears: { A: { teeth: 36, bore: 14, boreShape: 'dflat', flat: 12, holes: 5 }, B: { teeth: 18, bore: 10, boreShape: 'keyway', keyWidth: 3.3, keyDepth: 1.5 } }, job: 'both' }]) {
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

test('review fixes: no gouge with Gear B, front-left, or wide tabs; tabs on tips; climb and conventional', () => {
  const outlineOf = (o, k) => {
    const g = G.gear({ module: o.module, teeth: o.gears[k].teeth, pressureDeg: o.pressureDeg, backlash: o.backlash, clearance: o.clearance, bitRadius: o.bitDiameter / 2 });
    const out = G.simplifyClosed(g.outline, 0.001);
    return { g, oc: out.concat([out[0]]) };
  };
  for (const o of [{ ...base, job: 'both' }, { ...base, origin: 'front-left' }, { ...base, tabs: { count: 6, width: 40, height: 1.5 } }, { ...base, tabs: { count: 12, width: 20, height: 1.5 } }]) {
    const r = GC.generate(o);
    assert.deepEqual(r.problems, []);
    for (const part of r.parts) {
      const { g, oc } = outlineOf(o, part.key);
      const moves = run(r.gcode).filter((m) => new RegExp('Gear ' + part.key + ' teeth').test(m.section) && m.g === 1 && m.z < 0);
      for (let i = 0; i < moves.length; i += 5) {
        const q = { x: moves[i].x - part.x, y: moves[i].y - part.y };
        let d = Infinity;
        for (let j = 0; j + 1 < oc.length; j++) d = Math.min(d, G.distToSegment(q, oc[j], oc[j + 1]));
        assert.ok(d > o.bitDiameter / 2 - 0.0002, `${JSON.stringify({ job: o.job, origin: o.origin, tabs: o.tabs })} Gear ${part.key} gouged ${(o.bitDiameter / 2 - d).toFixed(3)} at ${moves[i].line}`);
      }
      // Each tab lift is near a tooth tip of its own gear.
      const tabTop = o.depth - o.tabs.height, pitch = 2 * Math.PI / g.basics.z;
      for (const m of moves.filter((m) => Math.abs(m.z + tabTop) < 1e-6 && m.z0 < m.z - 1e-6)) {
        const x = m.x - part.x, y = m.y - part.y, a = Math.atan2(y, x), off = Math.abs(((a / pitch) % 1 + 1.5) % 1 - 0.5) * pitch * Math.hypot(x, y);
        assert.ok(off < (o.tabs.width + o.bitDiameter) / 2 + 0.5, `Gear ${part.key} tab ${off.toFixed(2)} mm off a tip`);
      }
    }
  }
  // Conventional runs counter-clockwise round the outside and clockwise (G2) in holes; climb the other way.
  const area = (o) => {
    const mv = run(GC.generate(o).gcode).filter((m) => /Gear A teeth/.test(m.section) && m.g === 1 && Math.abs(m.z + o.depth) < 1e-6);
    return mv.reduce((s, m) => s + m.x0 * m.y - m.x * m.y0, 0);
  };
  assert.ok(area(base) > 0 && area({ ...base, direction: 'climb' }) < 0);
  assert.match(GC.generate(base).gcode, /\nG2 X/);
  assert.doesNotMatch(GC.generate(base).gcode, /\nG3 X/);
  assert.doesNotMatch(GC.generate({ ...base, direction: 'climb' }).gcode, /\nG2 X/);
  // A bore too big for the gear, and tabs covering too much, are refused.
  assert.match(GC.generate({ ...base, module: 4, gears: { A: { teeth: 12, bore: 60, holes: 0 }, B: base.gears.B } }).problems.join(), /Bore is too big/);
  assert.match(GC.generate({ ...base, tabs: { count: 12, width: 50, height: 1.5 } }).problems.join(), /tabs would cover/);
  // A Tip Clearance under what the bit's rounding needs is refused; blank picks it.
  assert.match(G.gear({ module: 4, teeth: 30, pressureDeg: 20, backlash: 0.3, clearance: 0.1, bitRadius: 1.5875 }).problem, /Tip Clearance must be at least/);
  const auto = G.gear({ module: 3.4, teeth: 30, pressureDeg: 20, backlash: 0.3, bitRadius: 1.5875 });
  assert.ok(auto.basics.c >= auto.basics.cMin && !auto.problem);
  // The smallest module for a typed clearance cuts, and a bit smaller doesn't.
  const mm = G.minModule({ pressureDeg: 20, bitRadius: 1.5875, backlash: 0.3, clearance: 1.2 });
  assert.equal(G.gear({ module: mm * 1.001, teeth: 30, pressureDeg: 20, backlash: 0.3, clearance: 1.2, bitRadius: 1.5875 }).problem, null);
  assert.ok(G.gear({ module: mm * 0.99, teeth: 30, pressureDeg: 20, backlash: 0.3, clearance: 1.2, bitRadius: 1.5875 }).problem);
});

test('a D bore and a keyed bore: cleared to their edges, never past, notches reaching the sharp corners', () => {
  const r = base.bitDiameter / 2, R = 7, depthMoves = (res, re) => run(res.gcode).filter((m) => re.test(m.section) && m.g === 1 && m.z < 0);
  for (const direction of ['conventional', 'climb']) {
    // D: 14 mm round, 12 across the flat (the flat across +X at x = 5).
    const F = 12, fx = F - R, d = { ...base, direction, gears: { A: { teeth: 36, bore: 14, boreShape: 'dflat', flat: F, holes: 0 }, B: base.gears.B } };
    let res = GC.generate(d);
    assert.deepEqual(res.problems, []);
    let mv = depthMoves(res, /d bore/);
    const inD = (q, grow) => q.x <= fx - r + grow && Math.hypot(q.x, q.y) <= R - r + grow;
    for (const m of mv) if (!/Corner relief/.test(m.raw)) assert.ok(inD(m, 1e-3), `${direction} D: past the edge at ${m.line}`);
    const tips = mv.filter((m) => /Corner relief/.test(m.raw));
    assert.equal(tips.length, 2 * GC.depthLevels(d.depth, d.depthOfCut).length);
    const corner = { x: fx, y: Math.sqrt(R * R - fx * fx) };
    for (const t of tips) assert.ok(Math.abs(Math.hypot(t.x - corner.x, Math.abs(t.y) - corner.y) - r) < 2e-3, `${direction} D notch misses its corner: ${t.line}`);
    let floor = mv.filter((m) => Math.abs(m.z + d.depth) < 1e-6 && Math.abs(m.z0 + d.depth) < 1e-6);
    for (let x = -R; x <= R; x += 0.25) for (let y = -R; y <= R; y += 0.25) {
      if (!(x <= fx - 0.02 && Math.hypot(x, y) <= R - 0.02)) continue;
      const near = Math.min(...floor.map((m) => G.distToSegment({ x, y }, { x: m.x0, y: m.y0 }, m)));
      assert.ok(near <= r + 1e-6, `${direction} D: (${x}, ${y}) left uncut`);
    }
    // Keyed: 14 mm round, a 4 mm keyway 2 mm past the bore, up +Y.
    const w = 4, k = 2, kd = { ...base, direction, gears: { A: { teeth: 36, bore: 14, boreShape: 'keyway', keyWidth: w, keyDepth: k, holes: 0 }, B: base.gears.B } };
    res = GC.generate(kd);
    assert.deepEqual(res.problems, []);
    mv = depthMoves(res, /keyed bore/);
    const inK = (q, grow) => Math.hypot(q.x, q.y) <= R - r + grow || (Math.abs(q.x) <= w / 2 - r + grow && q.y >= -grow && q.y <= R + k - r + grow);
    for (const m of mv) if (!/Corner relief/.test(m.raw)) assert.ok(inK(m, 1e-3), `${direction} keyway: past the edge at ${m.line}`);
    const kt = mv.filter((m) => /Corner relief/.test(m.raw));
    assert.ok(kt.length >= 2);
    for (const t of kt) assert.ok(Math.abs(Math.hypot(Math.abs(t.x) - w / 2, t.y - (R + k)) - r) < 2e-3, `${direction} keyway notch misses its corner: ${t.line}`);
    floor = mv.filter((m) => Math.abs(m.z + kd.depth) < 1e-6 && Math.abs(m.z0 + kd.depth) < 1e-6);
    // The arcs of the round part are G2/G3: check the keyway's own area here.
    for (let x = -w / 2 + 0.02; x <= w / 2 - 0.02; x += 0.2) for (let y = R - 0.5; y <= R + k - 0.02; y += 0.2) {
      const near = Math.min(...floor.map((m) => G.distToSegment({ x, y }, { x: m.x0, y: m.y0 }, m)));
      assert.ok(near <= r + 1e-6, `${direction} keyway: (${x.toFixed(2)}, ${y.toFixed(2)}) left uncut`);
    }
  }
  // Problems name the field.
  const bad = (g) => GC.generate({ ...base, gears: { A: { teeth: 36, bore: 14, holes: 0, ...g }, B: base.gears.B } }).problems.join(' | ');
  assert.match(bad({ boreShape: 'dflat', flat: 14 }), /Across the Flat must be less than the bore/);
  assert.match(bad({ boreShape: 'dflat', flat: 3 }), /Across the Flat must be more than the bit/);
  assert.match(bad({ boreShape: 'keyway', keyWidth: 3.2, keyDepth: 2 }), /Key Width must be a little more than the bit/);
  assert.match(bad({ boreShape: 'keyway', keyWidth: 4, keyDepth: 0 }), /Key Depth must be more than 0/);
});

test('a typed center distance: frame holes at it, the range that works, refused outside it', () => {
  const nat = G.pair(base, 36, 18).centerDistance;
  const res = GC.generate({ ...base, job: 'frame', depth: 19, depthOfCut: 3, centerDistance: nat + 0.5 });
  assert.deepEqual(res.problems, []);
  assert.ok(res.holes.some((h) => Math.abs(h.x - (nat + 0.5)) < 1e-9));
  const pr = G.pair({ ...base, centerDistance: nat + 0.5 }, 36, 18);
  assert.ok(pr.backlash > 0.3 + 2 * 0.5 * Math.tan(20 * Math.PI / 180) && pr.contactRatio < G.pair(base, 36, 18).contactRatio);
  const frame = { ...base, job: 'frame', depth: 19, depthOfCut: 3 };
  assert.match(GC.generate({ ...frame, centerDistance: nat - 1 }).problems.join(), /too close/);
  assert.match(GC.generate({ ...frame, centerDistance: nat + 10 }).problems.join(), /too far/);
  // A single gear, or both side by side, don't mesh: a typed distance doesn't stop them.
  assert.deepEqual(GC.generate({ ...base, centerDistance: nat + 10 }).problems, []);
});

test('spoke windows: cleared to their rounded edges, the spokes and hub left whole', () => {
  const r = base.bitDiameter / 2;
  for (const direction of ['conventional', 'climb']) for (const n of [3, 5]) {
    const o = { ...base, direction, gears: { A: { teeth: 36, bore: 8, holes: n, holeStyle: 'spokes' }, B: base.gears.B } };
    const res = GC.generate(o);
    assert.deepEqual(res.problems, []);
    const hs = GC.gearHoles(o.gears.A, G.gear({ ...o, teeth: 36, bitRadius: r }), o, 'Gear A').holes.filter((h) => h.shape === 'window');
    assert.equal(hs.length, n);
    const win = hs[0], outline = GC.windowLap(win.win, 0), oc = outline.concat([outline[0]]);
    const inside = (q) => { let c = false; for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) { const a = outline[i], b = outline[j]; if ((a.y > q.y) !== (b.y > q.y) && q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
    const edge = (q) => Math.min(...oc.slice(1).map((b, i) => G.distToSegment(q, oc[i], b)));
    const mv = run(res.gcode).filter((m) => /window 1:/.test(m.section) && m.g >= 1 && m.z < 0);
    // Never past the edge: every bit center inside the window, a bit radius or more from its edge.
    for (const m of mv) assert.ok(inside(m) && edge(m) >= r - 2e-3, `${direction} ${n}: past the window's edge at ${m.line} (${edge(m).toFixed(3)})`);
    // Cleared: every point of the window within a bit radius of a cut at full depth.
    const floor = mv.filter((m) => m.g === 1 && Math.abs(m.z + o.depth) < 1e-6 && Math.abs(m.z0 + o.depth) < 1e-6);
    const xs = outline.map((q) => q.x), ys = outline.map((q) => q.y);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.5) {
      const q = { x, y };
      if (!inside(q) || edge(q) < 0.02) continue;
      const near = Math.min(...floor.map((m) => G.distToSegment(q, { x: m.x0, y: m.y0 }, m)));
      assert.ok(near <= r + 1e-6, `${direction} ${n}: (${x.toFixed(2)}, ${y.toFixed(2)}) left uncut`);
    }
  }
  assert.match(GC.generate({ ...base, gears: { A: { teeth: 36, bore: 8, holes: 12, holeStyle: 'spokes', spokeWidth: 26 }, B: base.gears.B } }).problems.join(), /spoke windows are too narrow/);
});

test('a rack: cut a bit radius out from it, tabs on its bottom edge, screw holes in its bar, safe', () => {
  const r = base.bitDiameter / 2;
  for (const job of ['B', 'both']) for (const direction of ['conventional', 'climb']) {
    const o = { ...base, job, direction, gears: { A: { teeth: 18, bore: 8, holes: 0 }, B: { kind: 'rack', teeth: 12, rackHeight: 12, bore: 4, holes: 3 } } };
    const res = GC.generate(o);
    assert.deepEqual(res.problems, []);
    const part = res.parts.find((q) => q.key === 'B'), R = G.makeRack({ module: o.module, pressureDeg: o.pressureDeg, backlash: o.backlash, clearance: o.clearance, bitRadius: r, teeth: 12, height: 12 });
    const out = G.simplifyClosed(R.outline, 0.001), oc = out.concat([out[0]]);
    const moves = run(res.gcode);
    const teeth = moves.filter((m) => /Rack teeth/.test(m.section) && m.g === 1 && m.z < 0);
    assert.ok(teeth.length > 100);
    for (let i = 0; i < teeth.length; i += 3) {
      const q = { x: teeth[i].x - part.x, y: teeth[i].y - part.y };
      let d = Infinity;
      for (let j = 0; j + 1 < oc.length; j++) d = Math.min(d, G.distToSegment(q, oc[j], oc[j + 1]));
      assert.ok(d > r - 0.0002 && d < r + 0.01, `${job} ${direction}: cut ${d.toFixed(4)} from the rack at ${teeth[i].line}`);
    }
    // Tabs: lifts on the bottom edge only.
    const tabTop = o.depth - o.tabs.height, lifts = teeth.filter((m) => Math.abs(m.z + tabTop) < 1e-6 && m.z0 < m.z - 1e-6);
    assert.ok(lifts.length >= 3);
    for (const m of lifts) assert.ok(Math.abs(m.y - part.y - (R.basics.bottom - r)) < 0.01, `${job}: a tab off the bottom edge at ${m.line}`);
    // Screw holes in the bar, under the roots.
    const holes = res.gcode.split('\n').filter((l) => /^\(Rack screw hole/.test(l));
    assert.equal(holes.length, 3);
    // Nothing below Total Depth, no rapids at depth, Z no faster than the Plunge Rate.
    for (const m of moves) {
      assert.ok(m.z >= -o.depth - 1e-6, m.line);
      if (m.g === 0) assert.ok(m.z >= 0 || (m.x === m.x0 && m.y === m.y0), 'rapid at depth: ' + m.line);
      if (m.g > 0 && m.z < m.z0 - 1e-6 && m.z < 0) assert.ok(m.f * (m.z0 - m.z) / Math.hypot(m.len, m.z0 - m.z) <= o.plungeFeedRate * 1.02, m.line);
    }
  }
  const bad = (B) => GC.generate({ ...base, job: 'B', gears: { A: base.gears.A, B: { kind: 'rack', teeth: 12, rackHeight: 12, bore: 4, holes: 3, ...B } } }).problems.join(' | ');
  assert.match(bad({ bore: 11 }), /screw holes don’t fit in its bar/);
  assert.match(bad({ rackHeight: 0 }), /Rack Height must be more than 0/);
  assert.match(GC.generate({ ...base, job: 'frame', gears: { A: base.gears.A, B: { kind: 'rack', teeth: 12, rackHeight: 12 } } }).problems.join(), /Frame Holes is for two gears/);
});
