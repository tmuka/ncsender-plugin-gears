const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { startingFeeds } = require('../lib/starting-feeds.cjs');

test('startingFeeds: Conservative / Aggressive, the Z rate, and the same numbers as QuickCut', (t) => {
  const avg = startingFeeds(6.35, 2, 'hardwood', {}), con = startingFeeds(6.35, 2, 'hardwood', {}, 'conservative'), agg = startingFeeds(6.35, 2, 'hardwood', {}, 'aggressive');
  assert.ok(Math.abs(con.feedMm - avg.feedMm * 0.75) <= 1 && Math.abs(agg.feedMm - avg.feedMm * 1.25) <= 1);
  assert.ok(Math.abs(agg.stepMm - avg.stepMm * 1.2) < 1e-9 && Math.abs(con.stepMm - avg.stepMm * 0.75) < 1e-9);
  assert.equal(startingFeeds(6.35, 2, 'acrylic', {}, 'conservative').feedMm, startingFeeds(6.35, 2, 'acrylic', {}).feedMm, 'plastics keep the chip');
  assert.equal(startingFeeds(6.35, 2, 'mdf', { maxPlunge: 500 }).plungeMm, 500);
  // A big bit whose chip needs more than 4000 mm/min turns slower (not under 12000 RPM or $31), then gets
  // more feed up to the machine's max ($110): the chip stays the material's, not a thin one that burns.
  const big = startingFeeds(25.4, 2, 'mdf', { maxFeed: 10000 }), bigNoMax = startingFeeds(25.4, 2, 'mdf', {});
  assert.ok(big.rpmLowered && big.rpm === 12000, 'turned down to 12000: ' + big.rpm);
  assert.ok(Math.abs(big.chipMm - 0.25) < 1e-9 && big.feedMm === 6000, 'the full chip: ' + big.feedMm);
  assert.equal(bigNoMax.feedMm, 4000, 'no more than 4000 without the machine\u2019s max');
  assert.equal(startingFeeds(25.4, 2, 'mdf', { maxFeed: 10000, minRpm: 15000 }).rpm, 15000, 'not under the spindle\u2019s minimum');
  assert.ok(!startingFeeds(6.35, 2, 'mdf', { maxFeed: 10000 }).rpmLowered, 'a 1/4" bit keeps 18000');
  const qc = path.join(__dirname, '..', '..', 'ncsender-plugin-quickcut', 'lib', 'starting-feeds.cjs');
  if (!fs.existsSync(qc)) { t.skip('no QuickCut checkout beside this one'); return; }
  const other = require(qc).startingFeeds;
  for (const m of ['mdf', 'softwood', 'hardwood', 'hdpe', 'acrylic', 'polycarbonate', 'aluminum', 'foam'])
    for (const bit of [1, 3.175, 6.35, 12.7, 25.4, 50.8]) for (const fl of [1, 2, 3, 4]) for (const st of ['conservative', 'average', 'aggressive'])
      for (const L of [{}, { maxFeed: 2000, maxPlunge: 400, maxRpm: 16000 }, { maxFeed: 10000, maxPlunge: 3000, maxRpm: 24000, minRpm: 8000 }])
        assert.deepStrictEqual(startingFeeds(bit, fl, m, L, st), other(bit, fl, m, L, st), m + ' ' + bit + ' ' + fl + ' ' + st);
});
