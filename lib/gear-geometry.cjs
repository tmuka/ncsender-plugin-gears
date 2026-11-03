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
  // The fewest teeth more a ring needs than its pinion, by pressure angle
  // (x10), so their tips don't collide. Meshing pinions of 12 to 50 teeth
  // found 13 (growing with the pinion), 8 and 5 the least that run clear;
  // these keep a margin. The tests mesh pairs at these.
  var RING_DIFF = { 145: 16, 200: 12, 250: 10 };
  // A ring's teeth a little short of a full addendum, so their tips clear
  // the pinion's root rounding (a full one touched it by 0.02 mm with
  // 24-28 tooth pinions and a 1/8" bit).
  var RING_TIP = 0.95;

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
      // The biggest bit for these teeth: with the clearance that bit would get (the one here is the too-big bit's).
      out.need = { module: minModule(p), bit: maxBitDiameter(Object.assign({}, p, { module: b.m })) };
      out.problem = 'the bit is too big for these teeth: the bottom of a tooth space fits a bit up to ' + out.need.bit.toFixed(2) +
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
    if (out.undercut) out.notes.push('undercut at the root, as a gear with this few teeth needs: normal, and it meshes fine, a little less smoothly than the contact ratio says' + (b.alpha < 25 * Math.PI / 180 - 1e-9 ? ' (25° makes small gears\' teeth stronger)' : ''));
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
  // An internal (ring) gear of z teeth: its opening is an external
  // gear's outline turned inside out, each space an involute "tooth" of
  // the same base circle, widened by the ring's share of the backlash and
  // reaching m + c past the pitch circle; its tips at m inside (no lower
  // than the base circle). Cut from inside, the bit rounds the spaces'
  // outer corners: `opening` is that, as cut (CCW), `path` the bit's
  // center (CW, inside it). The ring is W wide outside its roots.
  var invol = function (x) { return Math.tan(x) - x; };
  function ringOpening(b, z) {
    // The ring's tips stop short of the pinion's root rounding (the
    // cutter's, rho (1 - sin a) up from the root) by a tenth of rho, and at
    // most RING_TIP m deep.
    var rho = Math.max(b.bitRadius * BIT_MARGIN, 0.3 * b.m), tipDepth = Math.min(RING_TIP * b.m, b.m + b.c - rho * (1 - Math.sin(b.alpha)) - 0.1 * rho);
    var rp = b.rp, rb = b.rb, a = b.alpha, Ro = rp + b.m + b.c, Ri = Math.max(rp - tipDepth, rb * 1.001);
    var psi = function (R) { return Math.PI / (2 * z) + b.backlash / (4 * rp) + invol(a) - invol(Math.acos(Math.min(1, rb / R))); };
    // Where a space's flanks meet: it can't go deeper than that.
    if (psi(Ro) < 1e-4) { var lo = Ri, hi = Ro; for (var it = 0; it < 60; it++) { var md = (lo + hi) / 2; if (psi(md) > 1e-4) lo = md; else hi = md; } Ro = lo; }
    var n = 60, Rs = [];
    for (var i = 0; i <= n; i++) Rs.push(Ri + (Ro - Ri) * (1 - Math.cos(Math.PI / 2 * i / n)));
    var pts = [], half = Math.PI / z;
    for (var k = 0; k < z; k++) {
      var c = k * 2 * half;
      arc(pts, Ri, c - 2 * half + psi(Ri), c - psi(Ri));
      for (i = 0; i <= n; i++) pts.push(polar(Rs[i], c - psi(Rs[i])));
      arc(pts, Ro, c - psi(Ro), c + psi(Ro));
      for (i = n; i >= 0; i--) pts.push(polar(Rs[i], c + psi(Rs[i])));
    }
    return { pts: dedupe(pts), Ri: Ri, Ro: Ro, psi: psi, trimmed: Ri > rp - tipDepth + 1e-9, pointed: Ro < rp + b.m + b.c - 1e-6, tipDepth: tipDepth };
  }
  function makeRing(p) {
    var b = basics(p), z = p.teeth, W = p.rim, r = b.bitRadius, out = { kind: 'ring', basics: b, problem: null, notes: [] };
    if (!(b.m > 0) || !(z >= 12) || Math.round(z) !== z) { out.problem = 'a ring gear needs 12 or more teeth, and the tooth size more than 0'; return out; }
    if (!(W > 0)) { out.problem = 'Rim Width must be more than 0'; return out; }
    if (b.c < b.cMin - 1e-9) { out.need = { clearance: b.cMin }; out.problem = 'Tip Clearance must be at least ' + b.cMin.toFixed(2) + ' mm with this bit: the root is rounded to fit it, and the other gear\u2019s tips would hit the rounding'; return out; }
    var op = ringOpening(b, z);
    if (op.Ro < b.rp + b.m + 0.25 * b.c) { out.problem = 'the ring\u2019s tooth spaces come to a point before the pinion\u2019s tips reach their bottom: fewer teeth on the ring, 20° rather than 25°, or more backlash'; return out; }
    if (!p.noBitCheck && !(b.m >= minModule(p) - 1e-9)) {
      var mm = minModule(p), rk = rack(b);
      out.need = { module: mm, bit: maxBitDiameter(Object.assign({}, p, { module: b.m })) };
      out.problem = 'the bit is too big for these teeth: the bottom of a tooth space fits a bit up to ' + out.need.bit.toFixed(2) + ' mm; use teeth of at least ' + mm.toFixed(2) + ' mm module, or a smaller bit';
      return out;
    }
    var tipLand = (2 * Math.PI / z - 2 * op.psi(op.Ri)) * op.Ri;
    if (!(tipLand > 0)) { out.problem = 'the ring\u2019s teeth come to a point: more teeth, or 20° rather than 25°'; return out; }
    if (tipLand < 0.25 * b.m) out.notes.push('pointed ring teeth: ' + tipLand.toFixed(2) + ' mm across at the tip');
    if (op.trimmed) out.notes.push('the ring\u2019s teeth are cut short at the base circle (' + (op.Ri - (b.rp - op.tipDepth)).toFixed(2) + ' mm), as this few need');
    // The bit's center inside the opening (CW), and the opening as cut: grown back out.
    // What's cut is everything within a bit radius of the bit's path (its
    // center, CW inside the opening): the opening with its spaces' outer
    // corners rounded.
    out.opening = op.pts;
    // Started in the middle of a ring tooth's tip (a root arc of the
    // opening), never at a space's narrow end, where the offset loops.
    var rev = op.pts.slice().reverse(), k0 = 0, best = Infinity, aim = Math.PI / z;
    rev.forEach(function (q, i) { var dd = Math.abs(Math.atan2(q.y, q.x) - aim) + Math.abs(Math.hypot(q.x, q.y) - op.Ri); if (dd < best) { best = dd; k0 = i; } });
    // Offset a hair more, then simplified to 0.003 mm (as toolPath), so it
    // has no tiny steps and never comes nearer the teeth than r.
    out.openingPath = simplifyClosed(dedupe(trimLoops(offsetOutward(rev.slice(k0).concat(rev.slice(0, k0)), r + 0.0035, null, true))), 0.003);
    out.basics = Object.assign({}, b, { z: z, rim: W, ri: op.Ri, rRoot: op.Ro, rOut: op.Ro + W, ra: op.Ro + W });
    out.outline = circlePts(op.Ro + W);
    return out;
  }
  function circlePts(R) { var pts = []; arc(pts, R, 0, 2 * Math.PI * (1 - 1e-9)); return dedupe(pts); }
  // A pinion (zP) inside a ring (zR): how far apart their centers are, the
  // contact ratio, and whether their tips would collide (too few teeth
  // between them).
  function ringPair(p, zP, zR) {
    var a = p.pressureDeg * Math.PI / 180, m = p.module, rP = m * zP / 2, rR = m * zR / 2, cd = rR - rP;
    var len = Math.sqrt(Math.pow(rP + m, 2) - Math.pow(rP * Math.cos(a), 2)) - Math.sqrt(Math.pow(Math.max(rR - RING_TIP * m, rR * Math.cos(a)), 2) - Math.pow(rR * Math.cos(a), 2)) + cd * Math.sin(a);
    var out = { centerDistance: cd, ratio: zR / zP, contactRatio: len / (Math.PI * m * Math.cos(a)) };
    var minDiff = RING_DIFF[Math.round(p.pressureDeg * 10)] || 12;
    if (zR - zP < minDiff) out.problem = 'the ring needs at least ' + minDiff + ' more teeth than the pinion at ' + p.pressureDeg + '° (' + (zP + minDiff) + ' or more), or their tips collide';
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

  // The largest bit that can cut a module: minModule run backwards.
  function maxBitDiameter(p) {
    var lo = 0, hi = 4 * p.module;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (minModule(Object.assign({}, p, { bitRadius: mid / 2 })) <= p.module + 1e-9) lo = mid; else hi = mid;
    }
    return lo;
  }

  // Pairs that mesh at a center distance, for a builder who knows where
  // the axles go and either how it should turn (`ratio`: turns of Gear B
  // for one of Gear A, as zA / zB) or how big Gear A is (`outsideA`: its
  // outside diameter, which then comes out as near as whole teeth allow).
  // The module is whatever makes the teeth mesh at exactly that distance;
  // the pressure angle is 20 degrees, or 25 when the smaller gear has
  // under 17 teeth (stronger, less undercut) and the bit can still cut it
  // (25 needs bigger teeth). `undercut`: the smaller gear's teeth are
  // thinned at the root (under 17 teeth at 20, 12 at 25). Every option is
  // one the bit can cut. Returns up to three, coarse to fine: the fewest, biggest
  // teeth (strongest, easiest to cut), the finest the bit allows (smoother),
  // and one between; or { problem } when none fits.
  function solvePairs(t) {
    var C = t.centerDistance, bitR = t.bitRadius || 0;
    if (!(C > 0)) return { problem: 'a Center Distance' };
    if (!(t.ratio > 0) && !(t.outsideA > 0)) return { problem: t.byRatio === false ? 'Gear A\'s outside diameter' : 'a ratio' };
    var options = [];
    var consider = function (zA, zB) {
      if (zA < 6 || zB < 6 || zA > 400 || zB > 400) return;
      var small = Math.min(zA, zB), m = 2 * C / (zA + zB);
      var at = function (pa) { return { pressureDeg: pa, backlash: t.backlash || 0, clearance: t.clearance, bitRadius: bitR }; };
      var p = small < 17 && m >= minModule(at(25)) - 1e-9 ? at(25) : at(20);
      if (m < minModule(p) - 1e-9) return;
      var pa = p.pressureDeg;
      var o = { teethA: zA, teethB: zB, module: m, pressureDeg: pa, ratio: zA / zB, undercut: small < (pa === 25 ? 12 : 17),
        outsideA: m * (zA + 2), outsideB: m * (zB + 2), contactRatio: pair(Object.assign({ module: m }, p), zA, zB).contactRatio,
        maxBit: maxBitDiameter(Object.assign({ module: m }, p)) };
      o.error = t.ratio > 0 ? Math.abs(o.ratio - t.ratio) / t.ratio : Math.abs(o.outsideA - t.outsideA) / t.outsideA;
      options.push(o);
    };
    if (t.ratio > 0) {
      for (var zB = 6; zB <= 400; zB++) consider(Math.round(t.ratio * zB), zB);
    } else {
      // Gear A's outside diameter: for each Gear A, the module its size gives,
      // and the Gear B that fills the distance at it.
      for (var zA = 6; zA <= 400; zA++) {
        var m = t.outsideA / (zA + 2), zB2 = Math.round(2 * C / m - zA);
        consider(zA, zB2);
      }
    }
    if (!options.length) return { problem: 'none fits: the bit is too big for this distance, or the distance too small for the ratio' };
    // As near the ratio (or size) as any option gets, within 0.5%.
    var best = Math.min.apply(null, options.map(function (o) { return o.error; }));
    var near = options.filter(function (o) { return o.error <= Math.max(best, 0.005) + 1e-12; });
    near.sort(function (a, b) { return (a.teethA + a.teethB) - (b.teethA + b.teethB); });
    var pick = [near[0], near[Math.floor((near.length - 1) / 2)], near[near.length - 1]];
    var out = [];
    pick.forEach(function (o, i) {
      if (out.indexOf(o) < 0) out.push(Object.assign({ kind: ['coarse', 'balanced', 'fine'][i] }, o));
    });
    return { options: out };
  }

  // Round tooth sizes for a shop: whole Diametral Pitches in inches, standard
  // modules in mm, finest first.
  var ROUND_DP = [12, 10, 8, 6, 5, 4, 3], ROUND_M = [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8];
  function roundSizes(imperial) {
    return imperial ? ROUND_DP.map(function (dp) { return { name: 'DP ' + dp, module: 25.4 / dp, dp: dp } })
      : ROUND_M.map(function (m) { return { name: 'Module ' + m, module: m } });
  }
  // The least backlash at which a bit cuts a tooth size (the root rounding
  // fits the bit when the rack tooth is a little thinner); Infinity past 1.5 mm.
  function backlashFor(m, bit, pressureDeg, clearance) {
    var p = { module: m, pressureDeg: pressureDeg || 20, clearance: clearance };
    for (var b = 0; b <= 1.5 + 1e-9; b += 0.01) { p.backlash = b; if (maxBitDiameter(p) >= bit - 1e-9) return Math.round(b * 100) / 100; }
    return Infinity;
  }
  // Starter standards for a bit: each round size the bit cuts with at most
  // 0.45 mm of backlash (wood swells: that much is fine), with the backlash it
  // needs (at least the one given), the smallest comfortable gear (12 teeth)
  // and how many teeth fit in 3 in (76.2 mm) across; the finest of them
  // recommended (it makes the widest range of gears).
  function suggestStandards(t) {
    var bit = t.bit, b0 = t.backlash > 0 ? t.backlash : 0.3, out = roundSizes(t.imperial).map(function (r) {
      var need = backlashFor(r.module, bit, 20, t.clearance);
      return { name: r.name, module: r.module, dp: r.dp, pressureDeg: 20, backlash: Math.max(b0, need === Infinity ? b0 : need), needs: need,
        ok: need <= 0.45 + 1e-9, smallGear: r.module * 14, teethIn3: Math.floor(76.2 / r.module - 2) };
    });
    var rec = out.filter(function (o) { return o.ok; })[0];
    if (rec) rec.recommended = true;
    return out;
  }

  // Pairs at a set tooth size and pressure angle (a shop standard, so they
  // mesh with every other gear of it): whole teeth only, so only some
  // distances. For a ratio (or Gear A's outside diameter) and the distance
  // wanted, the pairs whose own distance is nearest it, a few tooth totals
  // either side; each says whether it can be spread to the distance wanted
  // (pair()'s range) and how near its ratio comes. Nearest distance first.
  // t: { centerDistance, ratio | outsideA, module, pressureDeg, backlash, clearance, bitRadius }.
  function solveStandard(t) {
    var C = t.centerDistance, m = t.module;
    if (!(C > 0)) return { problem: 'a Center Distance' };
    if (!(t.ratio > 0) && !(t.outsideA > 0)) return { problem: 'a ratio' };
    var p = { module: m, pressureDeg: t.pressureDeg, backlash: t.backlash || 0, clearance: t.clearance, bitRadius: t.bitRadius || 0 };
    var S0 = Math.round(2 * C / m), out = [];
    for (var S = S0 - 2; S <= S0 + 2; S++) {
      var zA = t.ratio > 0 ? Math.round(S * t.ratio / (1 + t.ratio)) : Math.round(t.outsideA / m - 2), zB = S - zA;
      if (zA < 6 || zB < 6 || zA > 400 || zB > 400) continue;
      var pr = pair(p, zA, zB), own = m * S / 2;
      var o = { teethA: zA, teethB: zB, module: m, pressureDeg: t.pressureDeg, ratio: zA / zB, ownDistance: own,
        spreadable: C >= pr.minDistance - 1e-6 && C <= pr.maxDistance + 1e-6, outsideA: m * (zA + 2), outsideB: m * (zB + 2),
        undercut: Math.min(zA, zB) < (t.pressureDeg >= 25 ? 12 : t.pressureDeg >= 20 ? 17 : 32) };
      o.ratioError = t.ratio > 0 ? Math.abs(o.ratio - t.ratio) / t.ratio : Math.abs(o.outsideA - t.outsideA) / t.outsideA;
      o.contactRatio = pair(Object.assign({ centerDistance: o.spreadable ? C : null }, p), zA, zB).contactRatio;
      out.push(o);
    }
    if (!out.length) {
      // Why: too close for 6-tooth gears, so far it needs more than 400, or the ratio (or size) asks for a gear under 6.
      if (S0 + 2 < 12) return { problem: 'too close for gears of 6 teeth or more at this tooth size: at least ' + (m * 6).toFixed(3) + ' mm' };
      if (S0 - 2 > 800) return { problem: 'too far for gears of 400 teeth or fewer at this tooth size: at most ' + (m * 400).toFixed(3) + ' mm' };
      return { problem: t.ratio > 0 ? 'that ratio needs a gear of fewer than 6 (or more than 400) teeth at this distance: a longer distance, or a ratio nearer 1:1' : 'Gear A’s outside diameter is too small for 6 teeth at this tooth size (at least ' + (8 * m).toFixed(3) + ' mm)' };
    }
    out.sort(function (a, b) { return Math.abs(a.ownDistance - C) - Math.abs(b.ownDistance - C); });
    var list = out.slice(0, 3);
    // And when none of those makes the ratio exactly, the nearest distance that does.
    if (t.ratio > 0 && !list.some(function (o) { return o.ratioError < 1e-9; })) {
      var exact = null;
      for (var S2 = Math.max(12, S0 - 40); S2 <= S0 + 40; S2++) {
        var a2 = S2 * t.ratio / (1 + t.ratio);
        if (Math.abs(a2 - Math.round(a2)) > 1e-9) continue;
        var zA2 = Math.round(a2), zB2 = S2 - zA2;
        if (zA2 < 6 || zB2 < 6 || zA2 > 400 || zB2 > 400) continue;
        if (!exact || Math.abs(m * S2 / 2 - C) < Math.abs(exact.ownDistance - C)) {
          var pr2 = pair(p, zA2, zB2);
          exact = { teethA: zA2, teethB: zB2, module: m, pressureDeg: t.pressureDeg, ratio: zA2 / zB2, ownDistance: m * S2 / 2, ratioError: 0,
            spreadable: C >= pr2.minDistance - 1e-6 && C <= pr2.maxDistance + 1e-6, outsideA: m * (zA2 + 2), outsideB: m * (zB2 + 2),
            undercut: Math.min(zA2, zB2) < (t.pressureDeg >= 25 ? 12 : t.pressureDeg >= 20 ? 17 : 32), contactRatio: pr2.contactRatio, exactRatio: true };
        }
      }
      if (exact) list.push(exact);
    }
    // The one to pick: the nearest distance within 2% of the ratio (or size) asked for, else the nearest.
    var pick = list.filter(function (o) { return o.ratioError <= 0.02; }).sort(function (a, b) { return Math.abs(a.ownDistance - C) - Math.abs(b.ownDistance - C); })[0] || list[0];
    return { options: list, pick: pick, tooSmall: (t.bitRadius || 0) > 0 && m < minModule(p) - 1e-9 };
  }

  // The round sizes a bit cuts at a backlash (finest first): what the
  // design lists offer when there's no shop standard, so no odd sizes.
  function roundFor(t) {
    var p = { pressureDeg: t.pressureDeg || 20, backlash: t.backlash || 0, clearance: t.clearance, bitRadius: t.bitRadius || 0 };
    return roundSizes(t.imperial).filter(function (r) { return r.module >= minModule(p) - 1e-9; });
  }
  // Start from the Center Distance without a standard: the nearest whole-
  // tooth pair at each of the finest round sizes the bit cuts (solveStandard
  // at each), as Fine, Balanced and Coarse. Each says how it meets the
  // distance (exact, spread, or its own).
  function solveRoundPairs(t) {
    if (!(t.centerDistance > 0)) return { problem: 'a Center Distance' };
    if (!(t.ratio > 0) && !(t.outsideA > 0)) return { problem: t.byRatio === false ? 'Gear A\'s outside diameter' : 'a ratio' };
    var sizes = roundFor(t), out = [];
    if (!sizes.length) return { problem: 'no round tooth size is coarse enough for this bit' };
    sizes.slice(0, 4).forEach(function (r) {
      var q = solveStandard(Object.assign({}, t, { module: r.module, pressureDeg: t.pressureDeg || 20 }));
      if (q.pick && !out.some(function (o) { return o.teethA === q.pick.teethA && o.teethB === q.pick.teethB; })) out.push(Object.assign({ sizeName: r.name }, q.pick));
    });
    if (!out.length) return { problem: 'none fits: the distance is too short for this bit\'s teeth, or the ratio too big for one pair' };
    var kinds = out.length === 1 ? ['balanced'] : out.length === 2 ? ['fine', 'coarse'] : ['fine', 'balanced', 'coarse'];
    var pick = out.length <= 3 ? out : [out[0], out[1], out[out.length - 1]];
    return { options: pick.map(function (o, i) { return Object.assign({ kind: kinds[i] }, o); }) };
  }
  // Start from the Ratio: no distance; at each of the finest round sizes the
  // bit cuts (or t.sizes, a shop standard's), the smallest pair (pinion of
  // t.minTeeth, 10 unless given, or more) within 0.5% of the ratio, or the
  // nearest of those up to half as big again (3.14 is 44:14, not 157:50;
  // 1.618 is 21:13, not 144:89). Its own center distance follows.
  function solveRatioPairs(t) {
    var R = t.ratio;
    if (!(R > 0)) return { problem: 'a ratio' };
    var sizes = t.sizes && t.sizes.length ? t.sizes : roundFor(t), out = [], small = Math.max(6, Math.round(t.minTeeth || 10));
    sizes.slice(0, 3).forEach(function (r) {
      var best = null, first = 0, big = Math.max(R, 1 / R);
      for (var zs = small; zs <= 200; zs++) {
        var zb = Math.round(zs * big), q = R >= 1 ? zb / zs : zs / zb, err = Math.abs(q - R) / R;
        if (zb > 400 || (first && zs > 1.5 * first)) break;
        if (err > 0.005 + 1e-12) continue;
        first = first || zs;
        if (!best || err < best.err - 1e-12) best = { zs: zs, zb: zb, err: err };
        if (err < 1e-9) break;
      }
      if (!best) return;
      var zA = R >= 1 ? best.zb : best.zs, zB = R >= 1 ? best.zs : best.zb, m = r.module;
      out.push({ sizeName: r.name, module: m, pressureDeg: t.pressureDeg || 20, teethA: zA, teethB: zB, ratio: zA / zB, ratioError: best.err, ownDistance: m * (zA + zB) / 2, spreadable: false,
        outsideA: m * (zA + 2), outsideB: m * (zB + 2), undercut: Math.min(zA, zB) < (t.pressureDeg >= 25 ? 12 : 17) });
    });
    if (!out.length) return { problem: 'no pair of 400 teeth or fewer makes that ratio: a Gear Train for big ratios' };
    var kinds = out.length === 1 ? ['balanced'] : out.length === 2 ? ['fine', 'coarse'] : ['fine', 'balanced', 'coarse'];
    return { options: out.map(function (o, i) { return Object.assign({ kind: kinds[i] }, o); }) };
  }
  // Match a Gear I Have: its tooth size from its teeth and the diameter
  // across its tips (module = Ø ÷ (teeth + 2)), and the nearest round module
  // and Diametral Pitch, with how far each is off (a worn or odd gear won't
  // land on one). Pressure angle can't be measured: 20° usually.
  function measureGear(teeth, outside) {
    if (!(teeth >= 6) || !(outside > 0)) return { problem: 'its teeth (6 or more) and the diameter across its tips' };
    var m = outside / (teeth + 2), dp = 25.4 / m;
    var nm = MODULES.reduce(function (a, b) { return Math.abs(b - m) < Math.abs(a - m) ? b : a; }), nd = Math.max(1, Math.round(dp));
    return { module: m, dp: dp, nearModule: { module: nm, off: Math.abs(nm - m) / m }, nearDP: { dp: nd, module: 25.4 / nd, off: Math.abs(25.4 / nd - m) / m } };
  }

  // A planetary set: a sun in the middle, n planets round it on a carrier,
  // a ring round them all; the ring has the sun's teeth and two planets'.
  // For the planets to sit evenly spaced and mesh with both, the sun's and
  // ring's teeth together must divide by n; they mustn't touch each other
  // (half a module between tips); the ring needs its usual lead over a
  // planet. Ratios: the ring held, sun in, carrier out, 1 + ring / sun (the
  // usual reduction); the carrier held, ring / sun, turning backwards; the
  // sun held, ring in, carrier out, 1 + sun / ring.
  function planetary(p, zs, zp, n) {
    var m = p.module, zr = zs + 2 * zp, a = m * (zs + zp) / 2, problems = [];
    if (!(n >= 2) || Math.round(n) !== n) problems.push('a planetary set needs 2 or more planets');
    else {
      if ((zs + zr) % n !== 0) problems.push('for ' + n + ' planets evenly spaced, the sun’s and ring’s teeth together (' + (zs + zr) + ') must divide by ' + n + (p.noFixes ? '' : ': ' + planetFixes(zs, zp, n)));
      var apart = 2 * a * Math.sin(Math.PI / n), need = m * (zp + 2) + 0.5 * m;
      if (apart < need - 1e-9) problems.push(n + ' planets of ' + zp + ' teeth touch each other: fewer planets, smaller planets or a bigger sun');
    }
    var rp = ringPair(p, zp, zr);
    if (rp.problem) problems.push(rp.problem.replace('the pinion', 'a planet'));
    return { sun: zs, planet: zp, ring: zr, planets: n, carrierRadius: a, problems: problems,
      ratios: { ringHeld: 1 + zr / zs, carrierHeld: zr / zs, sunHeld: 1 + zs / zr } };
  }
  // The nearest teeth that space n planets evenly: the sun a tooth or two
  // either way, or the planets.
  function planetFixes(zs, zp, n) {
    var opts = [], ok = function (s2, p2) { return s2 >= 6 && p2 >= 6 && s2 + 2 * p2 <= 400 && !planetary({ module: 1, pressureDeg: 20, noFixes: true }, s2, p2, n).problems.length; };
    for (var d = 1; d <= 2 * n && opts.length < 2; d++) [zs + d, zs - d].forEach(function (s2) { if (opts.length < 2 && ok(s2, zp)) opts.push('a sun of ' + s2); });
    for (var e = 1; e <= 2 * n && opts.length < 3; e++) [zp - e, zp + e].forEach(function (p2) { if (opts.length < 3 && ok(zs, p2)) opts.push('planets of ' + p2); });
    return opts.length ? opts.join(', or ') : 'other teeth, or another number of planets';
  }
  // Where everything is with the ring held and the sun turned sunDeg (math
  // angles, degrees, counter-clockwise): the carrier turns sun / (sun +
  // ring) as fast; each planet meshes with the sun as a pair does along its
  // line, and so with the ring (the even spacing keeps them all in step).
  // At sunDeg 0 the ring is at 0, as drawn.
  function planetPhase(zs, zp, n, sunDeg) {
    var zr = zs + 2 * zp, c = (sunDeg * zs - 180 * (zp + 1)) / (zr + zs), planets = [];
    for (var k = 0; k < n; k++) {
      var phi = c + 360 * k / n;
      planets.push({ at: phi, angle: phi + 180 + 180 / zp - (sunDeg - phi) * zs / zp });
    }
    return { sun: sunDeg, carrier: c, ring: 0, planets: planets };
  }
  // Sun and planet teeth for a ratio (the ring held, sun in, carrier out):
  // exact when whole teeth allow, else within 0.5%; n planets that space
  // evenly and clear each other; teeth in the range (the ring may be more).
  // The smallest ring first, then one with a bigger sun (stronger, finer).
  function solvePlanetary(t) {
    var R = t.ratio, n = Math.round(t.planets || 3), lo = Math.max(6, Math.round(t.minTeeth || 8)), hi = Math.min(400, Math.round(t.maxTeeth || 72));
    if (!(R > 2)) return { problem: 'a ratio of more than 2:1. With the ring held, a planetary set’s ratio is 1 + ring ÷ sun, always over 2:1; for 2:1 or less, use a plain pair' };
    var p = { module: 1, pressureDeg: t.pressureDeg || 20 }, found = [];
    for (var zs = lo; zs <= hi; zs++) for (var zp = lo; zp <= hi; zp++) {
      var zr = zs + 2 * zp;
      if (zr > 400) continue;
      var q = 1 + zr / zs, err = Math.abs(q - R) / R;
      if (err > 0.005) continue;
      var ps = planetary(p, zs, zp, n);
      if (ps.problems.length) continue;
      found.push({ sun: zs, planet: zp, ring: zr, planets: n, ratio: q, error: err < 1e-9 ? 0 : err });
    }
    if (!found.length) return { problem: 'no set of ' + lo + ' to ' + hi + '-tooth suns and planets with ' + n + ' planets comes within 0.5% of it: other teeth, or another number of planets' };
    var exact = found.filter(function (o) { return o.error === 0; }), list = exact.length ? exact : found;
    list.sort(function (a, b) { return a.error - b.error || a.ring - b.ring || a.sun - b.sun; });
    var out = [list[0]];
    var bigger = list.filter(function (o) { return o.error <= list[0].error + 1e-12 && o.sun >= 1.5 * list[0].sun; })[0];
    if (bigger) out.push(bigger);
    return { options: out };
  }
  // Pieces (circles of tip radius ra) laid inside the ring's opening to cut
  // from it (the middle is waste otherwise): each `gap` from the ring's tips
  // and from each other, biggest first, each hugging the ring's tips or the
  // pieces placed. Those that fit come back with places; those that don't
  // are `outside`, to cut beside the ring.
  function nestInRing(items, ringTip, gap) {
    var list = items.slice().sort(function (a, b) { return b.ra - a.ra; }), inside = [], outside = [];
    if (!(ringTip > 0)) return { inside: [], outside: list.map(function (it) { return it.key; }) };
    list.forEach(function (it) {
      var rho = ringTip - gap - it.ra, cands = [];
      if (rho < -1e-9) { outside.push(it.key); return; }
      if (rho < 1e-9) cands.push({ x: 0, y: 0 });
      for (var k = 0; k < 72; k++) cands.push({ x: rho * Math.cos(k * Math.PI / 36), y: rho * Math.sin(k * Math.PI / 36) });
      // Touching the ring's tips and a piece: where the two circles cross; and touching two pieces.
      var cross = function (ax, ay, ra, bx, by, rb) {
        var dx = bx - ax, dy = by - ay, D = Math.hypot(dx, dy);
        if (D < 1e-9 || D > ra + rb || D < Math.abs(ra - rb)) return;
        var al = (ra * ra - rb * rb + D * D) / (2 * D), h = Math.sqrt(Math.max(0, ra * ra - al * al)), mx = ax + al * dx / D, my = ay + al * dy / D;
        cands.push({ x: mx - h * dy / D, y: my + h * dx / D }, { x: mx + h * dy / D, y: my - h * dx / D });
      };
      inside.forEach(function (q, i) {
        cross(0, 0, rho, q.x, q.y, q.ra + it.ra + gap);
        for (var j = i + 1; j < inside.length; j++) cross(q.x, q.y, q.ra + it.ra + gap, inside[j].x, inside[j].y, inside[j].ra + it.ra + gap);
      });
      var best = null;
      cands.forEach(function (c) {
        if (Math.hypot(c.x, c.y) > rho + 1e-6) return;
        for (var i = 0; i < inside.length; i++) if (Math.hypot(inside[i].x - c.x, inside[i].y - c.y) < inside[i].ra + it.ra + gap - 1e-6) return;
        // Out against the ring first (room left in the middle), then the first angle.
        var score = -Math.hypot(c.x, c.y) + 1e-3 * ((Math.atan2(c.y, c.x) + 2 * Math.PI) % (2 * Math.PI));
        if (!best || score < best.score) best = { c: c, score: score };
      });
      if (best) inside.push({ key: it.key, ra: it.ra, x: best.c.x, y: best.c.y }); else outside.push(it.key);
    });
    return { inside: inside.map(function (q) { return { key: q.key, x: q.x, y: q.y }; }), outside: outside };
  }

  // A gear train: stages in a row, each a driver turning a driven gear; a
  // stage's driven gear shares its axle with the next stage's driver. The
  // ratio is turns of the first axle for one of the last: the product of
  // driven / driver. Options for a target ratio: the fewest stages that
  // reach it exactly (or within 0.5%), then the fewest teeth all told (the
  // smallest train), stages near equal; { problem } when none does.
  // t: { ratio, stages (0: 1 to 3), minTeeth, maxTeeth }.
  function solveTrain(t) {
    var R = t.ratio, lo = Math.max(6, Math.round(t.minTeeth || 8)), hi = Math.min(400, Math.round(t.maxTeeth || 72));
    if (!(R > 0)) return { problem: 'a ratio' };
    if (!(hi >= lo)) return { problem: 'the teeth range is empty' };
    if (t.sameCenter) return sameCenterTrain(R, lo, hi);
    var counts = t.stages > 0 ? [Math.min(3, Math.round(t.stages))] : [1, 2, 3];
    // A search that would freeze the dialog stops here; what it found by then is given.
    var budget = t.budgetMs > 0 ? t.budgetMs : 400, t0 = Date.now(), partial = false;
    var late = function () { if (!partial && Date.now() - t0 > budget) partial = true; return partial; };
    var gcd = function (a, b) { while (b) { var x = a % b; a = b; b = x; } return a; };
    // The ratio as a fraction P/Q (7.3 is 73/10), so exact means exact.
    var P = 1, Q = 1;
    for (var den = 1; den <= 100000; den++) { var num = Math.round(R * den); if (num > 0 && Math.abs(num / den - R) <= 1e-9 * R) { P = num; Q = den; break; } }
    var exactR = Math.abs(P / Q - R) <= 1e-9 * R;
    // Every stage turns the way the whole train does (a speed-up inside a
    // reduction only adds teeth), and none is 1:1.
    var dir = R > 1 + 1e-12 ? 1 : R < 1 - 1e-12 ? -1 : 0;
    var way = function (d, w) { return dir > 0 ? w > d : dir < 0 ? w < d : true; };
    // Each whole ratio driven/driver once, its fewest teeth: more only adds teeth.
    var W = hi + 1, byKey = new Array(W * W), pairs = [];
    for (var d = lo; d <= hi; d++) for (var w = lo; w <= hi; w++) {
      var g = gcd(w, d), k = (w / g) * W + d / g;
      if (!byKey[k]) { byKey[k] = { driver: d, driven: w, n: w / g, m: d / g, sum: d + w }; pairs.push(byKey[k]); }
    }
    var score = function (stages) {
      var q = 1, sum = 0, logs = [];
      stages.forEach(function (s) { q *= s.driven / s.driver; sum += s.driver + s.driven; logs.push(Math.log(s.driven / s.driver)); });
      var mean = logs.reduce(function (a, b) { return a + b; }, 0) / logs.length;
      var spread = logs.reduce(function (a, b) { return a + Math.abs(b - mean); }, 0);
      return { stages: stages, ratio: q, error: Math.abs(q - R) / R, teeth: sum, spread: spread, key: sum + 2 * spread };
    };
    var best = {}, nearest = {};
    var consider = function (n, stages) {
      var o = score(stages);
      if (o.error < 1e-9) { if (!best[n] || o.key < best[n].key - 1e-12) best[n] = o; }
      else if (o.error <= 0.005 && (!nearest[n] || o.error < nearest[n].error - 1e-12 || (Math.abs(o.error - nearest[n].error) < 1e-12 && o.key < nearest[n].key))) nearest[n] = o;
    };
    // The last stage, exactly: the pair making num/den, if there is one.
    var lastExact = function (n, prefix, num, den) {
      var g = gcd(num, den), a = num / g, b = den / g;
      if (a > hi || b > hi) return;
      var p = byKey[a * W + b];
      if (p && !(n > 1 && (p.n === p.m || !way(p.driver, p.driven)))) consider(n, prefix.concat([p]));
    };
    // Or as near as whole teeth get.
    var lastNear = function (n, prefix, need) {
      var cut = nearest[n] ? nearest[n].error + 1e-12 : 0.005;
      for (var d2 = lo; d2 <= hi; d2++) {
        var w2 = Math.round(need * d2);
        if (w2 < lo || w2 > hi || (n > 1 && (w2 === d2 || !way(d2, w2)))) continue;
        if (Math.abs(w2 / d2 - need) / need > cut) continue;
        consider(n, prefix.concat([{ driver: d2, driven: w2 }]));
      }
    };
    counts.forEach(function (n) {
      if (n > 1 && !dir) return;
      var per = Math.pow(R, 1 / n), band = n === 3 ? 2.5 : Infinity;
      var inBand = function (r) { return r >= per / band / 1.0001 && r <= per * band * 1.0001; };
      // Fewest teeth first, so a train found early cuts the search short.
      var some = n === 1 ? [] : pairs.filter(function (p) { return p.n !== p.m && way(p.driver, p.driven) && inBand(p.driven / p.driver); })
        .sort(function (a, b) { return a.sum - b.sum; });
      if (n === 1) { if (exactR) lastExact(1, [], P, Q); lastNear(1, [], R); return; }
      if (n === 2) {
        if (exactR) some.forEach(function (a) { lastExact(2, [a], P * a.m, Q * a.n); });
        if (!best[1] && !best[2]) some.forEach(function (a) { var r = a.driven / a.driver; if (!late() && r >= per / 3 && r <= per * 3) lastNear(2, [a], R / r); });
        return;
      }
      if (exactR) {
        for (var i = 0; i < some.length && !late(); i++) {
          var a = some[i];
          if (best[3] && 2 * a.sum + 2 * lo >= best[3].key) break;
          for (var j = i; j < some.length; j++) {
            var b = some[j];
            if (best[3] && a.sum + b.sum + 2 * lo >= best[3].key) break;
            var need = R * a.driver * b.driver / (a.driven * b.driven);
            if (!inBand(need)) continue;
            lastExact(3, [a, b], P * a.m * b.m, Q * a.n * b.n);
          }
        }
      }
      // Near (not exact) three-stage trains: only when nothing exact has turned up.
      if (!best[1] && !best[2] && !best[3]) {
        var tight = some.filter(function (p) { var r = p.driven / p.driver; return r >= per / 1.5 && r <= per * 1.5; });
        for (var x = 0; x < tight.length && !late(); x++) for (var y = x; y < tight.length; y++) {
          var need3 = R * tight[x].driver * tight[y].driver / (tight[x].driven * tight[y].driven);
          if (inBand(need3)) lastNear(3, [tight[x], tight[y]], need3);
        }
      }
    });
    // Exact ones by fewest stages; else the nearest within 0.5%. More
    // stages only when they make the biggest gear smaller (or, not exact,
    // come at least twice as near).
    var biggest = function (o) { return Math.max.apply(null, o.stages.map(function (s) { return Math.max(s.driver, s.driven); })); };
    var pick = function (list, nearer) {
      var out = [];
      list.forEach(function (o) {
        var prev = out[out.length - 1];
        if (!prev || biggest(o) < biggest(prev) || (nearer && o.error < prev.error / 2)) out.push(o);
      });
      return out;
    };
    var out = pick(counts.map(function (n) { return best[n]; }).filter(Boolean), false);
    if (!out.length) out = pick(counts.map(function (n) { return nearest[n]; }).filter(Boolean), true);
    if (!out.length) return { problem: partial ? 'none found in the time allowed: a narrower range of teeth searches faster' : 'no train of ' + lo + ' to ' + hi + ' teeth comes within 0.5% of it: allow bigger gears (more teeth)', partial: partial };
    out.forEach(function (o) { o.stages = o.stages.map(function (s) { return { driver: s.driver, driven: s.driven }; }); delete o.key; });
    return { options: out, partial: partial };
  }

  // Two stages whose last axle comes back onto the first, as a clock's hour
  // wheel turns on the minute hand's arbor: both stages the same center
  // distance, so the same teeth all told (driver + driven). Exact ratios
  // first (else within 0.5%), then the fewest teeth; each stage the train's
  // way. The second stage folds back (angle 180).
  function sameCenterTrain(R, lo, hi) {
    if (Math.abs(R - 1) < 1e-9) return { problem: 'a ratio other than 1: two stages that each turn the train’s way can’t make 1:1' };
    var dir = R > 1 ? 1 : -1, near = null, exact = null, t0 = Date.now();
    // The fewest teeth all told first: sums from the smallest up; an exact
    // ratio a little bigger (up to half as many teeth again) beats a near one.
    for (var sum = 2 * lo; sum <= 2 * hi; sum++) {
      if (exact || (near && sum > near.sum * 1.5) || Date.now() - t0 > 300) break;
      for (var d1 = lo; d1 <= hi; d1++) {
        var w1 = sum - d1;
        if (w1 < lo || w1 > hi || (dir > 0 ? w1 <= d1 : w1 >= d1)) continue;
        for (var d2 = lo; d2 <= hi; d2++) {
          var w2 = sum - d2;
          if (w2 < lo || w2 > hi || (dir > 0 ? w2 <= d2 : w2 >= d2)) continue;
          var q = (w1 * w2) / (d1 * d2), err = Math.abs(q - R) / R;
          if (err > 0.005) continue;
          var o = { stages: [{ driver: d1, driven: w1, angle: 0 }, { driver: d2, driven: w2, angle: 180 }], ratio: q, error: err < 1e-9 ? 0 : err, teeth: 2 * sum, sum: sum,
            spread: Math.abs(Math.log(w1 / d1) - Math.log(w2 / d2)), sameCenter: true };
          if (o.error === 0) { if (!exact || o.spread < exact.spread) exact = o; }
          else if (!near || (sum === near.sum && o.error < near.error)) near = near && sum > near.sum ? near : o;
        }
      }
    }
    var pick = exact || near;
    if (!pick) return { problem: 'no two stages of ' + lo + ' to ' + hi + ' teeth bring the last axle back onto the first within 0.5% of this ratio: allow more teeth' };
    delete pick.sum;
    return { options: [pick] };
  }

  // The train's axles: the first at (0, 0), each next one its stage's
  // center distance away at the stage's angle (degrees from +X, counter-
  // clockwise; 0 for all is a line along +X). Each gear's axle, its plane
  // (the stage) and its tip radius; and where a gear reaches another axle's
  // shaft (diameter `shaft`, with `room` to spare): gears turn in their own
  // planes, so only the shafts through every plane can be hit. An axle on
  // another (a train that comes back round, as a clock's hour wheel on the
  // minute hand's) is `concentric`, not a hit: it turns on a tube over it.
  // p: { module }, stages: [{ driver, driven, angle }].
  function trainLayout(p, stages, shaft, room) {
    var m = p.module, axles = [{ x: 0, y: 0 }], gears = [];
    stages.forEach(function (s, i) {
      var cd = m * (s.driver + s.driven) / 2, a = (s.angle || 0) * Math.PI / 180;
      axles.push({ x: axles[i].x + cd * Math.cos(a), y: axles[i].y + cd * Math.sin(a) });
      gears.push({ stage: i, role: 'driver', teeth: s.driver, axle: i, ra: m * (s.driver + 2) / 2 });
      gears.push({ stage: i, role: 'driven', teeth: s.driven, axle: i + 1, ra: m * (s.driven + 2) / 2 });
    });
    var dist = function (a, b) { return Math.hypot(axles[a].x - axles[b].x, axles[a].y - axles[b].y); };
    var concentric = [];
    for (var i = 0; i < axles.length; i++) for (var j = i + 1; j < axles.length; j++) if (dist(i, j) < 0.01) concentric.push([i, j]);
    var same = function (a, b) { return a === b || concentric.some(function (c) { return (c[0] === a && c[1] === b) || (c[0] === b && c[1] === a); }); };
    // Its mesh partner's axle is inside the partner's teeth: the bore's own check.
    var hits = [], sr = (shaft || 0) / 2 + (room || 0);
    gears.forEach(function (g) {
      var partner = g.role === 'driver' ? g.axle + 1 : g.axle - 1;
      axles.forEach(function (x, j) {
        if (same(j, g.axle) || same(j, partner)) return;
        if (dist(j, g.axle) < g.ra + sr - 1e-9) hits.push({ gear: g, axle: j });
      });
    });
    var ratio = stages.reduce(function (q, s) { return q * s.driven / s.driver; }, 1);
    var box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    gears.forEach(function (g) { var c = axles[g.axle]; box.x0 = Math.min(box.x0, c.x - g.ra); box.x1 = Math.max(box.x1, c.x + g.ra); box.y0 = Math.min(box.y0, c.y - g.ra); box.y1 = Math.max(box.y1, c.y + g.ra); });
    return { axles: axles, gears: gears, hits: hits, concentric: concentric, ratio: ratio, box: box, length: dist(0, axles.length - 1) };
  }

  // Angles for the stages that fold the train smallest (the area of the
  // box round its gears) with no gear reaching a shaft: the first stage
  // along +X, each next turned in 30° steps, all tried for up to four
  // stages. Same-center trains (a last axle on the first) are kept so.
  function foldTrain(p, stages, shaft, room) {
    var n = stages.length, best = null, steps = [];
    // A train whose last axle is on the first stays so: only its turn as a whole is free.
    var sameCenter = trainLayout(p, stages, 0, 0).concentric.some(function (c) { return c[0] === 0 && c[1] === n; });
    for (var a = -150; a <= 180; a += 30) steps.push(a);
    var area = function (L) { return (L.box.x1 - L.box.x0) * (L.box.y1 - L.box.y0); };
    var tryAngles = function (angles) {
      var st = stages.map(function (s, i) { return { driver: s.driver, driven: s.driven, angle: angles[i] }; });
      var L = trainLayout(p, st, shaft, room);
      // Only the same-center pair a train already has; no other axles landing on each other.
      var keepsCenter = sameCenter ? L.concentric.length === 1 && L.concentric[0][0] === 0 && L.concentric[0][1] === n : !L.concentric.length;
      if (!L.hits.length && keepsCenter && (!best || area(L) < best.area - 1e-6)) best = { angles: angles.slice(), area: area(L) };
    };
    (function rec(i, angles) {
      if (i === n) { tryAngles(angles); return; }
      if (i === 0) { rec(1, [0]); return; }
      // Past four stages the search would be too slow: those stay as they are.
      if (n > 4) { rec(i + 1, angles.concat([stages[i].angle || 0])); return; }
      steps.forEach(function (d) { rec(i + 1, angles.concat([angles[i - 1] + d])); });
    })(0, []);
    return best ? best.angles.map(function (x) { return ((x % 360) + 540) % 360 - 180; }) : null;
  }

  // A closed polyline offset outward (to the right of its counter-clockwise
  // travel) by r: arcs round the outside corners, and the loops an offset
  // makes in tight inside corners trimmed. Starts at the offset of the
  // point farthest from the center, which is always on the final path.
  function offsetOutward(pts, r, arcStep, keepStart) {
    arcStep = arcStep || 5 * Math.PI / 180;
    var n = pts.length, start = 0, far = -1;
    // keepStart: the caller's first point is already a safe place to start.
    if (!keepStart) for (var i = 0; i < n; i++) { var d = pts[i].x * pts[i].x + pts[i].y * pts[i].y; if (d > far) { far = d; start = i; } }
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
      // Straight back on itself (the end of a narrow slot): an outside corner, rounded, never a miter.
      if (dot < -0.9999 && Math.abs(cross) < 1e-3) turn = Math.PI;
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

  return { basics: basics, rack: rack, gear: gear, makeRack: makeRack, rackPair: rackPair, makeRing: makeRing, ringPair: ringPair, RING_DIFF: RING_DIFF, toolPath: toolPath, minModule: minModule, maxBitDiameter: maxBitDiameter, solvePairs: solvePairs, solveStandard: solveStandard, roundSizes: roundSizes, backlashFor: backlashFor, suggestStandards: suggestStandards, roundFor: roundFor, solveRoundPairs: solveRoundPairs, solveRatioPairs: solveRatioPairs, measureGear: measureGear, planetary: planetary, planetPhase: planetPhase, solvePlanetary: solvePlanetary, nestInRing: nestInRing, solveTrain: solveTrain, trainLayout: trainLayout, foldTrain: foldTrain, minClearance: minClearance, friendlyModule: friendlyModule, pair: pair,
           offsetOutward: offsetOutward, trimLoops: trimLoops, simplify: simplify, simplifyClosed: simplifyClosed, distToSegment: distToSegment, MODULES: MODULES };
});
