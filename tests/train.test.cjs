const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/gear-geometry.cjs');
const GC = require('../lib/gear-gcode.cjs');

const ratioOf = (o) => o.stages.reduce((q, s) => q * s.driven / s.driver, 1);

test('a train for a ratio: exact when whole teeth allow, fewest stages first, in the teeth range', () => {
  for (const [R, n] of [[60, 0], [12, 0], [100, 3], [0.25, 0], [1.5, 0], [2, 2], [7.3, 0]]) {
    const r = G.solveTrain({ ratio: R, stages: n, minTeeth: 8, maxTeeth: 72 });
    assert.ok(r.options && r.options.length, `${R}: ${r.problem}`);
    let prev = 0;
    for (const o of r.options) {
      assert.ok(Math.abs(ratioOf(o) - o.ratio) < 1e-9);
      assert.ok(o.error <= 0.005 + 1e-12, `${R}: ${o.ratio}`);
      if (n) assert.equal(o.stages.length, n);
      assert.ok(o.stages.length > prev, 'fewest stages first, one option each');
      prev = o.stages.length;
      for (const s of o.stages) {
        assert.ok(s.driver >= 8 && s.driver <= 72 && s.driven >= 8 && s.driven <= 72, JSON.stringify(s));
        if (o.stages.length > 1) assert.notEqual(s.driver, s.driven, 'no 1:1 stage');
      }
    }
  }
  // Exact where it can be: 60:1 is 7.5 × 8, and the smallest such train.
  const sixty = G.solveTrain({ ratio: 60, minTeeth: 8, maxTeeth: 72 }).options[0];
  assert.equal(sixty.error, 0);
  assert.deepStrictEqual(sixty.stages, [{ driver: 8, driven: 60 }, { driver: 8, driven: 64 }]);
  // 7.3 is 73/10, and 73 is prime, more teeth than any gear has: near, never
  // exact, each more stages at least twice as near.
  const seven = G.solveTrain({ ratio: 7.3, minTeeth: 8, maxTeeth: 72 }).options;
  assert.ok(seven.every((o) => o.error > 0));
  for (let i = 1; i < seven.length; i++) assert.ok(seven[i].error < seven[i - 1].error / 2);
  // More stages only when they make the biggest gear smaller.
  assert.equal(G.solveTrain({ ratio: 1.5, minTeeth: 8, maxTeeth: 72 }).options.length, 1);
});

test('a train it can’t make, or no ratio, says so', () => {
  assert.ok(G.solveTrain({ ratio: 3600, minTeeth: 8, maxTeeth: 72 }).problem);
  assert.ok(G.solveTrain({ ratio: null }).problem);
  assert.ok(G.solveTrain({ ratio: 5, minTeeth: 40, maxTeeth: 20 }).problem);
});

test('a train fast enough to type into on the Pi', () => {
  for (const R of [60, 12, 7.3, Math.PI, 365.25]) {
    const t = Date.now();
    G.solveTrain({ ratio: R, minTeeth: 8, maxTeeth: 72 });
    assert.ok(Date.now() - t < 1000, `${R}: ${Date.now() - t} ms`);
  }
});

test('the layout: axles a center distance apart, and a gear reaching another axle’s shaft found', () => {
  const L = G.trainLayout({ module: 2 }, [{ driver: 8, driven: 60 }, { driver: 8, driven: 64 }], 8, 0.5);
  assert.deepStrictEqual(L.axles, [0, 68, 140]);
  assert.equal(L.ratio, 60);
  assert.equal(L.hits.length, 0);
  assert.equal(L.gears.length, 4);
  // A 60-tooth wheel (tips 62 mm out) on axle 2, 38 mm from axle 3.
  const bad = G.trainLayout({ module: 2 }, [{ driver: 8, driven: 60 }, { driver: 30, driven: 8 }], 8, 0.5);
  assert.deepStrictEqual(bad.hits.map((h) => [h.gear.stage, h.gear.role, h.axle]), [[0, 'driven', 2]]);
});

test('a train’s frame: a hole at every axle, safe', () => {
  const o = { job: 'frame', module: 4, pressureDeg: 20, backlash: 0.3, bitDiameter: 3.175, feedRate: 1000, plungeFeedRate: 300, spindleRpm: 18000,
    depth: 19, depthOfCut: 3, tabs: null, gears: { A: { teeth: 8, bore: 8 }, B: { teeth: 60, bore: 8 } }, origin: 'center',
    axles: [{ x: 0, diameter: 8 }, { x: 136, diameter: 8 }, { x: 280, diameter: 8 }] };
  const r = GC.generate(o);
  assert.deepStrictEqual(r.problems, []);
  assert.deepStrictEqual(r.holes.map((h) => h.x), [0, 136, 280]);
  assert.match(r.gcode, /\(Gear train: 3 axles at X 0.000, 136.000, 280.000 mm\)/);
  const zs = r.gcode.split('\n').map((l) => /Z(-?[\d.]+)/.exec(l)).filter(Boolean).map((m) => +m[1]);
  assert.ok(Math.min(...zs) >= -19 - 1e-6);
  assert.ok(GC.generate({ ...o, axles: [{ x: 0, diameter: 2 }, { x: 68, diameter: 8 }] }).problems.length);
});

test('a whole train in one program: every gear, packed apart, safe', () => {
  const body = (z, holes) => ({ teeth: z, bore: 8, holes, holeStyle: 'spokes' });
  const many = [[8, 0], [24, 4], [8, 0], [32, 5]].map(([z, h], i) => ({ label: 'Gear ' + (i + 1) + ' of ' + z, body: body(z, h) }));
  const o = { job: 'all', module: 3.5, pressureDeg: 20, backlash: 0.3, bitDiameter: 3.175, feedRate: 1000, plungeFeedRate: 300, spindleRpm: 18000,
    depth: 6, depthOfCut: 3, tabs: { count: 3, width: 4, height: 1.5 }, gears: { A: body(8, 0), B: body(24, 4) }, origin: 'center', many };
  const r = GC.generate(o);
  assert.deepStrictEqual(r.problems, []);
  assert.equal(r.parts.length, 4);
  // Biggest first; every pair of gears at least the least gap apart, tip to tip.
  const ra = (z) => 3.5 * (z + 2) / 2;
  assert.match(r.gcode, /\(Gears: a gear train, 4 gears: 8, 24, 8, 32 teeth\)/);
  const teeth = r.parts.map((q) => r.info[q.key].basics.z);
  assert.deepStrictEqual(teeth, [32, 24, 8, 8]);
  for (let i = 0; i < r.parts.length; i++) for (let j = i + 1; j < r.parts.length; j++) {
    const a = r.parts[i], b = r.parts[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= ra(teeth[i]) + ra(teeth[j]) + GC.gapMinimum(3.175) - 1e-9, `${i} ${j}`);
  }
  const zs2 = r.gcode.split('\n').map((l) => /Z(-?[\d.]+)/.exec(l)).filter(Boolean).map((m) => +m[1]);
  assert.ok(Math.min(...zs2) >= -6 - 1e-6);
  assert.ok(GC.generate({ ...o, gap: 1 }).problems.length, 'a gap under the least is refused');
  // Rows no wider than the stock.
  const packed = GC.packRows([1, 2, 3, 4, 5].map((k) => ({ key: k, ra: 10 })), 4, 60);
  assert.ok(Math.max(...packed.map((q) => q.x + 10)) - Math.min(...packed.map((q) => q.x - 10)) <= 60 + 1e-9);
});
