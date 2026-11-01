// Gear geometry for Gears: involute spur gears as a rack cuts them, so the
// flanks are true involutes, small gears get the undercut the mating tooth
// needs, and the root is rounded to at least the bit's radius (the rack's
// tip radius), so an end mill reaches every part of the tooth space.
// Everything in mm and radians. Inlined into config.html by
// .scripts/inline.cjs; tests/inline.test.cjs checks the copy.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GearGeometry = factory();
})(this, function () {
  var TAU = 2 * Math.PI;

  // The rack's tip is rounded a little more than the bit, so the bit is
  // never asked for a sharper corner than it has.
  var BIT_MARGIN = 1.02;

  // m: module; z: teeth; pressureDeg; backlash (mm on the pitch circle,
  // shared by the pair, so each gear is thinned by half); clearance (mm
  // between a tooth's tip and the mating root); bitRadius.
  // The least tip clearance for a bit: the root's rounding rises
  // rho (1 - sin a) above the root, and the other gear's tips must clear
  // it. Three quarters of that is enough: meshing every pair from 12:12 to
  // 60:400 at 14.5, 20 and 25 degrees through a whole pitch, with any
  // backlash (0.05 mm or more), nothing touched.
  function minClearance(m, pressureDeg, bitRadius) {
    var rho = Math.max((bitRadius || 0) * BIT_MARGIN, 0.3 * m);
    return 0.75 * rho * (1 - Math.sin(pressureDeg * Math.PI / 180));
  }
  // Clearance left blank (null): a quarter module, or the least the bit needs.
  function basics(p) {
    var m = p.module, z = p.teeth, a = p.pressureDeg * Math.PI / 180;
    var c = p.clearance != null ? p.clearance : Math.max(0.25 * m, minClearance(m, p.pressureDeg, p.bitRadius));
    var rp = m * z / 2;
    return { m: m, z: z, alpha: a, c: c, backlash: p.backlash || 0, rp: rp, rb: rp * Math.cos(a),
             ra: rp + m, rf: rp - m - c, pitch: Math.PI * m, bitRadius: p.bitRadius || 0, cMin: minClearance(m, p.pressureDeg, p.bitRadius) };
  }

  // The rack tooth that cuts one tooth space: u along the pitch line, v in
  // toward the gear's center from it. Half its width at the pitch line is a
  // quarter pitch plus a quarter of the backlash; it reaches m + c in.
  function rack(b) {
    var hw0 = Math.PI * b.m / 4 + b.backlash / 4, ta = Math.tan(b.alpha);
    var vT = b.m + b.c, vTop = -(b.m + b.c + 0.6 * b.m);
    var hwT = hw0 - vT * ta, hwTop = hw0 - vTop * ta;
    var k = Math.tan(Math.PI / 4 - b.alpha / 2);
    var rhoMax = hwT > 0 ? hwT / k : 0;
    var rho = Math.min(rhoMax, Math.max(b.bitRadius * BIT_MARGIN, 0.3 * b.m));
    return { hw0: hw0, vT: vT, vTop: vTop, hwT: hwT, hwTop: hwTop, rho: rho, rhoMax: rhoMax,
             fits: hwT > 0 && b.bitRadius * BIT_MARGIN <= rhoMax + 1e-12 };
  }
  function rackPolygon(b, rk) {
    var L = rk.rho * Math.tan(Math.PI / 4 - b.alpha / 2);
    var uc = rk.hwT - L, vc = rk.vT - rk.rho;
    var right = [];
    // Right tip fillet, from the tip line up to the flank.
    var a0 = Math.PI / 2, a1 = b.alpha;
    for (var i = 0; i <= 16; i++) {
      var t = a0 + (a1 - a0) * i / 16;
      right.push([uc + rk.rho * Math.cos(t), vc + rk.rho * Math.sin(t)]);
    }
    right.push([rk.hwTop, rk.vTop]);
    var left = right.map(function (q) { return [-q[0], q[1]]; }).reverse();
    return left.concat(right);
  }

  // Half the angular width of the tooth space at each radius, from the
  // rack rolled along the pitch circle (the gear turns t, the rack moves
  // rp t): the farthest any rack position reaches from the space's middle.
  function spaceWidth(b, rk) {
    var N = 180, R = [], w = [];
    for (var i = 0; i <= N; i++) {
      R.push(b.rf + 1e-6 + (b.ra - b.rf - 1e-6) * (1 - Math.cos(Math.PI / 2 * i / N)));
      w.push(0);
    }
    var poly = rackPolygon(b, rk);
    var S = Math.sqrt(Math.max(0, b.ra * b.ra - b.rf * b.rf)) + rk.hwTop + 0.5 * b.m;
    var ds = Math.max(b.m / 100, 0.002), nt = Math.ceil(2 * S / ds);
    var gx = new Float64Array(poly.length), gy = new Float64Array(poly.length);
    for (var s = 0; s <= nt; s++) {
      var shift = -S + 2 * S * s / nt, t = shift / b.rp, ct = Math.cos(-t), st = Math.sin(-t);
      for (var j = 0; j < poly.length; j++) {
        var x = poly[j][0] - shift, y = b.rp - poly[j][1];
        gx[j] = ct * x - st * y; gy[j] = st * x + ct * y;
      }
      for (j = 0; j + 1 < poly.length; j++) {
        var px = gx[j], py = gy[j], dx = gx[j + 1] - px, dy = gy[j + 1] - py;
        var r0 = Math.hypot(px, py), r1 = Math.hypot(px + dx, py + dy);
        var len2 = dx * dx + dy * dy;
        var tc = len2 > 0 ? Math.max(0, Math.min(1, -(px * dx + py * dy) / len2)) : 0;
        var rmin = Math.hypot(px + tc * dx, py + tc * dy), rmax = Math.max(r0, r1);
        if (rmax < R[0] || rmin > R[N]) continue;
        var lo = lowerIndex(R, rmin), hi = lowerIndex(R, rmax);
        for (var k = Math.max(0, lo); k <= Math.min(N, hi + 1); k++) {
          var Rk = R[k];
          if (Rk < rmin || Rk > rmax) continue;
          // |p + u d| = Rk
          var A = len2, B2 = px * dx + py * dy, C = px * px + py * py - Rk * Rk;
          var disc = B2 * B2 - A * C;
          if (disc < 0 || !A) continue;
          var sq = Math.sqrt(disc);
          for (var q = -1; q <= 1; q += 2) {
            var u = (-B2 + q * sq) / A;
            if (u < -1e-9 || u > 1 + 1e-9) continue;
            var ang = Math.abs(Math.atan2(px + u * dx, py + u * dy));
            if (ang > w[k]) w[k] = ang;
          }
        }
      }
    }
    return { R: R, w: w };
  }
  function lowerIndex(a, v) {
    var lo = 0, hi = a.length - 1;
    if (v <= a[0]) return 0;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (a[mid] <= v) lo = mid; else hi = mid; }
    return lo;
  }

  // The gear's outline, counter-clockwise, tooth 0 centered on +X, with
  // what it says about the design. `problem` is set (and the outline may be
  // missing) when it can't be cut as asked.
  // The last few gears worked out, as the preview, the run note and
  // Generate ask for the same ones.
  var kept = [];
  function gear(p) {
    var key = JSON.stringify([p.module, p.teeth, p.pressureDeg, p.backlash || 0, p.clearance, p.bitRadius || 0]);
    for (var i = 0; i < kept.length; i++) if (kept[i].key === key) return kept[i].g;
    var g = makeGear(p);
    kept.unshift({ key: key, g: g });
    if (kept.length > 6) kept.pop();
    return g;
  }
  // The bit's path round a gear, kept with the gear: offset tol farther
  // out, then simplified to within tol, so a chord never cuts into the
  // gear (it's between r and r + 2 tol from it).
  function toolPath(g, r, tol) {
    g.paths = g.paths || {};
    var k = r + '|' + tol;
    if (!g.paths[k]) g.paths[k] = simplifyClosed(offsetOutward(simplifyClosed(g.outline, 0.0005), r + tol + 0.0005), tol);
    return g.paths[k];
  }
  function makeGear(p) {
    var b = basics(p);
    var out = { basics: b, problem: null, notes: [] };
    if (!(b.m > 0) || !(b.z >= 4) || Math.round(b.z) !== b.z) { out.problem = 'teeth must be a whole number, 4 or more, and the tooth size more than 0'; return out; }
    if (!(b.rf > 0)) { out.problem = 'too few teeth for this tooth size: the roots would reach the center'; return out; }
    if (b.c < b.cMin - 1e-9) { out.need = { clearance: b.cMin }; out.problem = 'Tip Clearance must be at least ' + b.cMin.toFixed(2) + ' mm with this bit: the root is rounded to fit it, and the other gear\u2019s tips would hit the rounding'; return out; }
    var rk = rack(b);
    out.rack = rk;
    if (rk.hwT <= 0) { out.problem = 'the tip clearance and pressure angle leave the tooth spaces no width at the bottom'; return out; }
    if (!rk.fits) {
      out.need = { module: minModule(p), bit: 2 * rk.rhoMax / BIT_MARGIN };
      out.problem = 'the bit is too big for these teeth: the bottom of a tooth space fits a bit up to ' + (2 * rk.rhoMax / BIT_MARGIN).toFixed(2) +
        ' mm; use teeth of at least ' + minModule(p).toFixed(2) + ' mm module, or a smaller bit';
      return out;
    }
    var sw = spaceWidth(b, rk), half = Math.PI / b.z;
    var theta = sw.w.map(function (w) { return half - w; });
    var thinnest = Math.min.apply(null, theta);
    if (thinnest <= 0) { out.problem = 'the teeth are cut right through near the root (too few teeth for this pressure angle and bit): add teeth or use 25°'; return out; }
    out.tipThickness = 2 * theta[theta.length - 1] * b.ra;
    if (out.tipThickness < 0.25 * b.m) out.notes.push('pointed teeth: ' + out.tipThickness.toFixed(2) + ' mm across at the tip');
    out.undercut = b.z < 2 / Math.pow(Math.sin(b.alpha), 2) - 1e-9;
    if (out.undercut) out.notes.push('undercut at the root, as a gear with this few teeth needs, so it runs less smoothly than the contact ratio says' + (b.alpha < 25 * Math.PI / 180 - 1e-9 ? '; 25° makes the teeth stronger' : ''));
    out.rootFillet = rk.rho;
    var pts = [];
    for (var k = 0; k < b.z; k++) {
      var c0 = k * TAU / b.z;
      // Root arc from the middle of the space before this tooth to its flank.
      var sp = c0 - half, a0 = sp, a1 = c0 - theta[0];
      arc(pts, b.rf, a0, a1);
      for (var i = 0; i < sw.R.length; i++) pts.push(polar(sw.R[i], c0 - theta[i]));
      arc(pts, b.ra, c0 - theta[theta.length - 1], c0 + theta[theta.length - 1]);
      for (i = sw.R.length - 1; i >= 0; i--) pts.push(polar(sw.R[i], c0 + theta[i]));
      arc(pts, b.rf, c0 + theta[0], c0 + half);
    }
    out.outline = dedupe(pts);
    out.contactRatio = null;
    return out;
  }
  // A rack to mesh with these gears: N teeth along +X from x = 0 to
  // N pitches, each straight-sided at the pressure angle, a quarter of the
  // backlash thinner a side (the gears take the rest), its pitch line on
  // y = 0, tips m up, roots m + c down, the root's inside corners rounded
  // to the bit (as the gears' tips are by the cutter), on a bar H deep
  // under the roots. The rack ends in the middle of a space each end.
  // Counter-clockwise. Its problems say what to change.
  function makeRack(p) {
    var b = basics(Object.assign({}, p, { teeth: 1 })), m = b.m, a = b.alpha, ta = Math.tan(a), N = p.teeth, H = p.height;
    var out = { kind: 'rack', basics: b, problem: null, notes: [] };
    if (!(m > 0) || !(N >= 2) || Math.round(N) !== N) { out.problem = 'a rack needs 2 or more teeth, and the tooth size more than 0'; return out; }
    if (!(H > 0)) { out.problem = 'Rack Height must be more than 0'; return out; }
    if (b.c < b.cMin - 1e-9) { out.need = { clearance: b.cMin }; out.problem = 'Tip Clearance must be at least ' + b.cMin.toFixed(2) + ' mm with this bit: the root is rounded to fit it, and the other gear\u2019s tips would hit the rounding'; return out; }
    var pitch = Math.PI * m, w0 = pitch / 4 - b.backlash / 4, wt = w0 - m * ta, yR = -(m + b.c), wr = w0 - yR * ta;
    var rho = Math.max(b.bitRadius * BIT_MARGIN, 0.3 * m), t = rho * Math.tan(Math.PI / 4 - a / 2);
    if (2 * t > pitch - 2 * wr + 1e-9) {
      out.need = { module: minModule(p), bit: 2 * Math.max(0, (pitch - 2 * wr) / 2) / Math.tan(Math.PI / 4 - a / 2) / BIT_MARGIN };
      out.problem = 'the bit is too big for these teeth: the bottom of a tooth space fits a bit up to ' + out.need.bit.toFixed(2) + ' mm; use teeth of at least ' + out.need.module.toFixed(2) + ' mm module, or a smaller bit';
      return out;
    }
    if (wt < 0.125 * m) out.notes.push('pointed rack teeth: ' + (2 * wt).toFixed(2) + ' mm across at the tip');
    var L = N * pitch, yB = yR - H, top = [];
    var fillet = function (cx, cy, a0, a1) { var n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * rho / 0.05)); for (var i = 0; i <= n; i++) { var u = a0 + (a1 - a0) * i / n; top.push({ x: cx + rho * Math.cos(u), y: cy + rho * Math.sin(u) }); } };
    top.push({ x: 0, y: yR });
    for (var k = 0; k < N; k++) {
      var xc = (k + 0.5) * pitch;
      // Up the left flank from a rounded root corner, across the tip, down the right.
      fillet(xc - wr - t, yR + rho, -Math.PI / 2, -a);
      top.push({ x: xc - wt, y: m }, { x: xc + wt, y: m });
      fillet(xc + wr + t, yR + rho, Math.PI + a, 3 * Math.PI / 2);
    }
    top.push({ x: L, y: yR });
    var pts = [{ x: 0, y: yB }, { x: L, y: yB }].concat(top.reverse());
    out.outline = dedupe(pts);
    out.basics = Object.assign({}, b, { z: N, pitch: pitch, length: L, height: H, top: m, root: yR, bottom: yB, ra: m, rp: Infinity, rf: yR });
    out.rootFillet = rho;
    return out;
  }
  // Rack and pinion: how far the rack goes a turn, and the contact ratio.
  function rackPair(p, z) {
    var a = p.pressureDeg * Math.PI / 180, m = p.module, rp = m * z / 2, rb = rp * Math.cos(a);
    var len = Math.sqrt(Math.pow(rp + m, 2) - rb * rb) - rp * Math.sin(a) + m / Math.sin(a);
    return { travel: 2 * Math.PI * rp, pitchRadius: rp, contactRatio: len / (Math.PI * m * Math.cos(a)) };
  }
  function polar(r, a) { return { x: r * Math.cos(a), y: r * Math.sin(a) }; }
  function arc(pts, r, a0, a1) {
    var n = Math.max(1, Math.ceil(Math.abs(a1 - a0) * r / 0.05));
    for (var i = 0; i <= n; i++) pts.push(polar(r, a0 + (a1 - a0) * i / n));
  }
  function dedupe(pts) {
    var out = [];
    pts.forEach(function (q) { var l = out[out.length - 1]; if (!l || Math.hypot(q.x - l.x, q.y - l.y) > 1e-7) out.push(q); });
    var f = out[0], l = out[out.length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-7) out.pop();
    return out;
  }

  // The smallest module whose tooth spaces a bit of this diameter can cut
  // (the rack's tip rounded to the bit): the tip's half width, at the
  // clearance in use, is what limits it.
  // clearance: in mm when given, else automatic (a quarter module, or the
  // least the bit needs).
  function minModule(p) {
    var a = p.pressureDeg * Math.PI / 180, ta = Math.tan(a);
    var r = (p.bitRadius || 0) * BIT_MARGIN, k = Math.tan(Math.PI / 4 - a / 2), B = p.backlash || 0;
    // hwT = pi m / 4 + B / 4 - (m + c) tan a >= r k
    var withC = function (c) { var per = Math.PI / 4 - ta; return per > 0 ? Math.max(0, (r * k - B / 4 + c * ta) / per) : Infinity; };
    if (p.clearance != null) return withC(p.clearance);
    var per = Math.PI / 4 - 1.25 * ta;
    var quarter = per > 0 ? Math.max(0, (r * k - B / 4) / per) : Infinity;
    return Math.max(quarter, withC(minClearance(0, p.pressureDeg, p.bitRadius)));
  }

  // Friendly module sizes, for rounding the smallest one up.
  var MODULES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50];
  function friendlyModule(min) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i] >= min - 1e-9) return MODULES[i];
    return Math.ceil(min);
  }

  // A pair: center distance, ratio, and the contact ratio (how many teeth
  // share the load on average; under about 1.2 runs roughly). With a
  // centerDistance typed (p.centerDistance), the gears sit that far apart
  // instead: wider adds backlash (2 x the spread x tan of the pressure
  // angle, round the pitch circle) and shortens the contact; closer takes
  // backlash away. Refused when the teeth would bind or lose contact, with
  // the range that works (minDistance, maxDistance).
  function pair(p, zA, zB) {
    var a = p.pressureDeg * Math.PI / 180, m = p.module;
    var rA = m * zA / 2, rB = m * zB / 2, cd0 = rA + rB, B = p.backlash || 0;
    var contactAt = function (cd) {
      var ap = Math.acos(Math.min(1, cd0 * Math.cos(a) / cd)), rbA = rA * Math.cos(a), rbB = rB * Math.cos(a);
      return (Math.sqrt(Math.pow(rA + m, 2) - rbA * rbA) + Math.sqrt(Math.pow(rB + m, 2) - rbB * rbB) - cd * Math.sin(ap)) / (Math.PI * m * Math.cos(a));
    };
    // Backlash round the pitch circle at a working distance: the involute
    // function's growth with the working pressure angle.
    var inv = function (x) { return Math.tan(x) - x; };
    var backlashAt = function (cd) { return B + 2 * cd0 * (inv(Math.acos(Math.min(1, cd0 * Math.cos(a) / cd))) - inv(a)); };
    var out = { naturalDistance: cd0, centerDistance: cd0, ratio: zA / zB, contactRatio: contactAt(cd0), backlash: B, spread: 0 };
    // Closer: down to 0.05 mm of backlash left, and no more than the tip
    // clearance has to spare over what the bit's root rounding needs.
    // Wider: while 1.1 teeth stay in contact.
    var c = p.clearance != null ? p.clearance : Math.max(0.25 * m, minClearance(m, p.pressureDeg, p.bitRadius));
    out.minDistance = cd0 - Math.max(0, Math.min(Math.max(0, B - 0.05) / (2 * Math.tan(a)), c - minClearance(m, p.pressureDeg, p.bitRadius)));
    var lo = cd0, hi = cd0 + 2 * m;
    for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2; if (contactAt(mid) >= 1.1) lo = mid; else hi = mid; }
    out.maxDistance = lo;
    if (p.centerDistance > 0 && Math.abs(p.centerDistance - cd0) > 1e-6) {
      var cd = p.centerDistance;
      out.centerDistance = cd; out.spread = cd - cd0; out.backlash = cd >= cd0 ? backlashAt(cd) : B - 2 * (cd0 - cd) * Math.tan(a); out.contactRatio = contactAt(cd);
      if (cd < out.minDistance - 1e-6) out.problem = 'the Center Distance is too close: the teeth would bind (' + out.minDistance.toFixed(3) + ' mm or more, or Fit Tooth Size)';
      else if (cd > out.maxDistance + 1e-6) out.problem = 'the Center Distance is too far: the teeth would lose contact (' + out.maxDistance.toFixed(3) + ' mm or less, or Fit Tooth Size)';
    }
    return out;
  }

  // A closed polyline offset outward (to the right of its counter-clockwise
  // travel) by r: arcs round the outside corners, and the loops an offset
  // makes in tight inside corners trimmed. Starts at the offset of the
  // point farthest from the center, which is always on the final path.
  function offsetOutward(pts, r, arcStep) {
    arcStep = arcStep || 5 * Math.PI / 180;
    var n = pts.length, start = 0, far = -1;
    for (var i = 0; i < n; i++) { var d = pts[i].x * pts[i].x + pts[i].y * pts[i].y; if (d > far) { far = d; start = i; } }
    var P = [];
    for (i = 0; i < n; i++) P.push(pts[(start + i) % n]);
    var seg = [];
    for (i = 0; i < n; i++) {
      var a = P[i], q = P[(i + 1) % n], dx = q.x - a.x, dy = q.y - a.y, L = Math.hypot(dx, dy);
      seg.push({ dx: dx / L, dy: dy / L, nx: dy / L, ny: -dx / L });
    }
    var out = [];
    for (i = 0; i < n; i++) {
      var s0 = seg[(i - 1 + n) % n], s1 = seg[i], v = P[i];
      var cross = s0.dx * s1.dy - s0.dy * s1.dx, dot = s0.dx * s1.dx + s0.dy * s1.dy;
      var turn = Math.atan2(cross, dot);
      if (turn > 1e-9) {
        // Outside corner: round it.
        var b0 = Math.atan2(s0.ny, s0.nx), steps = Math.max(1, Math.ceil(turn / arcStep));
        for (var k = 0; k <= steps; k++) { var ang = b0 + turn * k / steps; out.push({ x: v.x + r * Math.cos(ang), y: v.y + r * Math.sin(ang) }); }
      } else if (turn < -1e-9) {
        // Inside corner: where the two offset lines cross (the miter).
        var h = r / Math.cos(turn / 2), bx = s0.nx + s1.nx, by = s0.ny + s1.ny, bl = Math.hypot(bx, by);
        out.push({ x: v.x + h * bx / bl, y: v.y + h * by / bl });
      } else {
        out.push({ x: v.x + r * s1.nx, y: v.y + r * s1.ny });
      }
    }
    return trimLoops(out);
  }

  // Removes the small loops of a closed path that crosses itself: where
  // segment i crosses a later one j, the vertices between go and the
  // crossing joins them. Loops from an offset are local, so only the next
  // `window` segments are looked at.
  function trimLoops(path, window) {
    window = window || 300;
    var p = path.slice(), changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (var i = 0; i + 1 < p.length; i++) {
        var a = p[i], b = p[i + 1];
        var minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x), miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
        for (var j = i + 2; j + 1 < p.length && j < i + window; j++) {
          var c = p[j], d = p[j + 1];
          if (Math.max(c.x, d.x) < minx || Math.min(c.x, d.x) > maxx || Math.max(c.y, d.y) < miny || Math.min(c.y, d.y) > maxy) continue;
          var x = crossing(a, b, c, d);
          if (x) { p.splice(i + 1, j - i, x); changed = true; break; }
        }
      }
    }
    return p;
  }
  function crossing(a, b, c, d) {
    var rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
    var den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-15) return null;
    var t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
    return { x: a.x + t * rx, y: a.y + t * ry };
  }

  // Fewer points, none more than tol from the line through its neighbours
  // (Douglas-Peucker, for an open run of points).
  function simplify(pts, tol) {
    if (pts.length < 3) return pts.slice();
    var keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    var stack = [[0, pts.length - 1]];
    while (stack.length) {
      var s = stack.pop(), i0 = s[0], i1 = s[1], a = pts[i0], b = pts[i1];
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-12, best = -1, bi = -1;
      for (var i = i0 + 1; i < i1; i++) {
        var d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / L;
        if (d > best) { best = d; bi = i; }
      }
      if (best > tol) { keep[bi] = 1; stack.push([i0, bi], [bi, i1]); }
    }
    return pts.filter(function (_, i) { return keep[i]; });
  }

  // The same for a closed loop (no repeated end point): split where it's
  // farthest from its first point, simplify both halves.
  function simplifyClosed(pts, tol) {
    if (pts.length < 4) return pts.slice();
    var k = 0, far = -1;
    for (var i = 1; i < pts.length; i++) { var d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y); if (d > far) { far = d; k = i; } }
    var a = simplify(pts.slice(0, k + 1), tol), b = simplify(pts.slice(k).concat([pts[0]]), tol);
    return a.concat(b.slice(1, -1));
  }

  function distToSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    var t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }

  return { basics: basics, rack: rack, gear: gear, makeRack: makeRack, rackPair: rackPair, toolPath: toolPath, minModule: minModule, minClearance: minClearance, friendlyModule: friendlyModule, pair: pair,
           offsetOutward: offsetOutward, trimLoops: trimLoops, simplify: simplify, simplifyClosed: simplifyClosed, distToSegment: distToSegment, MODULES: MODULES };
});
