const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/gear-geometry.cjs');

const inv = (x) => Math.tan(x) - x;
// The tooth's angle at radius R on its lower flank (tooth 0 is centered on +X).
function flankAngle(g, R) {
  const o = g.outline, z = g.basics.z;
  for (let i = 0; i < o.length; i++) {
    const p = o[i], q = o[(i + 1) % o.length], rp = Math.hypot(p.x, p.y), rq = Math.hypot(q.x, q.y);
    const ap = Math.atan2(p.y, p.x), aq = Math.atan2(q.y, q.x);
    if (ap < 0 && ap > -Math.PI / z && aq < 0 && (rp - R) * (rq - R) <= 0 && rp !== rq) return -(ap + (R - rp) / (rq - rp) * (aq - ap));
  }
  return null;
}
const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
const turn = (pts, a, cx = 0) => pts.map((p) => ({ x: cx + p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }));

test('flanks are involutes, thinned by half the backlash', () => {
  for (const [z, m, pa, B] of [[36, 3.5, 20, 0], [18, 3.5, 20, 0.3], [24, 5, 25, 0.4], [60, 4, 14.5, 0.2]]) {
    const g = G.gear({ module: m, teeth: z, pressureDeg: pa, backlash: B, bitRadius: 1.5875 });
    assert.equal(g.problem, null, String(g.problem));
    const b = g.basics, sp = Math.PI * m / 2 - B / 2;
    for (const f of [0.15, 0.4, 0.7, 0.98]) {
      const R = Math.max(b.rb, b.rf + 0.4 * m) + f * (b.ra - Math.max(b.rb, b.rf + 0.4 * m));
      const want = sp / (2 * b.rp) + inv(b.alpha) - inv(Math.acos(b.rb / R));
      assert.ok(Math.abs((flankAngle(g, R) - want) * R) < 0.001, `z${z} ${pa}° at R ${R.toFixed(2)}: ${((flankAngle(g, R) - want) * R).toFixed(5)} mm`);
    }
  }
});

test('a pair meshes through a whole pitch without touching, with half the normal backlash each side', () => {
  for (const [zA, zB, m, pa, B] of [[36, 18, 3.5, 20, 0.3], [12, 10, 4, 20, 0.3], [10, 8, 6, 25, 0.4]]) {
    const p = { module: m, pressureDeg: pa, backlash: B, bitRadius: 1.5875 };
    const A = G.gear({ ...p, teeth: zA }), Bg = G.gear({ ...p, teeth: zB });
    const cd = G.pair(p, zA, zB).centerDistance, oa = G.simplifyClosed(A.outline, 0.001), ob = G.simplifyClosed(Bg.outline, 0.001);
    let gap = Infinity;
    for (let s = 0; s <= 24; s++) {
      const d = (2 * Math.PI / zA) * s / 24, a = turn(oa, d), b = turn(ob, Math.PI + Math.PI / zB - d * zA / zB, cd);
      const nearA = a.filter((q) => q.x > cd - Bg.basics.ra - 0.5), nearB = b.filter((q) => q.x < A.basics.ra + 0.5);
      for (const q of nearA) assert.ok(!inside(q, b), `${zA}:${zB} overlap at step ${s}`);
      for (const q of nearB) assert.ok(!inside(q, a), `${zA}:${zB} overlap at step ${s}`);
      for (const q of nearA) for (let i = 0; i + 1 < nearB.length; i++) if (Math.abs(nearB[i].y - q.y) < 10) gap = Math.min(gap, G.distToSegment(q, nearB[i], nearB[i + 1]));
    }
    const want = B * Math.cos(pa * Math.PI / 180) / 2;
    assert.ok(Math.abs(gap - want) < 0.01, `${zA}:${zB} closest ${gap.toFixed(4)}, want ${want.toFixed(4)}`);
  }
});

