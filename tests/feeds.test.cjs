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
  const qc = path.join(__dirname, '..', '..', 'ncsender-plugin-quickcut', 'lib', 'starting-feeds.cjs');
  if (!fs.existsSync(qc)) { t.skip('no QuickCut checkout beside this one'); return; }
  const other = require(qc).startingFeeds;
  for (const m of ['mdf', 'softwood', 'hardwood', 'hdpe', 'acrylic', 'polycarbonate', 'aluminum', 'foam'])
    for (const bit of [1, 3.175, 6.35, 12.7]) for (const fl of [1, 2, 3, 4]) for (const st of ['conservative', 'average', 'aggressive'])
      for (const L of [{}, { maxFeed: 2000, maxPlunge: 400, maxRpm: 16000 }])
        assert.deepStrictEqual(startingFeeds(bit, fl, m, L, st), other(bit, fl, m, L, st), m + ' ' + bit + ' ' + fl + ' ' + st);
});
