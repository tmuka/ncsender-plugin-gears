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
    if (h.shape === 'window') return windowLap(h.win, 0) || [];
    if (h.shape === 'hex') return hexCorners(0, 0, R);
    if (h.shape === 'dflat') {
      var f = h.flat - R, ph = Math.acos(Math.max(-1, Math.min(1, f / R)));
      n = Math.ceil((TAU - 2 * ph) / step);
      for (i = 0; i <= n; i++) { a = ph + (TAU - 2 * ph) * i / n; pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) }); }
      return pts;
    }
    if (h.shape === 'keyway') {
      var hw = h.keyWidth / 2, top = R + h.keyDepth, a0 = Math.asin(Math.min(1, hw / R));
      // From the keyway's left wall round the circle to its right wall.
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
  // ---------- Spoke windows ----------
  // A window between two of N straight spokes (w wide, on the gear's
  // center), from the hub (Ri) out to the rim (Ro), its corners rounded
  // rc, centered on angle `angle`. Shapes about the gear's center.
  var turnPts = function (pts, a) { var c = Math.cos(a), s = Math.sin(a); return pts.map(function (q) { return { x: q.x * c - q.y * s, y: q.x * s + q.y * c }; }); };
  // The window shrunk by e, corners sharp, counter-clockwise; null when
  // nothing's left. Its sides are where the spokes' edges, moved e in, cut
  // the arcs; when they meet before the hub, a point.
  function windowSharp(win, e) {
    var half = Math.PI / win.N, sn = Math.sin(half), c = win.w / 2 + e, ro = win.Ro - e, ri = win.Ri + e, tip = c / sn;
    if (!(ro > tip + 1e-6) || !(ro > ri + 1e-6)) return null;
    var side = function (rho, sign) { return sign * (half - Math.asin(c / rho)); };
    var pts = [], step = Math.PI / 90, a0 = side(ro, -1), a1 = side(ro, 1), n = Math.max(2, Math.ceil((a1 - a0) / step)), i;
    for (i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; pts.push({ x: ro * Math.cos(a), y: ro * Math.sin(a) }); }
    if (ri > tip + 1e-6) {
      var b1 = side(ri, 1), b0 = side(ri, -1), m = Math.max(2, Math.ceil((b1 - b0) / step));
      for (i = 0; i <= m; i++) { var b = b1 - (b1 - b0) * i / m; pts.push({ x: ri * Math.cos(b), y: ri * Math.sin(b) }); }
    } else pts.push({ x: tip, y: 0 });
    return turnPts(pts, win.angle);
  }
  // The bit's center lap d in from the window's edge (d = 0: the window
  // itself): the sharp shape d + f in, grown f back out, so its corners
  // keep the window's rounding (rc - d, none once d passes it).
  function windowLap(win, d) {
    var f = Math.max(0, win.rc - d), sharp = windowSharp(win, d + f);
    if (!sharp) return null;
    return f > 1e-9 ? G.offsetOutward(sharp, f, Math.PI / 36) : sharp;
  }
  // Where the window is widest inside: on its middle line, the radius
  // farthest from the hub, the rim and both spokes. T: that distance.
  function windowMiddle(win) {
    var sn = Math.sin(Math.PI / win.N), best = { T: -Infinity, rho: (win.Ri + win.Ro) / 2 };
    for (var i = 0; i <= 400; i++) {
      var rho = win.Ri + (win.Ro - win.Ri) * i / 400, T = Math.min(rho - win.Ri, win.Ro - rho, rho * sn - win.w / 2);
      if (T > best.T) best = { T: T, rho: rho };
    }
    return best;
  }
  // A window, cleared out from its middle: a helix down there, then laps
  // of the bit's center out to the edge.
  function windowHole(L, h, o, levels) {
    var r = o.bitDiameter / 2, win = h.win, mid = windowMiddle(win), step = Math.max(0.05, o.bitDiameter * (o.stepoverPct || 40) / 100);
    var rh = Math.max(0, Math.min(r * 0.6, mid.T - r)), G2 = o.direction === 'climb' ? 'G3' : 'G2', lapLen = TAU * rh, prev = 0;
    var c = turnPts([{ x: mid.rho, y: 0 }], win.angle)[0], cx = h.x + c.x, cy = h.y + c.y;
    var ds = [];
    for (var d = Math.max(r, mid.T - rh); d > r + 1e-6; d -= step) ds.push(d);
    ds.push(r);
    var laps = ds.map(function (d) { return windowLap(win, d); }).filter(Boolean);
    L.push('G0 X' + f4(cx + rh) + ' Y' + f4(cy));
    L.push('G0 Z' + f3(o.hop));
    L.push('G1 Z0.000 F' + o.plungeFeedRate);
    levels.forEach(function (dd) {
      var target = -dd;
      L.push('G1 X' + f4(cx + rh) + ' Y' + f4(cy) + ' F' + o.feedRate);
      if (lapLen < MIN_RAMP) L.push('G1 Z' + f3(target) + ' F' + o.plungeFeedRate);
      else {
        var turns = Math.min(64, Math.max(1, Math.ceil((prev - target) / (lapLen * RAMP_SLOPE) - 1e-9)));
        var hf = ' F' + slopeFeed((prev - target) / turns / lapLen, o.feedRate, o.plungeFeedRate);
        for (var q = 1; q <= turns; q++) {
          var mz = prev + (target - prev) * (q - 0.5) / turns, ez = prev + (target - prev) * q / turns;
          L.push(G2 + ' X' + f4(cx - rh) + ' Y' + f4(cy) + ' I' + f4(-rh) + ' J0 Z' + f3(mz) + hf);
          L.push(G2 + ' X' + f4(cx + rh) + ' Y' + f4(cy) + ' I' + f4(rh) + ' J0 Z' + f3(q === turns ? target : ez) + hf);
        }
      }
      // Each lap from its point nearest the middle, so the step out is short.
      laps.forEach(function (pts) {
        var k = 0, best = Infinity;
        pts.forEach(function (q, i) { var dist = Math.hypot(q.x - c.x, q.y - c.y); if (dist < best) { best = dist; k = i; } });
        lap2(L, h, pts.slice(k).concat(pts.slice(0, k)), null, o, r, true);
      });
      prev = target;
    });
    L.push('G0 Z' + f3(o.hop));
  }

  // Cut Out (o.holeCut 'out'): a lightening hole or spoke window cut round
  // its edge only, the piece inside held by two tabs (Holding Tabs' width
  // and height) to knock out after; much quicker than clearing it on a big
  // gear. Cleared instead when there are no tabs to hold the piece, or the
  // hole is under three bits across (clearing it is quick). True when cut.
  function cutOut(L, h, o) {
    if (o.holeCut !== 'out' || !h.slug || !(o.tabs && o.tabs.count > 0 && o.tabs.height < h.depth)) return false;
    var r = o.bitDiameter / 2, pts, inner, outer;
    if (h.shape === 'window') {
      pts = windowLap(h.win, r);
      if (!pts || windowMiddle(h.win).T < 1.5 * o.bitDiameter) return false;
      var mid = (h.win.Ri + h.win.Ro) / 2, ca = Math.cos(h.win.angle), sa = Math.sin(h.win.angle);
      outer = { x: h.win.Ro * ca, y: h.win.Ro * sa }; inner = { x: h.win.Ri * ca, y: h.win.Ri * sa };
    } else {
      var R = h.diameter / 2 - r;
      if (!(h.diameter >= 3 * o.bitDiameter)) return false;
      var n = Math.max(48, Math.ceil(TAU * R / 0.5));
      pts = [];
      for (var i = 0; i < n; i++) pts.push({ x: R * Math.cos(i * TAU / n), y: R * Math.sin(i * TAU / n) });
      outer = { x: R, y: 0 }; inner = { x: -R, y: 0 };
    }
    // Conventional runs clockwise inside a hole (the points go counter-clockwise).
    var path = pts.map(function (q) { return { x: h.x + q.x, y: h.y + q.y }; });
    if (o.direction !== 'climb') path.reverse();
    var sg = segmentsOf(path), at = function (q) {
      var bs = 0, bd = Infinity;
      sg.segs.forEach(function (g) {
        var dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, l2 = dx * dx + dy * dy, x = h.x + q.x, y = h.y + q.y;
        var u = l2 > 0 ? Math.max(0, Math.min(1, ((x - g.a.x) * dx + (y - g.a.y) * dy) / l2)) : 0, dd = Math.hypot(x - g.a.x - u * dx, y - g.a.y - u * dy);
        if (dd < bd) { bd = dd; bs = g.at + u * g.len; }
      });
      return bs;
    };
    var half = (o.tabs.width + o.bitDiameter) / 2, t1 = at(outer), t2 = at(inner);
    var s0 = (t1 + sg.total / 4) % sg.total;
    var tabs = mergeTabs([[t1 - half, t1 + half], [t2 - half, t2 + half]], s0, sg.total);
    if (tabs.reduce(function (a, iv) { return a + iv[1] - iv[0]; }, 0) > 0.5 * sg.total) return false;
    L.push(comment('Cut out round its edge, 2 tabs ' + (+o.tabs.height.toFixed(3)) + ' mm high: knock the piece out after'));
    profile(L, sg, s0, tabs, Object.assign({}, o, { depth: h.depth }));
    return true;
  }

  // How far a hole reaches from its center (the bit's dog-bones included).
  function boreReach(h, r) {
    if (h.shape === 'window') return h.win.Ro;
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
    L.push(comment(h.label + ': ' + (h.shape === 'window' ? 'between spokes ' + h.win.w.toFixed(2) + ' mm wide, from ' + h.win.Ri.toFixed(2) + ' to ' + h.win.Ro.toFixed(2) + ' mm out' : h.diameter.toFixed(2) + ' mm') + (hex ? ' across the flats' : h.shape === 'dflat' ? ', ' + h.flat.toFixed(2) + ' mm across the flat' :
      h.shape === 'keyway' ? ', keyway ' + h.keyWidth.toFixed(2) + ' mm wide, ' + h.keyDepth.toFixed(2) + ' mm deep' : '') + ', ' + h.depth.toFixed(2) + ' mm deep'));
    if (h.shape === 'dflat') { dHole(L, h, o, levels); return; }
    if (cutOut(L, h, o)) return;
    if (h.shape === 'window') { windowHole(L, h, o, levels); return; }
    L.push('G0 X' + f4(h.x) + ' Y' + f4(h.y));
    L.push('G0 Z' + f3(o.hop));
    if (R < 0.01 && h.shape !== 'keyway') {
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
      if (shape === 'keyway' && !(g.bore >= o.bitDiameter + 0.1)) probs.push(label + '’s Keyed Bore must be wider than the bit (' + (o.bitDiameter + 0.1).toFixed(2) + ' mm or more)');
      if (shape === 'keyway') {
        bore.keyWidth = g.keyWidth; bore.keyDepth = g.keyDepth;
        if (!(g.keyWidth >= o.bitDiameter + 0.05 - 1e-9)) probs.push(label + '’s Key Width must be a little more than the bit’s diameter (' + (o.bitDiameter + 0.05).toFixed(2) + ' mm or more), so its corners can be notched for a square key');
        else if (!(g.keyWidth < g.bore - 0.01)) probs.push(label + '’s Key Width must be less than the bore');
        if (!(g.keyDepth > 0)) probs.push(label + '’s Key Depth must be more than 0');
      }
      bore.reach = boreReach(bore, r);
      out.push(bore);
    }
    // The bore, dog-bones and keyway included, must leave a solid ring under
    // the teeth: a module deep, or the bit's width. (1.5 modules, a spoked
    // rim's, refused a 6 mm shaft in a coarse 6-tooth pinion.)
    var boreR = bore ? bore.reach : 0;
    var ring = Math.max(info.basics.m, o.bitDiameter);
    if (bore && boreR > info.basics.rf - ring) probs.push(label + '’s ' + name + ' is too big for the gear: it needs ' + ring.toFixed(1) + ' mm of material between it and the bottom of the teeth, and leaves ' + Math.max(0, info.basics.rf - boreR).toFixed(1) + ' mm');
    var n = Math.round(g.holes || 0);
    if (n > 0 && g.holeStyle === 'spokes') {
      var hubS = boreR + Math.max(g.hub || 0, 0.15 * info.basics.rf, o.bitDiameter), rimS = info.basics.rf - Math.max(g.rim || 0, 1.5 * info.basics.m);
      var w = g.spokeWidth > 0 ? g.spokeWidth : Math.max(1.5 * o.bitDiameter, 0.12 * rimS);
      if (g.spokeWidth > 0 && g.spokeWidth < o.bitDiameter) probs.push(label + '’s Spoke Width must be at least the bit’s diameter (' + o.bitDiameter.toFixed(2) + ' mm), so the spokes hold');
      var win = { N: n, Ri: hubS, Ro: rimS, w: w, rc: 0, angle: 0 }, mid = windowMiddle(win);
      if (n < 2) probs.push(label + '’s Spokes must be 2 or more');
      else if (!(rimS > hubS) || !(mid.T >= r + 0.1)) probs.push(label + '’s spoke windows are too narrow for the bit: fewer or thinner spokes, or a bigger gear');
      else {
        // Corners rounded a little past the bit, more in a big window.
        // Never tighter than the bit can cut, so the preview is what's cut.
        win.rc = Math.max(r, Math.min(0.9 * mid.T, Math.max(1.25 * r, 0.12 * (rimS - hubS))));
        for (var j = 0; j < n; j++) out.push({ label: label + ' window ' + (j + 1), shape: 'window', diameter: 0, dx: 0, dy: 0, reach: rimS, slug: true,
          win: Object.assign({}, win, { angle: (j + 0.5) * TAU / n }) });
      }
      n = 0;
    }
    if (n > 0) {
      var hub = boreR + Math.max(g.hub || 0, 0.15 * info.basics.rf, o.bitDiameter), rim = info.basics.rf - Math.max(g.rim || 0, 1.5 * info.basics.m);
      var mid = (hub + rim) / 2, room = rim - hub;
      var dia = g.holeDiameter > 0 ? g.holeDiameter : Math.min(room, 2 * mid * Math.sin(Math.PI / n) - Math.max(4, 0.35 * room));
      if (!(room > 0) || !(dia >= o.bitDiameter) || dia > room + 1e-6 || dia > 2 * mid * Math.sin(Math.PI / n) - 1) {
        probs.push(label + '’s lightening holes don’t fit between the hub and the rim: fewer or smaller holes, or a bigger gear');
      } else {
        for (var k = 0; k < n; k++) {
          var a = (k + 0.5) * TAU / n;
          out.push({ label: label + ' lightening hole ' + (k + 1), diameter: dia, dx: mid * Math.cos(a), dy: mid * Math.sin(a), slug: true });
        }
      }
    }
    return { holes: out, problems: probs };
  }

  // A rack's screw holes: Gear B's Lightening Holes count and its Bore
  // size, evenly along the middle of the bar under the teeth.
  function rackHoles(g, info, o, label) {
    var out = [], probs = [], n = Math.round(g.holes || 0), b = info.basics, d = g.bore;
    if (n > 0) {
      if (!(d >= o.bitDiameter - 1e-6)) probs.push('The rack’s screw holes must be at least the bit’s diameter (Gear B’s Bore)');
      else if (d > b.height - 2 * Math.max(1, 0.5 * o.bitDiameter)) probs.push('The rack’s screw holes don’t fit in its bar: smaller holes, or a taller Rack Height');
      else for (var k = 0; k < n; k++) out.push({ label: 'Rack screw hole ' + (k + 1), diameter: d, shape: 'round', dx: b.length * (k + 0.5) / n, dy: b.root - b.height / 2 });
    }
    return { holes: out, problems: probs };
  }
  // A ring gear's screw holes: Gear B's Lightening Holes count and Bore
  // size, evenly round the middle of its rim, between its teeth.
  function ringHoles(g, info, o) {
    var out = [], probs = [], n = Math.round(g.holes || 0), b = info.basics, d = g.bore, mid = (b.rRoot + b.rOut) / 2;
    if (n > 0) {
      if (!(d >= o.bitDiameter - 1e-6)) probs.push('The ring’s screw holes must be at least the bit’s diameter (Gear B’s Bore)');
      else if (d > b.rim - 2 * Math.max(1, 0.5 * o.bitDiameter)) probs.push('The ring’s screw holes don’t fit in its rim: smaller holes, or a wider Rim Width');
      else for (var k = 0; k < n; k++) { var a = (k + 0.5) * TAU / n; out.push({ label: 'Ring screw hole ' + (k + 1), diameter: d, shape: 'round', dx: mid * Math.cos(a), dy: mid * Math.sin(a) }); }
    }
    return { holes: out, problems: probs };
  }
  // A closed path cut through in depth passes, ramping in from s0, with
  // tabs (path-length intervals) on the passes below their top.
  function profile(L, sg, s0, tabs, o) {
    var tabTop = tabs.length ? o.depth - o.tabs.height : null, levels = depthLevels(o.depth, o.depthOfCut, tabTop), start = pointAt(sg, s0), prev = 0;
    L.push('G0 X' + f4(start.x) + ' Y' + f4(start.y));
    L.push('G0 Z' + f3(o.hop));
    levels.forEach(function (d) {
      lap(L, sg, s0, tabTop != null && d > tabTop + 1e-9 ? tabs : [], -d, -tabTop, -prev, o.feedRate, o.plungeFeedRate);
      prev = d;
    });
    L.push('G0 Z' + f3(o.hop));
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

  // Both gears, nested: Gear B turned half a tooth when it has an even
  // number of teeth (so a space of B faces a tooth of A along the line
  // between them, as when they mesh), and as close as keeps their outlines
  // `clear` apart everywhere: one kerf between them, less stock.
  // The least Gap Between two gears cut together: a bit and a tenth, so
  // the bit cutting one gear stays a tenth of its width off the other.
  function gapMinimum(bit) { return Math.max(1.1 * bit, bit + 0.2); }
  // A ring's pinion cut inside the ring's opening (its middle is waste
  // otherwise), centered on it: when it's the gap clear of the ring's tips.
  function ringNests(pinion, ring, gap) {
    return !pinion.problem && !ring.problem && ring.basics && ring.basics.ri > 0 && ring.basics.ri - pinion.basics.ra >= gap - 1e-9;
  }
  function nestTurn(zB) { return zB % 2 === 0 ? Math.PI / zB : 0; }
  function nestedDistance(A, B, turn, clear) {
    var c = Math.cos(turn), sn = Math.sin(turn), raA = A.basics.ra, raB = B.basics.ra;
    var a = A.outline.filter(function (q) { return q.x > raA - 4 * A.basics.m; });
    var b = B.outline.map(function (q) { return { x: q.x * c - q.y * sn, y: q.x * sn + q.y * c }; })
      .filter(function (q) { return q.x < -raB + 4 * B.basics.m; });
    var apart = function (d) {
      for (var i = 0; i < b.length; i++) {
        var bx = b[i].x + d, by = b[i].y;
        for (var j = 0; j < a.length; j++) if (Math.abs(a[j].y - by) < clear && Math.hypot(a[j].x - bx, a[j].y - by) < clear) return false;
      }
      return true;
    };
    var lo = raA + raB - 3 * Math.max(A.basics.m, B.basics.m), hi = raA + raB + clear;
    for (var k = 0; k < 30; k++) { var mid = (lo + hi) / 2; if (apart(mid)) hi = mid; else lo = mid; }
    return hi;
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
    // A typed center distance matters to the frame's holes; one gear, or both side by side, don't mesh.
    var rack = o.gears.B.kind === 'rack', ring = o.gears.B.kind === 'ring';
    var info = {}, pr = rack ? G.rackPair(base, o.gears.A.teeth) : ring ? G.ringPair(base, o.gears.A.teeth, o.gears.B.teeth) : G.pair(Object.assign({ centerDistance: o.job === 'frame' ? o.centerDistance : null }, base), o.gears.A.teeth, o.gears.B.teeth);
    if (pr.problem && !(ring && o.job === 'A')) problems.push(pr.problem);
    if (ring && o.job === 'frame') problems.push('Frame Holes is for two gears: the pinion’s axle goes ' + pr.centerDistance.toFixed(3) + ' mm from the ring’s center');
    if (rack && o.job === 'frame') problems.push('Frame Holes is for two gears: mount the rack with its pitch line ' + pr.pitchRadius.toFixed(3) + ' mm from the pinion’s axle');
    ['A', 'B'].forEach(function (k) {
      info[k] = k === 'B' && rack ? G.makeRack(Object.assign({ teeth: o.gears.B.teeth, height: o.gears.B.rackHeight }, base))
        : k === 'B' && ring ? G.makeRing(Object.assign({ teeth: o.gears.B.teeth, rim: o.gears.B.rim }, base)) : G.gear(Object.assign({ teeth: o.gears[k].teeth }, base));
      if (info[k].problem && (which.indexOf(k) >= 0 || (o.job === 'frame' && !rack && !ring))) problems.push('Gear ' + k + ': ' + info[k].problem);
      (info[k].notes || []).forEach(function (n) { if (which.indexOf(k) >= 0) notes.push('Gear ' + k + ': ' + n); });
    });
    if (!(o.depth > 0)) problems.push('Total Depth must be more than 0');
    if (!(o.depthOfCut > 0)) problems.push('Depth of Cut must be more than 0');
    if (o.tabs && o.tabs.count > 0 && !(o.tabs.height < o.depth)) problems.push('Tab Height must be less than Total Depth');
    return { problems: problems, notes: notes, info: info, pair: pr, which: which, base: base, rack: rack, ring: ring };
  }

  // A ring gear: its teeth from inside (the bit's center CW inside the
  // opening for conventional milling), tabs on the ring's tooth tips so
  // the middle stays put; then its outside, tabs evenly round it.
  function cutRing(L, pl, info, sx, sy, o, p, parts) {
    var b = info.basics, r = o.bitDiameter / 2, cx = pl.x + sx, cy = pl.y + sy, nT = o.tabs && o.tabs.count > 0 ? o.tabs.count : 0;
    var half = nT ? (o.tabs.width + o.bitDiameter) / 2 : 0;
    // inside: true for the opening (its path CW, conventional inside); false for the outside (CCW, conventional outside).
    var place = function (pts, inside) {
      var path = pts.slice();
      if (o.direction === 'climb') path.reverse();
      return path.map(function (q) { return { x: q.x + cx, y: q.y + cy }; });
    };
    var nearest = function (sg, x, y) {
      var bs = 0, bd = Infinity;
      sg.segs.forEach(function (g) {
        var dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, l2 = dx * dx + dy * dy, ax = g.a.x - cx, ay = g.a.y - cy;
        var u = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, dd = Math.hypot(x - ax - u * dx, y - ay - u * dy);
        if (dd < bd) { bd = dd; bs = g.at + u * g.len; }
      });
      return bs;
    };
    var cutOne = function (path, title, at) {
      var sg = segmentsOf(path), tabs = [];
      for (var k = 0; k < nT; k++) { var q = at(k); var st = nearest(sg, q.x, q.y); tabs.push([st - half, st + half]); }
      var q0 = at(nT >= 2 ? 0.5 : -0.25), s0 = nearest(sg, q0.x, q0.y);
      tabs = mergeTabs(tabs, s0, sg.total);
      if (tabs.reduce(function (a, iv) { return a + iv[1] - iv[0]; }, 0) > 0.5 * sg.total) { p.problems.push('The ring’s tabs would cover half its edge or more: fewer or narrower tabs'); return; }
      L.push(comment(title + (tabs.length ? ', ' + tabs.length + ' tabs ' + (+o.tabs.height.toFixed(3)) + ' mm high' : '')));
      profile(L, sg, s0, tabs, o);
      parts.push({ key: 'B', x: cx, y: cy, path: path });
    };
    var z = b.z, tipR = b.ri - r;
    cutOne(place(info.openingPath, true), 'Ring teeth: ' + z + ', from inside', function (k) {
      var a = (Math.floor(k * z / Math.max(1, nT)) + 0.5) * TAU / z;
      return { x: tipR * Math.cos(a), y: tipR * Math.sin(a) };
    });
    var out = [], R = b.rOut + r, n = Math.max(72, Math.ceil(TAU * R / 0.5));
    for (var i = 0; i < n; i++) out.push({ x: R * Math.cos(i * TAU / n), y: R * Math.sin(i * TAU / n) });
    cutOne(place(out, false), 'Ring outside: ' + (2 * b.rOut).toFixed(3) + ' mm across', function (k) { var a = (k + 0.5) * TAU / Math.max(1, nT); return { x: R * Math.cos(a), y: R * Math.sin(a) }; });
  }

  // Circles (radius ra) in rows, biggest first, `gap` apart where they come
  // closest: each row as long as the stock is wide (`width`), else about as
  // long as the rows are tall all told. The first's center at (0, 0), rows
  // going +Y.
  function packRows(items, gap, width) {
    var list = items.slice().sort(function (a, b) { return b.ra - a.ra; }), out = [];
    var area = list.reduce(function (a, q) { return a + Math.pow(2 * q.ra + gap, 2); }, 0);
    var W = Math.max(2 * list[0].ra, width > 0 ? Math.min(width, Math.sqrt(area) * 1.15) : Math.sqrt(area) * 1.15);
    var row = [], rows = [];
    list.forEach(function (q) {
      var used = row.reduce(function (a, c) { return a + 2 * c.ra + gap; }, 0);
      if (row.length && used + 2 * q.ra > W + 1e-9) { rows.push(row); row = []; }
      row.push(q);
    });
    if (row.length) rows.push(row);
    var y = 0, x0 = -list[0].ra;
    rows.forEach(function (rw, i) {
      var top = rw[0].ra;
      if (i) y += rows[i - 1][0].ra + gap + top;
      var x = x0;
      rw.forEach(function (q) { out.push({ key: q.key, x: x + q.ra, y: y }); x += 2 * q.ra + gap; });
    });
    return out;
  }

  // Circles packed to waste the least stock: biggest first, each next one
  // where the box round them all (each circle grown by `edge`: the cut
  // outside it) comes out smallest, touching one or two placed already
  // (`gap` apart, tip to tip) or the box's sides; never wider than `width`
  // or taller than `height`. A few orders are tried; the smallest box wins.
  // The first's center is at (0, 0); returned in the order they're placed.
  function packCircles(items, gap, edge, width, height) {
    var W = width > 0 ? width : Infinity, H = height > 0 ? height : Infinity;
    var boxOf = function (pl) {
      var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      pl.forEach(function (q) { b.x0 = Math.min(b.x0, q.x - q.ra - edge); b.x1 = Math.max(b.x1, q.x + q.ra + edge); b.y0 = Math.min(b.y0, q.y - q.ra - edge); b.y1 = Math.max(b.y1, q.y + q.ra + edge); });
      return b;
    };
    var fits = function (pl, q) {
      for (var i = 0; i < pl.length; i++) if (Math.hypot(pl[i].x - q.x, pl[i].y - q.y) < pl[i].ra + q.ra + gap - 1e-6) return false;
      return true;
    };
    var run = function (order) {
      var pl = [];
      for (var n = 0; n < order.length; n++) {
        var it = order[n];
        if (!pl.length) { pl.push({ key: it.key, ra: it.ra, x: 0, y: 0 }); continue; }
        var cands = [], b0 = boxOf(pl);
        pl.forEach(function (p) {
          var d = p.ra + it.ra + gap;
          for (var k = 0; k < 72; k++) cands.push({ x: p.x + d * Math.cos(k * Math.PI / 36), y: p.y + d * Math.sin(k * Math.PI / 36) });
          // Touching it and lying along the box's bottom or left side.
          [b0.y0 + it.ra + edge, b0.x0 + it.ra + edge].forEach(function (line, side) {
            var off = side ? line - p.x : line - p.y;
            if (Math.abs(off) > d) return;
            var t = Math.sqrt(d * d - off * off);
            if (side) cands.push({ x: line, y: p.y + t }, { x: line, y: p.y - t });
            else cands.push({ x: p.x + t, y: line }, { x: p.x - t, y: line });
          });
        });
        // Touching two at once: where the two contact circles cross.
        for (var i = 0; i < pl.length; i++) for (var j = i + 1; j < pl.length; j++) {
          var A = pl[i], B = pl[j], ra = A.ra + it.ra + gap, rb = B.ra + it.ra + gap, dx = B.x - A.x, dy = B.y - A.y, D = Math.hypot(dx, dy);
          if (D < 1e-9 || D > ra + rb || D < Math.abs(ra - rb)) continue;
          var al = (ra * ra - rb * rb + D * D) / (2 * D), h = Math.sqrt(Math.max(0, ra * ra - al * al)), mx = A.x + al * dx / D, my = A.y + al * dy / D;
          cands.push({ x: mx - h * dy / D, y: my + h * dx / D }, { x: mx + h * dy / D, y: my - h * dx / D });
        }
        var best = null;
        cands.forEach(function (c) {
          var q = { key: it.key, ra: it.ra, x: c.x, y: c.y };
          if (!fits(pl, q)) return;
          var b = boxOf(pl.concat([q])), w = b.x1 - b.x0, hh = b.y1 - b.y0;
          if (w > W + 1e-6 || hh > H + 1e-6) return;
          // The smallest box; between equals, the squarer, then the nearer the first.
          var score = w * hh + 1e-3 * Math.abs(w - hh) + 1e-6 * Math.hypot(c.x, c.y);
          if (!best || score < best.score) best = { q: q, score: score };
        });
        if (!best) return null;
        pl.push(best.q);
      }
      return pl;
    };
    var bySize = items.slice().sort(function (a, b) { return b.ra - a.ra; });
    // Biggest first; and the biggest first with the rest smallest first (small ones fill the corners early).
    var orders = [bySize, bySize.slice(0, 1).concat(bySize.slice(1).reverse())];
    var best = null;
    // Each order packed within the stock as it is, and within it turned a
    // quarter (then turned back): a long strip fits a machine's longer axis.
    [false, true].forEach(function (turned) {
      var w0 = W, h0 = H;
      if (turned) { W = h0; H = w0; }
      orders.forEach(function (o) {
        var pl = run(o);
        if (!pl) return;
        if (turned) pl = pl.map(function (q) { return { key: q.key, ra: q.ra, x: -q.y, y: q.x }; });
        var b = boxOf(pl), area = (b.x1 - b.x0) * (b.y1 - b.y0);
        if (b.x1 - b.x0 > w0 + 1e-6 || b.y1 - b.y0 > h0 + 1e-6) return;
        if (!best || area < best.area - 1e-6) best = { pl: pl, area: area };
      });
      W = w0; H = h0;
    });
    // Never worse than the rows.
    var rows = packRows(items, gap, width), rb = boxOf(rows.map(function (q) { return { x: q.x, y: q.y, ra: items.filter(function (i) { return i.key === q.key; })[0].ra }; }));
    var rowsArea = (rb.x1 - rb.x0) * (rb.y1 - rb.y0);
    if (!best || rowsArea < best.area - 1e-6) return rows;
    // Biggest at (0, 0) and first, as the rows have it.
    var pl = best.pl.slice().sort(function (a, b) { return b.ra - a.ra; }), x0 = pl[0].x, y0 = pl[0].y;
    return pl.map(function (q) { return { key: q.key, x: q.x - x0, y: q.y - y0 }; });
  }

  // The whole program. All lengths mm, feeds mm/min.
  function generate(o) {
    var p = plan(o), r = o.bitDiameter / 2;
    if (p.problems.length) return { problems: p.problems, notes: p.notes, gcode: null };
    var DEFAULTS = { hop: 5, stepoverPct: 40, direction: 'conventional' };
    o = Object.assign({}, o);
    Object.keys(DEFAULTS).forEach(function (k) { if (o[k] == null) o[k] = DEFAULTS[k]; });
    var L = [], parts = [], placed = [];
    var nameOf = function (k) { return o.labels && o.labels[k] || 'Gear ' + k; };
    // Many gears (a gear train's): each made and named, then packed in rows.
    if (o.many) {
      o.gears = Object.assign({}, o.gears); o.labels = {}; p.info = Object.assign({}, p.info);
      var keys = [];
      o.many.forEach(function (g, i) {
        var k = 'G' + (i + 1);
        keys.push(k); o.gears[k] = g.body; o.labels[k] = g.label;
        p.info[k] = g.body.kind === 'ring' ? G.makeRing(Object.assign({ teeth: g.body.teeth, rim: g.body.rim }, p.base)) : G.gear(Object.assign({ teeth: g.body.teeth }, p.base));
        if (p.info[k].problem) p.problems.push(g.label + ': ' + p.info[k].problem);
        (p.info[k].notes || []).forEach(function (n) { if (p.notes.indexOf(n) < 0) p.notes.push(n); });
      });
      if (o.gap > 0 && o.gap < gapMinimum(o.bitDiameter) - 0.01) p.problems.push('Gap Between must be at least ' + (Math.ceil(gapMinimum(o.bitDiameter) * 100) / 100).toFixed(2) + ' mm (the bit and a tenth), so the bit stays out of the other gear');
      if (p.problems.length) return { problems: p.problems, notes: p.notes, gcode: null };
      p.which = keys;
      // Given places (a planetary set's sun and planets inside its ring), or packed.
      if (o.many.every(function (g) { return g.x != null && g.y != null; })) o.many.forEach(function (g, i) { placed.push({ key: keys[i], x: g.x, y: g.y, turn: g.turn || 0 }); });
      else packCircles(keys.map(function (k) { return { key: k, ra: p.info[k].basics.ra }; }), o.gap > 0 ? o.gap : gapMinimum(o.bitDiameter), o.bitDiameter, o.sheetWidth, o.sheetHeight).forEach(function (q) { placed.push({ key: q.key, x: q.x, y: q.y, turn: 0 }); });
    }
    // Gear A at (0, 0), B beside it in +X, Gap Between apart where they
    // come closest (blank: the least, gapMinimum): two gears nested (B
    // turned to face A as they mesh), a rack or a ring beside it. A rack:
    // its left end there, level with Gear A's middle; alone, centered on X0 Y0.
    var xB = 0, rb = p.rack && p.info.B.basics, turnB = 0;
    var nested = p.which.length === 2 && !p.rack && !p.ring, gapMin = gapMinimum(o.bitDiameter);
    var gap = o.gap > 0 ? o.gap : gapMin;
    // 0.01 mm short is let through, so the minimum as shown (to 0.01 mm,
    // or 0.0001 in) is accepted when typed.
    if (!o.many && p.which.length === 2 && o.gap > 0 && o.gap < gapMin - 0.01) {
      return { problems: ['Gap Between must be at least ' + (Math.ceil(gapMin * 100) / 100).toFixed(2) + ' mm (the bit and a tenth), so the bit stays out of the other gear'], notes: p.notes, gcode: null };
    }
    if (o.many) nested = false;
    else if (nested) {
      turnB = nestTurn(p.info.B.basics.z);
      xB = nestedDistance(p.info.A, p.info.B, turnB, gap);
    } else if (p.which.length === 2 && p.ring && ringNests(p.info.A, p.info.B, gap)) xB = 0;
    else if (p.which.length === 2) xB = p.info.A.basics.ra + (p.rack ? 0 : p.info.B.basics.ra) + gap;
    if (!o.many) p.which.forEach(function (k) {
      if (k === 'B' && p.rack) placed.push({ key: k, x: p.which.length === 2 ? xB : -rb.length / 2, y: -(rb.bottom + rb.top) / 2 });
      else placed.push({ key: k, x: k === 'B' && p.which.length === 2 ? xB : 0, y: 0, turn: k === 'B' ? turnB : 0 });
    });
    var holes = [];
    placed.forEach(function (pl) {
      var gh = pl.key === 'B' && p.rack ? rackHoles(o.gears.B, p.info.B, o) : p.info[pl.key].kind === 'ring' ? ringHoles(o.gears[pl.key], p.info[pl.key], o) : gearHoles(o.gears[pl.key], p.info[pl.key], o, nameOf(pl.key));
      gh.problems.forEach(function (q) { p.problems.push(q); });
      pl.holes = gh.holes.map(function (h) { return Object.assign({}, h, { x: pl.x + h.dx, y: pl.y + h.dy, depth: o.depth }); });
    });
    if (o.job === 'frame' && o.axles) {
      // A gear train's frame: every axle where the layout puts it (axle 1 at
      // X0 Y0); an axle on another (a same-center train) is the one hole.
      o.axles.forEach(function (ax, i) {
        if (!(ax.diameter > 0)) p.problems.push('Axle ' + (i + 1) + ': type an Axle Ø');
        else if (!(ax.diameter >= o.bitDiameter - 1e-6)) p.problems.push('Axle Ø must be at least the bit’s diameter');
        var y = ax.y || 0, on = holes.filter(function (h) { return Math.hypot(h.x - ax.x, h.y - y) < 0.01; })[0];
        if (on) { on.label += ' and ' + (i + 1); return; }
        holes.push({ label: 'Axle hole ' + (i + 1), diameter: ax.diameter, x: ax.x, y: y, depth: o.depth });
      });
    } else if (o.job === 'frame') {
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
    placed.forEach(function (pl) {
      if (pl.key === 'B' && p.rack) { grow(pl.x, pl.y + rb.bottom, o.bitDiameter); grow(pl.x + rb.length, pl.y + rb.top, o.bitDiameter); }
      else grow(pl.x, pl.y, p.info[pl.key].basics.ra + o.bitDiameter);
    });
    holes.forEach(function (h) { grow(h.x, h.y, h.diameter / 2); });
    placed.forEach(function (pl) { pl.holes.forEach(function (h) { grow(h.x, h.y, h.reach || h.diameter / 2); }); });
    var sx = 0, sy = 0;
    if (o.origin === 'front-left') { sx = -ext.x0; sy = -ext.y0; }
    var unitNote = o.imperial ? ' (the program is in mm; G20 at the end puts the machine back in inches)' : '';
    if (o.many) L.push(comment('Gears: ' + (o.manyTitle || 'a gear train') + ', ' + o.many.length + ' gears: ' + o.many.map(function (g) { return g.body.teeth; }).join(', ') + ' teeth'));
    else L.push(comment('Gears: ' + (o.job === 'frame' ? 'frame holes' : p.which.map(function (k) { return (k === 'B' && p.rack ? 'a rack of ' : k === 'B' && p.ring ? 'a ring gear of ' : 'Gear ' + k + ' ') + o.gears[k].teeth + ' teeth'; }).join(', '))));
    // A whole Diametral Pitch is named too: gears that mesh with these need
    // the same tooth size and pressure angle.
    var dp = 25.4 / o.module, dpName = Math.abs(dp - Math.round(dp)) < 1e-6 ? ' (Diametral Pitch ' + Math.round(dp) + ')' : '';
    L.push(comment('Module ' + (+o.module.toFixed(4)) + ' mm' + dpName + ', ' + o.pressureDeg + ' deg pressure angle, backlash ' + o.backlash + ' mm, tip clearance ' + (+p.info.A.basics.c.toFixed(3)) + ' mm' + (o.clearance == null ? ' (auto)' : '')));
    if (o.many) L.push(comment('Train ' + o.many.map(function (g) { return g.label; }).join('; ')));
    else if (o.axles && o.job === 'frame') L.push(comment('Gear train: ' + o.axles.length + ' axles at X Y ' + o.axles.map(function (ax) { return ax.x.toFixed(3) + ' ' + (ax.y || 0).toFixed(3); }).join(', ') + ' mm'));
    else L.push(comment(p.ring ? 'Ring and pinion: ' + o.gears.B.teeth + ':' + o.gears.A.teeth + ', the pinion’s axle ' + p.pair.centerDistance.toFixed(3) + ' mm from the ring’s center'
      : p.rack ? 'Rack and pinion: ' + o.gears.A.teeth + ' teeth on the pinion, the rack ' + p.pair.travel.toFixed(3) + ' mm a turn, its pitch line ' + p.pair.pitchRadius.toFixed(3) + ' mm from the pinion’s axle'
      : 'Pair ' + o.gears.A.teeth + ':' + o.gears.B.teeth + ', center distance ' + p.pair.centerDistance.toFixed(3) + ' mm'));
    L.push(comment('Z0: the top of the stock. X0 Y0: ' + (o.origin === 'front-left' ? 'the front-left corner of the cuts' : (o.job === 'frame' ? (o.axles ? 'axle hole 1' : 'axle hole A') : p.which[0] === 'B' && p.rack ? 'the rack’s middle' : (o.many ? 'the first gear cut, ' + nameOf(placed[0].key) : nameOf(p.which[0])) + '’s center'))));
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
      if (info.kind === 'ring') { cutRing(L, pl, info, sx, sy, o, p, parts); return; }
      var path = G.toolPath(info, r, 0.003).slice();
      // With the spindle turning clockwise (M3), climb milling runs
      // clockwise round the outside of a part; conventional, counter-
      // clockwise (the path's own way).
      if (o.direction === 'climb') path.reverse();
      // Turned (Gear B nested): its teeth only; the bore and holes look the same at any turn.
      var tc = Math.cos(pl.turn || 0), ts = Math.sin(pl.turn || 0);
      path = path.map(function (q) { return { x: q.x * tc - q.y * ts + pl.x + sx, y: q.x * ts + q.y * tc + pl.y + sy }; });
      var sg = segmentsOf(path), s0 = 0, best = Infinity, tabs = [], isRack = info.kind === 'rack';
      // Where on the path is nearest a point (in the piece's own frame).
      var nearest = function (x, y) {
        var bs = 0, bd = Infinity;
        sg.segs.forEach(function (g) {
          var ax = g.a.x - pl.x - sx, ay = g.a.y - pl.y - sy, dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, l2 = dx * dx + dy * dy;
          var u = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, dd = Math.hypot(x - ax - u * dx, y - ay - u * dy);
          if (dd < bd) { bd = dd; bs = g.at + u * g.len; }
        });
        return bs;
      };
      if (isRack) {
        // A rack: tabs evenly along its flat bottom edge; the start between the first two.
        var nT = o.tabs && o.tabs.count > 0 ? o.tabs.count : 0, half = nT ? (o.tabs.width + o.bitDiameter) / 2 : 0, yb = info.basics.bottom - r;
        for (var q = 0; q < nT; q++) { var st = nearest(info.basics.length * (q + 0.5) / nT, yb); tabs.push([st - half, st + half]); }
        s0 = nearest(info.basics.length * (nT >= 2 ? 1 / nT : nT === 1 ? 0.25 : 0.5), yb);
      } else {
        // Start in the middle of the space before tooth 0, deepest on the path.
        var sa = -Math.PI / info.basics.z + (pl.turn || 0);
        sg.segs.forEach(function (g) {
          var x = g.a.x - pl.x - sx, y = g.a.y - pl.y - sy, d = Math.hypot(x, y) + Math.abs(Math.atan2(y, x) - sa) * 1000;
          if (d < best) { best = d; s0 = g.at; }
        });
        tabs = o.tabs && o.tabs.count > 0 ? tipTabs(sg, pl.x + sx, pl.y + sy, info.basics.z, o.tabs.count, o.tabs.width, o.bitDiameter, pl.turn || 0) : [];
      }
      tabs = mergeTabs(tabs, s0, sg.total);
      if (tabs.reduce(function (a, iv) { return a + iv[1] - iv[0]; }, 0) > 0.5 * sg.total) {
        p.problems.push((isRack ? 'The rack' : nameOf(pl.key)) + '’s tabs would cover half its edge or more: fewer or narrower tabs');
        return;
      }
      var tabTop = tabs.length ? o.depth - o.tabs.height : null;
      var levels = depthLevels(o.depth, o.depthOfCut, tabTop);
      var start = pointAt(sg, s0);
      L.push(comment(isRack ? 'Rack teeth: ' + info.basics.z + ', ' + info.basics.length.toFixed(3) + ' mm long, ' + (info.basics.top - info.basics.bottom).toFixed(3) + ' mm tall' + (tabs.length ? ', ' + tabs.length + ' tabs ' + (+o.tabs.height.toFixed(3)) + ' mm high on its bottom edge' : '')
        : nameOf(pl.key) + ' teeth: ' + info.basics.z + ', outside diameter ' + (2 * info.basics.ra).toFixed(3) + ' mm' + (tabs.length ? ', ' + tabs.length + ' tabs ' + (+o.tabs.height.toFixed(3)) + ' mm high on tooth tips' : '')));
      L.push('G0 X' + f4(start.x) + ' Y' + f4(start.y));
      L.push('G0 Z' + f3(o.hop));
      var prev = 0;
      levels.forEach(function (d) {
        var useTabs = tabTop != null && d > tabTop + 1e-9;
        lap(L, sg, s0, useTabs ? tabs : [], -d, -tabTop, -prev, o.feedRate, o.plungeFeedRate);
        prev = d;
      });
      L.push('G0 Z' + f3(o.hop));
      parts.push({ key: pl.key, x: pl.x + sx, y: pl.y + sy, turn: pl.turn || 0, path: path });
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

  return { generate: generate, gapMinimum: gapMinimum, plan: plan, depthLevels: depthLevels, slopeFeed: slopeFeed, gearHoles: gearHoles, frameHole: frameHole, hexCorners: hexCorners,
           ringNests: ringNests, packRows: packRows, packCircles: packCircles, boreOutline: boreOutline, boreReach: boreReach, bone: bone, rackHoles: rackHoles, ringHoles: ringHoles, windowLap: windowLap, windowMiddle: windowMiddle, RAMP_SLOPE: RAMP_SLOPE };
});