test('the bit path is the bit radius from the outline everywhere, and reaches every part of it', () => {
  for (const [z, m, r] of [[36, 3.5, 1.5875], [10, 4, 1.5875], [20, 8, 3.175]]) {
    const g = G.gear({ module: m, teeth: z, pressureDeg: 20, backlash: 0.3, bitRadius: r });
    const o = G.simplifyClosed(g.outline, 0.001), path = G.offsetOutward(o, r), oc = o.concat([o[0]]);
    for (let i = 0; i < path.length; i += 2) {
      let d = Infinity;
      for (let j = 0; j + 1 < oc.length; j++) d = Math.min(d, G.distToSegment(path[i], oc[j], oc[j + 1]));
      assert.ok(Math.abs(d - r) < 0.001, `z${z}: path point ${d.toFixed(4)} from the outline`);
    }
    for (let j = 0; j < o.length; j += 4) {
      let d = Infinity;
      for (let i = 0; i < path.length; i++) d = Math.min(d, G.distToSegment(o[j], path[i], path[(i + 1) % path.length]));
      assert.ok(d < r + 0.003, `z${z}: outline point ${d.toFixed(4)} from the path`);
    }
  }
});

test('the smallest module a bit can cut is where the gear stops fitting it', () => {
  for (const [r, pa] of [[1.5875, 20], [3.175, 20], [1.5875, 25]]) {
    const min = G.minModule({ pressureDeg: pa, bitRadius: r });
    assert.equal(G.gear({ module: min * 1.01, teeth: 30, pressureDeg: pa, bitRadius: r }).problem, null);
    assert.match(G.gear({ module: min * 0.99, teeth: 30, pressureDeg: pa, bitRadius: r }).problem, /bit is too big/);
  }
  assert.equal(G.friendlyModule(3.43), 3.5);
});

test('few teeth are undercut and say so; 25° needs fewer', () => {
  assert.ok(G.gear({ module: 4, teeth: 12, pressureDeg: 20, bitRadius: 1.5875 }).undercut);
  assert.ok(!G.gear({ module: 4, teeth: 18, pressureDeg: 20, bitRadius: 1.5875 }).undercut);
  assert.ok(!G.gear({ module: 6, teeth: 12, pressureDeg: 25, bitRadius: 1.5875 }).undercut);
});

test('spread apart to a typed center distance, the pair meshes with the backlash it reports', () => {
  const p = { module: 3.5, pressureDeg: 20, backlash: 0.3, bitRadius: 1.5875 }, zA = 36, zB = 18;
  const nat = G.pair(p, zA, zB).centerDistance, pr = G.pair({ ...p, centerDistance: nat + 0.4 }, zA, zB);
  const A = G.gear({ ...p, teeth: zA }), Bg = G.gear({ ...p, teeth: zB });
  const cd = pr.centerDistance, oa = G.simplifyClosed(A.outline, 0.001), ob = G.simplifyClosed(Bg.outline, 0.001);
  let gap = Infinity;
  for (let s = 0; s <= 24; s++) {
    const d = (2 * Math.PI / zA) * s / 24, a = turn(oa, d), b = turn(ob, Math.PI + Math.PI / zB - d * zA / zB, cd);
    const nearA = a.filter((q) => q.x > cd - Bg.basics.ra - 0.5), nearB = b.filter((q) => q.x < A.basics.ra + 0.5);
    for (const q of nearA) assert.ok(!inside(q, b), `overlap at step ${s}`);
    for (const q of nearA) for (let i = 0; i + 1 < nearB.length; i++) if (Math.abs(nearB[i].y - q.y) < 10) gap = Math.min(gap, G.distToSegment(q, nearB[i], nearB[i + 1]));
  }
  // Round the pitch circle the backlash is pr.backlash; normal to the teeth, at the
  // working pressure angle, half each side.
  const ap = Math.acos(nat * Math.cos(20 * Math.PI / 180) / cd), want = pr.backlash * Math.cos(ap) / 2;
  assert.ok(Math.abs(gap - want) < 0.03, `closest ${gap.toFixed(4)}, want about ${want.toFixed(4)}`);
});

