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
    if (room < MIN_RAMP) { L.push('G1 Z' + f3(toZ) + ' F' + plunge); L.push('F' + feed); return; }
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

  // A hex hole's corners for the bit's center at apothem a: on ±X, CCW.
  function hexCorners(cx, cy, a) {
    var out = [], R = a / Math.cos(Math.PI / 6);
    for (var k = 0; k < 6; k++) out.push({ x: cx + R * Math.cos(k * Math.PI / 3), y: cy + R * Math.sin(k * Math.PI / 3) });
    return out;
  }
  // How far past a hex lap's corner the bit runs (a dog-bone, out from the
  // middle) so its edge reaches the sharp corner of the hole.
  var hexBone = function (r) { return r * (1 / Math.sin(Math.PI / 3) - 1); };
  // A dog-bone at a corner of a counter-clockwise lap of the bit's center
  // (u in, v out, unit, turning left): the point the bit runs out to, along
  // the corner's bisector, so its edge reaches the sharp corner. null when
  // the corner needs none.
  function bone(c, u, v, r) {
    if (u.x * v.y - u.y * v.x < 1e-9) return null;
    var sinHalf = Math.sqrt((1 + u.x * v.x + u.y * v.y) / 2), d = r * (1 / sinHalf - 1);
    var bx = u.x - v.x, by = u.y - v.y, bl = Math.hypot(bx, by);
    return d > 1e-6 && bl > 1e-9 ? { x: c.x + bx / bl * d, y: c.y + by / bl * d } : null;
  }
  // A hole's true outline (for the preview), about its center: round, hex
  // (corners on ±X), D (the flat across +X, `flat` from it to the far
  // side), keyed (the keyway up +Y, keyWidth wide, keyDepth past the bore).
  function boreOutline(h, step) {
    var R = h.diameter / 2, pts = [], n, i, a;
    step = step || Math.PI / 90;
    if (h.shape === 'hex') return hexCorners(0, 0, R);
    if (h.shape === 'dflat') {
      var f = h.flat - R, ph = Math.acos(Math.max(-1, Math.min(1, f / R)));
      n = Math.ceil((TAU - 2 * ph) / step);
      for (i = 0; i <= n; i++) { a = ph + (TAU - 2 * ph) * i / n; pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); }
      return pts;
    }
    if (h.shape === 'keyway') {
      var hw = h.keyWidth / 2, top = R + h.keyDepth, a0 = Math.asin(Math.min(1, hw / R));
      // From the keyway's right wall round the circle to its left wall.
      var from = Math.PI / 2 + a0, to = Math.PI / 2 - a0 + TAU;
      n = Math.ceil((to - from) / step);
      for (i = 0; i <= n; i++) { a = from + (to - from) * i / n; pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); }
      pts.push({ x: hw, y: top }, { x: -hw, y: top });
      return pts;
    }
    n = Math.ceil(TAU / step);
    for (i = 0; i < n; i++) { a = TAU * i / n; pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); }
    return pts;
  }
  // How far a hole reaches from its center (the bit's dog-bones included).
  function boreReach(h, r) {
    if (h.shape === 'hex') return (h.diameter / 2 - r) / Math.cos(Math.PI / 6) + hexBone(r) + r;
    if (h.shape === 'keyway') return Math.max(h.diameter / 2, Math.hypot(h.keyWidth / 2, h.diameter / 2 + h.keyDepth));
    return h.diameter / 2;
  }

  // A hole, cleared out from the middle: at each pass a helix down (or a
  // plunge when there's no room), then rings out to the edge. When the hole
  // is the bit's size, pecks at the plunge rate. A hex hole (h.shape 'hex',
  // h.diameter across the flats) is cleared in hex rings, the last with a
  // dog-bone into each corner so a sharp-cornered shaft fits.
  function hole(L, h, o) {
    // Inside a hole, conventional milling runs clockwise (G2), climb counter-clockwise (G3).
    var hex = h.shape === 'hex', G = o.direction === 'climb' ? 'G3' : 'G2', ccw = o.direction === 'climb';
    var r = o.bitDiameter / 2, R = h.diameter / 2 - r, step = Math.max(0.05, o.bitDiameter * (o.stepoverPct || 40) / 100);
    var levels = depthLevels(h.depth, o.depthOfCut, null);
    L.push(comment(h.label + ': ' + h.diameter.toFixed(2) + ' mm' + (hex ? ' across the flats' : h.shape === 'dflat' ? ', ' + h.flat.toFixed(2) + ' mm across the flat' :
      h.shape === 'keyway' ? ', keyway ' + h.keyWidth.toFixed(2) + ' mm wide, ' + h.keyDepth.toFixed(2) + ' mm deep' : '') + ', ' + h.depth.toFixed(2) + ' mm deep'));
    if (h.shape === 'dflat') { dHole(L, h, o, levels); return; }
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
          L.push(G + ' X' + f4(h.x - rh) + ' Y' + f4(h.y) + ' I' + f4(-rh) + ' J0 Z' + f3(mid) + hf);
          L.push(G + ' X' + f4(h.x + rh) + ' Y' + f4(h.y) + ' I' + f4(rh) + ' J0 Z' + f3(t === turns ? target : end) + hf);
        }
      }
      // Rings out to the edge, then once round it.
      var rings = [];
      for (var rr = rh; rr < R - 1e-6; rr += step) rings.push(rr);
      rings.push(R);
      if (hex) {
        rings.forEach(function (rr, i) {
          var c = hexCorners(h.x, h.y, rr), last = i === rings.length - 1, out = 1 + hexBone(r) / (c[0].x - h.x);
          L.push('G1 X' + f4(c[0].x) + ' Y' + f4(c[0].y) + ' F' + o.feedRate);
          for (var k = 1; k <= 6; k++) {
            var q = c[ccw ? k % 6 : (6 - k) % 6];
            L.push('G1 X' + f4(q.x) + ' Y' + f4(q.y));
            if (last) {
              L.push('G1 X' + f4(h.x + (q.x - h.x) * out) + ' Y' + f4(h.y + (q.y - h.y) * out) + ' ; Corner relief');
              L.push('G1 X' + f4(q.x) + ' Y' + f4(q.y));
            }
          }
        });
        prev = target;
        return;
      }
      rings.forEach(function (rr, i) {
        if (i > 0 || Math.abs(rr - rh) > 1e-6) L.push('G1 X' + f4(h.x + rr) + ' Y' + f4(h.y) + ' F' + o.feedRate);
        L.push(G + ' X' + f4(h.x - rr) + ' Y' + f4(h.y) + ' I' + f4(-rr) + ' J0 F' + o.feedRate);
        L.push(G + ' X' + f4(h.x + rr) + ' Y' + f4(h.y) + ' I' + f4(rr) + ' J0');
      });
      if (h.shape === 'keyway') keyway(L, h, o, r);
      prev = target;
    });
    L.push('G0 Z' + f3(o.hop));
  }
  // A lap of points (about the hole's center), counter-clockwise, with
  // dog-bones at the corners named in `bones` (indices, or { i, tip } when
  // the tip is worked out exactly); clockwise for conventional milling.
  // Ends where it started.
  function lap2(L, h, pts, bones, o, r, first) {
    var seq = [];
    pts.forEach(function (q, i) {
      seq.push({ x: q.x, y: q.y });
      var given = (bones || []).filter(function (b) { return b === i || (b && b.i === i); })[0];
      if (given != null) {
        var n = pts.length, pv = pts[(i - 1 + n) % n], nx = pts[(i + 1) % n], tip = given.tip;
        if (!tip) {
          var lu = Math.hypot(q.x - pv.x, q.y - pv.y), lv = Math.hypot(nx.x - q.x, nx.y - q.y);
          tip = lu > 1e-9 && lv > 1e-9 && bone(q, { x: (q.x - pv.x) / lu, y: (q.y - pv.y) / lu }, { x: (nx.x - q.x) / lv, y: (nx.y - q.y) / lv }, r);
        }
        if (tip) seq.push({ x: tip.x, y: tip.y, relief: true }, { x: q.x, y: q.y });
      }
    });
    seq.push({ x: pts[0].x, y: pts[0].y });
    if (o.direction !== 'climb') seq.reverse();
    seq.forEach(function (q, i) {
      L.push('G1 X' + f4(h.x + q.x) + ' Y' + f4(h.y + q.y) + (i === 0 && first ? ' F' + o.feedRate : '') + (q.relief ? ' ; Corner relief' : ''));
    });
  }
  // The keyway, from the cleared middle up +Y: laps of the slot's bit
  // centers, the outer one with dog-bones in its far corners.
  function keyway(L, h, o, r) {
    var a = h.keyWidth / 2 - r, top = h.diameter / 2 + h.keyDepth - r, step = Math.max(0.05, o.bitDiameter * (o.stepoverPct || 40) / 100);
    L.push('G1 X' + f4(h.x) + ' Y' + f4(h.y) + ' F' + o.feedRate);
    if (a < 0.01) {
      L.push('G1 Y' + f4(h.y + top) + ' ; Corner relief');
      L.push('G1 Y' + f4(h.y));
      return;
    }
    for (var w = a, first = true; ; w = Math.max(0, w - step), first = false) {
      // Counter-clockwise: right wall up, across the top, left wall down.
      var pts = [{ x: w, y: 0 }, { x: w, y: top }, { x: -w, y: top }, { x: -w, y: 0 }];
      L.push('G1 X' + f4(h.x + w) + ' Y' + f4(h.y));
      lap2(L, h, pts, first ? [1, 2] : null, o, r, false);
      if (w <= r + 1e-9) break;
    }
    L.push('G1 X' + f4(h.x) + ' Y' + f4(h.y));
  }
  // A D hole (the flat across +X): a helix down where the D is widest
  // inside, then D-shaped laps out to the edge (the bit's center at t in
  // from its last lap), the last with a notch at each corner where the
  // flat meets the curve.
  function dHole(L, h, o, levels) {
    var r = o.bitDiameter / 2, Rc = h.diameter / 2 - r, fc = h.flat - h.diameter / 2 - r, T = (fc + Rc) / 2;
    var step = Math.max(0.05, o.bitDiameter * (o.stepoverPct || 40) / 100), rh = Math.min(r * 0.6, T), cx = (fc - Rc) / 2;
    var G = o.direction === 'climb' ? 'G3' : 'G2', lapLen = TAU * rh, prev = 0;
    var ts = [];
    for (var t = Math.max(0, T - rh); t > 1e-6; t -= step) ts.push(t);
    ts.push(0);
    var ring = function (t) {
      var rho = Rc - t, f = fc - t;
      if (f >= rho) { var c = []; for (var i = 0; i < 72; i++) c.push({ x: rho * Math.cos(i * TAU / 72), y: rho * Math.sin(i * TAU / 72) }); return { pts: c, bones: null }; }
      var ph = Math.acos(f / rho), n = Math.max(4, Math.ceil((TAU - 2 * ph) / (Math.PI / 36))), pts = [];
      for (var k = 0; k <= n; k++) { var a = ph + (TAU - 2 * ph) * k / n; pts.push({ x: rho * Math.cos(a), y: rho * Math.sin(a) }); }
      // Each notch a bit radius short of the hole's true corner, toward
      // the lap's corner: the bit's edge then just reaches it.
      var R = h.diameter / 2, cxT = h.flat - R, cyT = Math.sqrt(Math.max(0, R * R - cxT * cxT));
      var toward = function (c, q) { var l = Math.hypot(q.x - c.x, q.y - c.y); return { x: c.x + (q.x - c.x) * r / l, y: c.y + (q.y - c.y) * r / l }; };
      var S = pts[0], E = pts[pts.length - 1];
      return { pts: pts, bones: [{ i: 0, tip: toward({ x: cxT, y: cyT }, S) }, { i: pts.length - 1, tip: toward({ x: cxT, y: -cyT }, E) }] };
    };
    L.push('G0 X' + f4(h.x + cx + rh) + ' Y' + f4(h.y));
    L.push('G0 Z' + f3(o.hop));
    L.push('G1 Z0.000 F' + o.plungeFeedRate);
    levels.forEach(function (d) {
      var target = -d;
      L.push('G1 X' + f4(h.x + cx + rh) + ' Y' + f4(h.y) + ' F' + o.feedRate);
      if (lapLen < MIN_RAMP) L.push('G1 Z' + f3(target) + ' F' + o.plungeFeedRate);
      else {
        var turns = Math.min(64, Math.max(1, Math.ceil((prev - target) / (lapLen * RAMP_SLOPE) - 1e-9)));
        var hf = ' F' + slopeFeed((prev - target) / turns / lapLen, o.feedRate, o.plungeFeedRate);
        for (var q = 1; q <= turns; q++) {
          var mid = prev + (target - prev) * (q - 0.5) / turns, end = prev + (target - prev) * q / turns;
          L.push(G + ' X' + f4(h.x + cx - rh) + ' Y' + f4(h.y) + ' I' + f4(-rh) + ' J0 Z' + f3(mid) + hf);
          L.push(G + ' X' + f4(h.x + cx + rh) + ' Y' + f4(h.y) + ' I' + f4(rh) + ' J0 Z' + f3(q === turns ? target : end) + hf);
        }
      }
      ts.forEach(function (t, i) {
        var rg = ring(t);
        lap2(L, h, rg.pts, i === ts.length - 1 ? rg.bones : null, o, r, true);
      });
      prev = target;
    });
    L.push('G0 Z' + f3(o.hop));
  }

  // Where each gear's holes go: the bore, and lightening holes in a ring
  // between the hub and the rim. Their problems name the field to change.
  function gearHoles(g, info, o, label) {
    var out = [], probs = [], r = o.bitDiameter / 2, shape = g.boreShape || 'round', hex = shape === 'hex';
    var NAMES = { round: 'Bore', hex: 'Hex Bore', dflat: 'D Bore', keyway: 'Keyed Bore' }, name = NAMES[shape] || 'Bore';
    var bore = null;
    if (g.bore > 0) {
      bore = { label: label + ' ' + name.toLowerCase(), diameter: g.bore, shape: shape, dx: 0, dy: 0 };
      if (hex && g.bore < o.bitDiameter + 0.1) probs.push(label + '’s Hex Bore must be wider across the flats than the bit');
      else if (g.bore < o.bitDiameter - 1e-6) probs.push(label + '’s ' + name + ' is smaller than the bit');
      if (shape === 'dflat') {
        bore.flat = g.flat;
        if (!(g.flat > o.bitDiameter + 0.1)) probs.push(label + '’s Across the Flat must be more than the bit’s diameter');
        else if (!(g.flat < g.bore - 0.01)) probs.push(label + '’s Across the Flat must be less than the bore');
        else if (!(g.flat > g.bore / 2)) probs.push(label + '’s Across the Flat must be more than half the bore (the flat past the middle)');
      }
      if (shape === 'keyway') {
        bore.keyWidth = g.keyWidth; bore.keyDepth = g.keyDepth;
        if (!(g.keyWidth >= o.bitDiameter - 1e-6)) probs.push(label + '’s Key Width must be at least the bit’s diameter');
        else if (!(g.keyWidth < g.bore - 0.01)) probs.push(label + '’s Key Width must be less than the bore');
        if (!(g.keyDepth > 0)) probs.push(label + '’s Key Depth must be more than 0');
      }
      bore.reach = boreReach(bore, r);
      out.push(bore);
    }
    // The bore, dog-bones and keyway included, must leave a ring under the teeth.
    var boreR = bore ? bore.reach : 0;
    var ring = Math.max(1.5 * info.basics.m, o.bitDiameter);
    if (bore && boreR > info.basics.rf - ring) probs.push(label + '’s ' + name + ' is too big for the gear: it must leave at least ' + ring.toFixed(1) + ' mm under the teeth (it reaches ' + boreR.toFixed(1) + ' mm from the center; ' + (info.basics.rf - ring).toFixed(1) + ' at most)');
    var n = Math.round(g.holes || 0);
    if (n > 0) {
      var hub = boreR + Math.max(g.hub || 0, 0.15 * info.basics.rf, o.bitDiameter), rim = info.basics.rf - Math.max(g.rim || 0, 1.5 * info.basics.m);
      var mid = (hub + rim) / 2, room = rim - hub;
      var dia = g.holeDiameter > 0 ? g.holeDiameter : Math.min(room, 2 * mid * Math.sin(Math.PI / n) - Math.max(4, 0.35 * room));
      if (!(room > 0) || !(dia >= o.bitDiameter) || dia > room + 1e-6 || dia > 2 * mid * Math.sin(Math.PI / n) - 1) {
        probs.push(label + '’s lightening holes don’t fit between the hub and the rim: fewer or smaller holes, or a bigger gear');
      } else {
        for (var k = 0; k < n; k++) {
          var a = (k + 0.5) * TAU / n;
          out.push({ label: label + ' lightening hole ' + (k + 1), diameter: dia, dx: mid * Math.cos(a), dy: mid * Math.sin(a) });
        }
      }
    }
    return { holes: out, problems: probs };
  }

  // Tabs on the tips of n teeth spread round the gear (its center at cx,
  // cy): path-length intervals Tab Width plus the bit wide, centered on
  // each tip.
  function tipTabs(sg, cx, cy, z, n, width, bitDiameter, rot) {
    if (!(n > 0)) return [];
    var picks = [], used = {};
    for (var k = 0; k < n; k++) { var t = Math.round(k * z / n) % z; if (!used[t]) { used[t] = 1; picks.push(t); } }
    var half = (width + bitDiameter) / 2;
    return picks.map(function (t) {
      var a = t * TAU / z + rot, best = -1, bs = 0;
      sg.segs.forEach(function (g) {
        var x = g.a.x - cx, y = g.a.y - cy, d = x * Math.cos(a) + y * Math.sin(a) - Math.abs(-x * Math.sin(a) + y * Math.cos(a)) * 4;
        if (d > best) { best = d; bs = g.at; }
      });
      return bs;
    }).map(function (s) { return [s - half, s + half]; });
  }

  // A frame's axle hole when none is typed: the gear's bore, or for a hex
  // bore the hex's corners, so the shaft turns in it.
  function frameHole(g) { return g.boreShape === 'hex' ? g.bore / Math.cos(Math.PI / 6) : g.bore; }

  // Tabs within one lap from s0, in order, overlapping ones merged and none
  // past the lap's end, so the path never runs backwards over a tab.
  function mergeTabs(tabs, s0, total) {
    var out = [];
    tabs.map(function (iv) { var a = iv[0]; while (a < s0) a += total; while (a >= s0 + total) a -= total; return [a, Math.min(a + iv[1] - iv[0], s0 + total - 1e-6)]; })
      .sort(function (a, b) { return a[0] - b[0]; })
      .forEach(function (iv) { var last = out[out.length - 1]; if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1]); else out.push(iv); });
    return out;
  }

  function plan(o) {
    var problems = [], notes = [], r = o.bitDiameter / 2;
    var base = { module: o.module, pressureDeg: o.pressureDeg, backlash: o.backlash, clearance: o.clearance, bitRadius: r };
    var which = o.job === 'both' ? ['A', 'B'] : o.job === 'frame' ? [] : [o.job];
    var info = {}, pr = G.pair(Object.assign({ centerDistance: o.centerDistance }, base), o.gears.A.teeth, o.gears.B.teeth);
    if (pr.problem) problems.push(pr.problem);
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
    var DEFAULTS = { hop: 5, stepoverPct: 40, gap: 6, direction: 'conventional' };
    o = Object.assign({}, o);
    Object.keys(DEFAULTS).forEach(function (k) { if (o[k] == null) o[k] = DEFAULTS[k]; });
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
        var d = o.frame && o.frame[k] > 0 ? o.frame[k] : frameHole(o.gears[k]);
        if (!(d > 0)) p.problems.push('Axle Hole ' + k + ': type a size (Gear ' + k + ' has no bore to take it from)');
        else if (!(d >= o.bitDiameter - 1e-6)) p.problems.push('Axle Hole ' + k + ' must be at least the bit’s diameter');
        holes.push({ label: 'Axle hole ' + k, diameter: d, x: i ? p.pair.centerDistance : 0, y: 0, depth: o.depth });
      });
    }
    if (p.problems.length) return { problems: p.problems, notes: p.notes, gcode: null };
    // Origin: Gear A's center, or the front-left corner of what's cut.
    var ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    var grow = function (x, y, rr) { ext.x0 = Math.min(ext.x0, x - rr); ext.x1 = Math.max(ext.x1, x + rr); ext.y0 = Math.min(ext.y0, y - rr); ext.y1 = Math.max(ext.y1, y + rr); };
    placed.forEach(function (pl) { grow(pl.x, pl.y, p.info[pl.key].basics.ra + o.bitDiameter); });
    holes.forEach(function (h) { grow(h.x, h.y, h.diameter / 2); });
    placed.forEach(function (pl) { pl.holes.forEach(function (h) { grow(h.x, h.y, h.reach || h.diameter / 2); }); });
    var sx = 0, sy = 0;
    if (o.origin === 'front-left') { sx = -ext.x0; sy = -ext.y0; }
    var unitNote = o.imperial ? ' (the program is in mm; G20 at the end puts the machine back in inches)' : '';
    L.push(comment('Gears: ' + (o.job === 'frame' ? 'frame holes' : p.which.map(function (k) { return 'Gear ' + k + ' ' + o.gears[k].teeth + ' teeth'; }).join(', '))));
    L.push(comment('Module ' + (+o.module.toFixed(4)) + ' mm, ' + o.pressureDeg + ' deg pressure angle, backlash ' + o.backlash + ' mm, tip clearance ' + (+p.info.A.basics.c.toFixed(3)) + ' mm' + (o.clearance == null ? ' (auto)' : '')));
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
      // With the spindle turning clockwise (M3), climb milling runs
      // clockwise round the outside of a part; conventional, counter-
      // clockwise (the path's own way).
      if (o.direction === 'climb') path.reverse();
      path = path.map(function (q) { return { x: q.x + pl.x + sx, y: q.y + pl.y + sy }; });
      var sg = segmentsOf(path);
      // Start in the middle of the space before tooth 0, deepest on the path.
      var sa = -Math.PI / info.basics.z, s0 = 0, best = Infinity;
      sg.segs.forEach(function (g) {
        var x = g.a.x - pl.x - sx, y = g.a.y - pl.y - sy, d = Math.hypot(x, y) + Math.abs(Math.atan2(y, x) - sa) * 1000;
        if (d < best) { best = d; s0 = g.at; }
      });
      var tabs = o.tabs && o.tabs.count > 0 ? tipTabs(sg, pl.x + sx, pl.y + sy, info.basics.z, o.tabs.count, o.tabs.width, o.bitDiameter, 0) : [];
      tabs = mergeTabs(tabs, s0, sg.total);
      if (tabs.reduce(function (a, iv) { return a + iv[1] - iv[0]; }, 0) > 0.5 * sg.total) {
        p.problems.push('Gear ' + pl.key + '’s tabs would cover half its edge or more: fewer or narrower tabs');
        return;
      }
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
    if (p.problems.length) return { problems: p.problems, notes: p.notes, gcode: null };
    L.push(safe + ' ; Safe Z');
    if (o.mist || o.flood) L.push('M9');
    if (o.spindleRpm > 0) L.push('M5');
    if (o.imperial) L.push('G20 ; Back to inches');
    L.push('M30');
    return { problems: [], notes: p.notes, gcode: L.join('\n') + '\n', parts: parts, holes: holes, pair: p.pair, info: p.info,
             extent: { x0: ext.x0 + sx, y0: ext.y0 + sy, x1: ext.x1 + sx, y1: ext.y1 + sy } };
  }

  return { generate: generate, plan: plan, depthLevels: depthLevels, slopeFeed: slopeFeed, gearHoles: gearHoles, frameHole: frameHole, hexCorners: hexCorners,
           boreOutline: boreOutline, boreReach: boreReach, bone: bone, RAMP_SLOPE: RAMP_SLOPE };
});
