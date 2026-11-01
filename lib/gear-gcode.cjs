// G-code for Gears: a gear's bore and lightening holes (cleared out, so no
// loose slugs), then its teeth (an outer profile, a bit radius out, with
// holding tabs on tooth tips); the pair side by side; or the frame's axle
// holes at the center distance. Ramps, depth passes and tabs follow
// QuickCut's: ramp down along the path at 5° or less, Z never faster than
// the Plunge Rate, a pass at the tabs' top. Programs are in mm (G21); an
// inch user's machine gets G20 back at the end.
// Inlined into config.html by .scripts/inline.cjs.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./gear-geometry.cjs'));
  else root.GearGcode = factory(root.GearGeometry);
})(this, function (G) {
  var TAU = 2 * Math.PI;
  var RAMP_SLOPE = Math.tan(5 * Math.PI / 180);
  var MIN_RAMP = 1;
  var f3 = function (v) { return (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3); };
  var f4 = function (v) { return (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4); };
  var comment = function (t) { return '(' + String(t).replace(/[()]/g, function (c) { return c === '(' ? '[' : ']'; }) + ')'; };

  // The depths of the passes, each no deeper than step, with one at the
  // tabs' top so they come out the height asked.
  function depthLevels(depth, step, tabTop) {
    var levels = [], cur = 0;
    while (cur < depth - 1e-9) {
      var next = Math.min(depth, cur + step);
      if (tabTop != null && cur < tabTop - 1e-9 && next > tabTop + 1e-9) levels.push(tabTop);
      levels.push(next);
      cur = next;
    }
    return levels;
  }

  // The feed along a ramp of this slope (drop per length) that lowers Z
  // no faster than the plunge rate.
  function slopeFeed(slope, feed, plunge) {
    if (slope <= RAMP_SLOPE * 1.001) return feed;
    return Math.max(1, Math.min(feed, Math.round(plunge * Math.sqrt(1 + slope * slope) / slope)));
  }

  // A closed path as segments with their lengths, for walking along it.
  function segmentsOf(path) {
    var segs = [], total = 0;
    for (var i = 0; i < path.length; i++) {
      var a = path[i], b = path[(i + 1) % path.length], L = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ a: a, b: b, len: L, at: total });
      total += L;
    }
    return { segs: segs, total: total };
  }
  function pointAt(sg, s) {
    s = ((s % sg.total) + sg.total) % sg.total;
    var lo = 0, hi = sg.segs.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (sg.segs[mid].at <= s) lo = mid; else hi = mid - 1; }
    var g = sg.segs[lo], f = g.len ? (s - g.at) / g.len : 0;
    return { x: g.a.x + (g.b.x - g.a.x) * f, y: g.a.y + (g.b.y - g.a.y) * f };
  }
  // The points of the path from s0 to s1 (s1 > s0, may pass the start).
  function walk(sg, s0, s1) {
    var pts = [pointAt(sg, s0)], n = sg.segs.length;
    var base = Math.floor(s0 / sg.total) * sg.total;
    for (var k = 0; k < 2 * n + 2; k++) {
      var g = sg.segs[k % n], end = base + Math.floor(k / n) * sg.total + g.at + g.len;
      if (end <= s0 + 1e-9) continue;
      if (end >= s1 - 1e-9) break;
      pts.push({ x: g.b.x, y: g.b.y });
    }
    pts.push(pointAt(sg, s1));
    return pts;
  }

  // Down from fromZ to toZ along the path from s, back and forth within
  // room, no steeper than 5° (up to 8 trips, then steeper with the feed
  // slowed); a plunge when there's under 1 mm. Ends back at s.
  function rampIn(L, sg, s, room, fromZ, toZ, feed, plunge) {
    var drop = fromZ - toZ;
    L.push('G1 Z' + f3(fromZ) + ' F' + plunge);
    if (drop <= 1e-9) return;
    if (room < MIN_RAMP) { L.push('G1 Z' + f3(toZ) + ' F' + plunge); return; }
    var len = Math.min(room, drop / (2 * RAMP_SLOPE));
    var trips = Math.min(8, Math.ceil(drop / (2 * len * RAMP_SLOPE) - 1e-9));
    var out = walk(sg, s, s + len), back = out.slice().reverse();
    var perLen = drop / (2 * trips * len), rf = slopeFeed(perLen, feed, plunge), first = true, z = fromZ;
    for (var t = 0; t < trips; t++) {
      [out, back].forEach(function (pts, half) {
        for (var i = 1; i < pts.length; i++) {
          z -= Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * perLen;
          var last = t === trips - 1 && half === 1 && i === pts.length - 1;
          L.push('G1 X' + f4(pts[i].x) + ' Y' + f4(pts[i].y) + ' Z' + f3(last ? toZ : z) + (first ? ' F' + rf : ''));
          first = false;
        }
      });
    }
    if (rf !== feed) L.push('F' + feed);
  }

  // One lap of a closed path at cutZ from s0, rising to tabZ over each tab
  // (intervals of path length, sorted, within one lap from s0) and ramping
  // back down after it. The lap's entry is a ramp from fromZ.
  function lap(L, sg, s0, tabs, cutZ, tabZ, fromZ, feed, plunge) {
    var nextTab = function (s) {
      for (var i = 0; i < tabs.length; i++) if (tabs[i][0] >= s - 1e-9) return tabs[i][0];
      return s0 + sg.total;
    };
    rampIn(L, sg, s0, nextTab(s0) - s0, fromZ, cutZ, feed, plunge);
    var s = s0, floor = fromZ;
    tabs.forEach(function (iv) {
      walk(sg, s, iv[0]).slice(1).forEach(function (q) { L.push('G1 X' + f4(q.x) + ' Y' + f4(q.y)); });
      L.push('G1 Z' + f3(tabZ) + ' F' + plunge + ' ; Tab');
      var over = walk(sg, iv[0], iv[1]).slice(1);
      over.forEach(function (q, i) { L.push('G1 X' + f4(q.x) + ' Y' + f4(q.y) + (i === 0 ? ' F' + feed : '')); });
      // Down off the tab, from the last pass's floor: above it is cut already.
      rampIn(L, sg, iv[1], nextTab(iv[1] + 1e-6) - iv[1], Math.min(tabZ, floor), cutZ, feed, plunge);
      s = iv[1];
    });
    walk(sg, s, s0 + sg.total).slice(1).forEach(function (q) { L.push('G1 X' + f4(q.x) + ' Y' + f4(q.y)); });
  }

  // A round hole, cleared out from the middle: at each pass a helix down
  // (or a plunge when there's no room), then rings out to the edge. When
  // the hole is the bit's size, pecks at the plunge rate.
  function hole(L, h, o) {
    var r = o.bitDiameter / 2, R = h.diameter / 2 - r, step = Math.max(0.05, o.bitDiameter * (o.stepoverPct || 40) / 100);
    var levels = depthLevels(h.depth, o.depthOfCut, null);
    L.push(comment(h.label + ': ' + h.diameter.toFixed(2) + ' mm, ' + h.depth.toFixed(2) + ' mm deep'));
    L.push('G0 X' + f4(h.x) + ' Y' + f4(h.y));
    L.push('G0 Z' + f3(o.hop));
    if (R < 0.01) {
      // The bit's own size: plunge, lifting out between pecks to clear chips.
      var z = 0;
      levels.forEach(function (d) {
        L.push('G1 Z' + f3(Math.min(o.hop, -z + 0.5)) + ' F' + o.plungeFeedRate);
        L.push('G1 Z' + f3(-d) + ' F' + o.plungeFeedRate);
        L.push('G0 Z' + f3(o.hop));
        z = d;
      });
      return;
    }
    var rh = Math.min(R, r * 0.6), lapLen = TAU * rh, prev = 0;
    L.push('G0 X' + f4(h.x + rh) + ' Y' + f4(h.y));
    L.push('G1 Z0.000 F' + o.plungeFeedRate);
    levels.forEach(function (d) {
      var target = -d;
      L.push('G1 X' + f4(h.x + rh) + ' Y' + f4(h.y) + ' F' + o.feedRate);
      if (lapLen < MIN_RAMP) {
        L.push('G1 Z' + f3(target) + ' F' + o.plungeFeedRate);
      } else {
        var turns = Math.min(64, Math.max(1, Math.ceil((prev - target) / (lapLen * RAMP_SLOPE) - 1e-9)));
        var hf = ' F' + slopeFeed((prev - target) / turns / lapLen, o.feedRate, o.plungeFeedRate);
        for (var t = 1; t <= turns; t++) {
          var mid = prev + (target - prev) * (t - 0.5) / turns, end = prev + (target - prev) * t / turns;
          L.push('G3 X' + f4(h.x - rh) + ' Y' + f4(h.y) + ' I' + f4(-rh) + ' J0 Z' + f3(mid) + hf);
          L.push('G3 X' + f4(h.x + rh) + ' Y' + f4(h.y) + ' I' + f4(rh) + ' J0 Z' + f3(t === turns ? target : end) + hf);
        }
      }
      // Rings out to the edge, then once round it.
      var rings = [];
      for (var rr = rh; rr < R - 1e-6; rr += step) rings.push(rr);
      rings.push(R);
      rings.forEach(function (rr, i) {
        if (i > 0 || Math.abs(rr - rh) > 1e-6) L.push('G1 X' + f4(h.x + rr) + ' Y' + f4(h.y) + ' F' + o.feedRate);
        L.push('G3 X' + f4(h.x - rr) + ' Y' + f4(h.y) + ' I' + f4(-rr) + ' J0 F' + o.feedRate);
        L.push('G3 X' + f4(h.x + rr) + ' Y' + f4(h.y) + ' I' + f4(rr) + ' J0');
      });
      prev = target;
    });
    L.push('G0 Z' + f3(o.hop));
  }

  // Where each gear's holes go: the bore, and lightening holes in a ring
  // between the hub and the rim. Their problems name the field to change.
  function gearHoles(g, info, o, label) {
    var out = [], probs = [], r = o.bitDiameter / 2;
    if (g.bore > 0) {
      if (g.bore < o.bitDiameter - 1e-6) probs.push(label + '’s Bore is smaller than the bit');
      out.push({ label: label + ' bore', diameter: g.bore, dx: 0, dy: 0 });
    }
    var n = Math.round(g.holes || 0);
    if (n > 0) {
      var hub = g.bore / 2 + Math.max(g.hub || 0, 0.15 * info.basics.rf, o.bitDiameter), rim = info.basics.rf - Math.max(g.rim || 0, 1.5 * info.basics.m);
      var ring = (hub + rim) / 2, room = rim - hub;
      var dia = g.holeDiameter > 0 ? g.holeDiameter : Math.min(room, 2 * ring * Math.sin(Math.PI / n) - Math.max(4, 0.35 * room));
      if (!(room > 0) || !(dia >= o.bitDiameter) || dia > room + 1e-6 || dia > 2 * ring * Math.sin(Math.PI / n) - 1) {
        probs.push(label + '’s lightening holes don’t fit between the hub and the rim: fewer or smaller holes, or a bigger gear');
      } else {
        for (var k = 0; k < n; k++) {
          var a = (k + 0.5) * TAU / n;
          out.push({ label: label + ' lightening hole ' + (k + 1), diameter: dia, dx: ring * Math.cos(a), dy: ring * Math.sin(a) });
        }
      }
    }
    return { holes: out, problems: probs };
  }

  // Tabs on the tips of n teeth spread round the gear: path-length
  // intervals Tab Width plus the bit wide, centered on each tip.
  function tipTabs(sg, path, z, n, width, bitDiameter, rot) {
    if (!(n > 0)) return [];
    var picks = [], used = {};
    for (var k = 0; k < n; k++) { var t = Math.round(k * z / n) % z; if (!used[t]) { used[t] = 1; picks.push(t); } }
    var half = (width + bitDiameter) / 2;
    return picks.map(function (t) {
      var a = t * TAU / z + rot, best = -1, bs = 0;
      sg.segs.forEach(function (g) {
        var d = g.a.x * Math.cos(a) + g.a.y * Math.sin(a) - Math.abs(-g.a.x * Math.sin(a) + g.a.y * Math.cos(a)) * 4;
        if (d > best) { best = d; bs = g.at; }
      });
      return bs;
    }).map(function (s) { return [s - half, s + half]; });
  }

  function plan(o) {
    var problems = [], notes = [], r = o.bitDiameter / 2;
    var base = { module: o.module, pressureDeg: o.pressureDeg, backlash: o.backlash, clearance: o.clearance, bitRadius: r };
    var which = o.job === 'both' ? ['A', 'B'] : o.job === 'frame' ? [] : [o.job];
    var info = {}, pr = G.pair(base, o.gears.A.teeth, o.gears.B.teeth);
    ['A', 'B'].forEach(function (k) {
      info[k] = G.gear(Object.assign({ teeth: o.gears[k].teeth }, base));
      if (info[k].problem && (which.indexOf(k) >= 0 || o.job === 'frame')) problems.push('Gear ' + k + ': ' + info[k].problem);
      (info[k].notes || []).forEach(function (n) { if (which.indexOf(k) >= 0) notes.push('Gear ' + k + ': ' + n); });
    });
    if (!(o.depth > 0)) problems.push('Total Depth must be more than 0');
    if (!(o.depthOfCut > 0)) problems.push('Depth of Cut must be more than 0');
    if (o.tabs && o.tabs.count > 0 && !(o.tabs.height < o.depth)) problems.push('Tab Height must be less than Total Depth');
    return { problems: problems, notes: notes, info: info, pair: pr, which: which, base: base };
  }

  // The whole program. All lengths mm, feeds mm/min.
  function generate(o) {
    var p = plan(o), r = o.bitDiameter / 2;
    if (p.problems.length) return { problems: p.problems, notes: p.notes, gcode: null };
    o = Object.assign({ hop: 5, stepoverPct: 40, gap: 6, direction: 'conventional' }, o);
    var L = [], parts = [], placed = [];
    // Gear A at (0, 0), B beside it in +X with gap between the cuts.
    var xB = 0;
    if (p.which.length === 2) xB = p.info.A.basics.ra + p.info.B.basics.ra + 2 * o.bitDiameter + o.gap;
    p.which.forEach(function (k) { placed.push({ key: k, x: k === 'B' && p.which.length === 2 ? xB : 0, y: 0 }); });
    var holes = [];
    placed.forEach(function (pl) {
      var gh = gearHoles(o.gears[pl.key], p.info[pl.key], o, 'Gear ' + pl.key);
      gh.problems.forEach(function (q) { p.problems.push(q); });
      pl.holes = gh.holes.map(function (h) { return Object.assign({}, h, { x: pl.x + h.dx, y: pl.y + h.dy, depth: o.depth }); });
    });
    if (o.job === 'frame') {
      ['A', 'B'].forEach(function (k, i) {
        var d = o.frame && o.frame[k] > 0 ? o.frame[k] : o.gears[k].bore;
        if (!(d >= o.bitDiameter - 1e-6)) p.problems.push('Frame hole ' + k + ' must be at least the bit’s diameter');
        holes.push({ label: 'Axle hole ' + k, diameter: d, x: i ? p.pair.centerDistance : 0, y: 0, depth: o.depth });
      });
    }
    if (p.problems.length) return { problems: p.problems, notes: p.notes, gcode: null };
    // Origin: Gear A's center, or the front-left corner of what's cut.
    var ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    var grow = function (x, y, rr) { ext.x0 = Math.min(ext.x0, x - rr); ext.x1 = Math.max(ext.x1, x + rr); ext.y0 = Math.min(ext.y0, y - rr); ext.y1 = Math.max(ext.y1, y + rr); };
    placed.forEach(function (pl) { grow(pl.x, pl.y, p.info[pl.key].basics.ra + o.bitDiameter); });
    holes.forEach(function (h) { grow(h.x, h.y, h.diameter / 2); });
    var sx = 0, sy = 0;
    if (o.origin === 'front-left') { sx = -ext.x0; sy = -ext.y0; }
    var unitNote = o.imperial ? ' (the program is in mm; G20 at the end puts the machine back in inches)' : '';
    L.push(comment('Gears: ' + (o.job === 'frame' ? 'frame holes' : p.which.map(function (k) { return 'Gear ' + k + ' ' + o.gears[k].teeth + ' teeth'; }).join(', '))));
    L.push(comment('Module ' + o.module + ' mm, ' + o.pressureDeg + ' deg pressure angle, backlash ' + o.backlash + ' mm, tip clearance ' + (+o.clearance.toFixed(3)) + ' mm'));
    L.push(comment('Pair ' + o.gears.A.teeth + ':' + o.gears.B.teeth + ', center distance ' + p.pair.centerDistance.toFixed(3) + ' mm'));
    L.push(comment('Z0: the top of the stock. X0 Y0: ' + (o.origin === 'front-left' ? 'the front-left corner of the cuts' : (o.job === 'frame' ? 'axle hole A' : 'Gear ' + p.which[0] + '’s center'))));
    L.push(comment('Bit ' + o.bitDiameter + ' mm, feed ' + o.feedRate + ' mm/min, plunge ' + o.plungeFeedRate + ' mm/min, ' + o.spindleRpm + ' RPM' + unitNote));
    p.notes.forEach(function (n) { L.push(comment('Note: ' + n)); });
    L.push('');
    L.push('G21 ; mm');
    L.push('G17 G90 G94');
    var safe = typeof o.safeZHeightMm === 'number' && isFinite(o.safeZHeightMm) ? 'G53 G0 Z' + f3(o.safeZHeightMm) : 'G53 G0 Z0';
    L.push(safe + ' ; Safe Z');
    if (o.toolNumber > 0) { L.push('M6 T' + o.toolNumber + ' ; Tool change'); L.push('G21 G90'); L.push(safe); }
    if (o.mist) L.push('M7');
    if (o.flood) L.push('M8');
    if (o.spindleRpm > 0) { L.push('M3 S' + o.spindleRpm); if (o.spindleDelay > 0) L.push('G4 P' + o.spindleDelay); }
    var oo = Object.assign({}, o);
    holes.forEach(function (h) { hole(L, Object.assign({}, h, { x: h.x + sx, y: h.y + sy }), oo); });
    placed.forEach(function (pl) {
      var info = p.info[pl.key];
      pl.holes.forEach(function (h) { hole(L, Object.assign({}, h, { x: h.x + sx, y: h.y + sy }), oo); });
      var path = G.toolPath(info, r, 0.003).slice();
      // Conventional milling on an outside cut runs clockwise round the part.
      if (o.direction !== 'climb') path.reverse();
      path = path.map(function (q) { return { x: q.x + pl.x + sx, y: q.y + pl.y + sy }; });
      var sg = segmentsOf(path);
      // Start in the middle of the space before tooth 0, deepest on the path.
      var sa = -Math.PI / info.basics.z, s0 = 0, best = Infinity;
      sg.segs.forEach(function (g) {
        var x = g.a.x - pl.x - sx, y = g.a.y - pl.y - sy, d = Math.hypot(x, y) + Math.abs(Math.atan2(y, x) - sa) * 1000;
        if (d < best) { best = d; s0 = g.at; }
      });
      var tabs = o.tabs && o.tabs.count > 0 ? tipTabs(sg, path.map(function (q) { return { x: q.x - pl.x - sx, y: q.y - pl.y - sy }; }), info.basics.z, o.tabs.count, o.tabs.width, o.bitDiameter, 0) : [];
      tabs = tabs.map(function (iv) { var a = iv[0]; while (a < s0) a += sg.total; while (a >= s0 + sg.total) a -= sg.total; return [a, a + iv[1] - iv[0]]; })
        .sort(function (a, b) { return a[0] - b[0]; });
      var tabTop = tabs.length ? o.depth - o.tabs.height : null;
      var levels = depthLevels(o.depth, o.depthOfCut, tabTop);
      var start = pointAt(sg, s0);
      L.push(comment('Gear ' + pl.key + ' teeth: ' + info.basics.z + ', outside diameter ' + (2 * info.basics.ra).toFixed(3) + ' mm' + (tabs.length ? ', ' + tabs.length + ' tabs ' + o.tabs.height + ' mm high on tooth tips' : '')));
      L.push('G0 X' + f4(start.x) + ' Y' + f4(start.y));
      L.push('G0 Z' + f3(o.hop));
      var prev = 0;
      levels.forEach(function (d) {
        var useTabs = tabTop != null && d > tabTop + 1e-9;
        lap(L, sg, s0, useTabs ? tabs : [], -d, -tabTop, -prev, o.feedRate, o.plungeFeedRate);
        prev = d;
      });
      L.push('G0 Z' + f3(o.hop));
      parts.push({ key: pl.key, x: pl.x + sx, y: pl.y + sy, path: path });
    });
    L.push(safe + ' ; Safe Z');
    if (o.mist || o.flood) L.push('M9');
    if (o.spindleRpm > 0) L.push('M5');
    if (o.imperial) L.push('G20 ; Back to inches');
    L.push('M30');
    return { problems: [], notes: p.notes, gcode: L.join('\n') + '\n', parts: parts, holes: holes, pair: p.pair, info: p.info,
             extent: { x0: ext.x0 + sx, y0: ext.y0 + sy, x1: ext.x1 + sx, y1: ext.y1 + sy } };
  }

  return { generate: generate, plan: plan, depthLevels: depthLevels, slopeFeed: slopeFeed, gearHoles: gearHoles, RAMP_SLOPE: RAMP_SLOPE };
});