test('at the closest center distance allowed, the teeth still clear', () => {
  for (const [m, pa, zA, zB, B, r] of [[1.5, 20, 40, 20, 0.3, 0.5], [1, 14.5, 40, 30, 0.3, 0.4], [3.5, 14.5, 36, 18, 1.0, 1.5875], [3.5, 20, 36, 18, 1.0, 1.5875]]) {
    const p = { module: m, pressureDeg: pa, backlash: B, bitRadius: r };
    const cd = G.pair(p, zA, zB).minDistance, A = G.gear({ ...p, teeth: zA }), Bg = G.gear({ ...p, teeth: zB });
    assert.equal(A.problem || Bg.problem, null);
    const oa = G.simplifyClosed(A.outline, 0.001), ob = G.simplifyClosed(Bg.outline, 0.001);
    for (let s = 0; s <= 24; s++) {
      const d = (2 * Math.PI / zA) * s / 24, a = turn(oa, d), b = turn(ob, Math.PI + Math.PI / zB - d * zA / zB, cd);
      const nearA = a.filter((q) => q.x > cd - Bg.basics.ra - 0.5), nearB = b.filter((q) => q.x < A.basics.ra + 0.5);
      for (const q of nearA) assert.ok(!inside(q, b), `${m} ${pa}° ${zA}:${zB} B ${B}: overlap at step ${s}, ${cd.toFixed(3)} apart`);
      for (const q of nearB) assert.ok(!inside(q, a), `${m} ${pa}° ${zA}:${zB} B ${B}: overlap at step ${s}`);
    }
  }
});

test('a rack meshes with its pinion along a whole pitch, never touching', () => {
  for (const [z, m, pa, B, r] of [[18, 3.5, 20, 0.3, 1.5875], [12, 4, 20, 0.3, 1.5875], [10, 6, 25, 0.4, 1.5875], [24, 2, 14.5, 0.2, 0.4]]) {
    const p = { module: m, pressureDeg: pa, backlash: B, bitRadius: r };
    const P = G.gear({ ...p, teeth: z }), R = G.makeRack({ ...p, teeth: 12, height: 8 });
    assert.equal(P.problem || R.problem, null);
    const rp = m * z / 2, xs = 6 * Math.PI * m, op = G.simplifyClosed(P.outline, 0.001), orr = G.simplifyClosed(R.outline, 0.001);
    let gap = Infinity;
    for (let s = -12; s <= 12; s++) {
      const th = (2 * Math.PI / z) * s / 24;
      // The pinion over a space with a tooth pointing down, rolling: the rack moves rp θ.
      const a = turn(op, -Math.PI / 2 + th).map((q) => ({ x: q.x + xs, y: q.y + rp }));
      const b = orr.map((q) => ({ x: q.x + rp * th, y: q.y }));
      const nearA = a.filter((q) => q.y < m + 0.5), nearB = b.filter((q) => q.y > -m - 1 && Math.abs(q.x - xs) < 3 * m * Math.PI);
      for (const q of nearA) assert.ok(!inside(q, b), `${z}T rack: overlap at step ${s}`);
      for (const q of nearB) assert.ok(!inside(q, a), `${z}T rack: overlap at step ${s}`);
      for (const q of nearA) for (let i = 0; i + 1 < nearB.length; i++) if (Math.abs(nearB[i].x - q.x) < 5) gap = Math.min(gap, G.distToSegment(q, nearB[i], nearB[i + 1]));
    }
    // On the flanks the gap is the backlash's; the rack's sharp tip corner
    // passes the pinion's rounded root a little closer, never touching.
    const want = B * Math.cos(pa * Math.PI / 180) / 2;
    assert.ok(gap <= want + 0.01 && gap >= 0.8 * want, `${z}T m${m} ${pa}°: closest ${gap.toFixed(4)}, flank gap ${want.toFixed(4)}`);
  }
});
