# Gears for ncSender: plan

An ncSender plugin that designs gears and cuts them straight from the dialog: pick the teeth, see the
pair mesh, press Generate. Inspired by Matthias Wandel (woodgears.ca), whose gear machines and
[gear template generator](https://woodgears.ca/gear/) showed a generation of woodworkers that plywood
gears work. This plugin is not affiliated with him. Its math is the standard involute geometry, written fresh,
and the README will credit him and link to his generator for anyone printing paper templates.

## Who it's for

Someone with a CNC router and a sheet of plywood, MDF, hardwood, HDPE, acrylic or aluminum who wants
gears for a toy, a clock, a winch, a marble machine or a gear ratio demonstration. They think in teeth and ratios, not in modules and addendum
coefficients, and they cut with a 1/8" or 1/4" end mill, not a gear hob.

## What makes it different from a gear generator plus CAM

1. **Bit-aware teeth.** A round end mill can't cut a sharp root. The plugin knows the bit, rounds the
   root to it, and refuses (with the fix spelled out) a tooth size whose gap the bit can't get into:
   "With a 1/4" bit, teeth must be at least module N (worked out from the gap at the root); or use a 1/8"
   bit." The root gap is much narrower than the gap at the pitch circle, so this decides the smallest
   tooth a given bit can make, and it's the first number the plugin should work out.
2. **Clearances built in.** Backlash and tip clearance default to values that let wood and plastic gears
   run when the humidity or temperature changes, and the preview shows the gap.
3. **The pair, not one gear.** Two gears are designed together: ratio, center distance, and the holes
   for their axles in a frame board, drilled at exactly that distance.
4. **Straight to G-code**, in QuickCut's style: bore first, then lightening holes, then the teeth, with
   tabs, depth passes, Corner Relief where it applies, run time and the travel check.

## Version 0.1 (first release)

**Gear pair**
- Tooth size by **Module**, **Circular Pitch** or **Diametral Pitch** (a label menu that converts, as
  QuickCut's Across Corners / Flats does). Default: module from the bit, the smallest the bit can cut
  cleanly, rounded up to a friendly number.
- **Teeth** for each gear, or a **Ratio** (done after 0.1.0) and one gear's teeth (the other worked out, nearest whole tooth,
  the real ratio shown).
- **Pressure Angle**: 20° default; 25° suggested below about 14 teeth (stronger, less undercut).
- **Backlash** (default 0.3 mm on the pitch circle) and **Tip Clearance** (default 0.25 × module).
- Undercut handled honestly: the true involute plus the trochoid the mating tooth sweeps, so small
  pinions mesh. Profile shift is a later option.
- **Center Distance** (done after 0.1.0): typed, the gears spread to it (backlash shown) or **Fit
  Tooth Size** meshes them at exactly it. Profile shift to fit is still a later option.
- **Test on the spoilboard (idea, 2026-11-01):** niche, so for now only mentioned in the Help and
  README: Spoilboard Toolbox's center-to-center spacing of holes or threaded inserts is a distance to
  fit to. A Fit to Grid that reads its settings is for later, if asked.

**Each gear's body**
- **Bore**: round or hex (done in 0.1: across the flats, dog-boned corners); D and keyed (done after 0.1.0).
- **Hub** circle left solid around the bore.
- **Spokes / lightening holes**: round holes, or straight spokes with rounded-corner windows (done after 0.1.0). Cut as
  pockets or through-holes with Corner Radius at least the bit's.
- **Thickness** (cut depth), depth per pass, holding tabs on the teeth profile (placed on tooth tips,
  where they're easy to sand off, never in a root).

**Layout and cutting**
- Both gears on one sheet, side by side with a gap, or one at a time. X0 Y0 picker as QuickCut's.
- **Frame holes**: a separate program that drills or bores the two axle holes in a frame board at the
  center distance, from the same design, so the gears mesh first time.
- G-code order per gear: bore and windows (Inner), then the tooth profile (Outer) with tabs.
- Feeds from QuickCut's starting-feeds table (shared formula, credited to ncCAM), M6 with a tool
  changer, run time and travel check, all as QuickCut does them.

**Preview**
- The pair meshing, to scale, with the bit's path. **Turn** slider and an **Animate** button (as in
  Wandel's generator) to see the teeth roll through mesh.
- Undercut, too-small root gap and interference highlighted in red, with what to change.

## Later versions

- **0.2: more gear types.** Rack (done after 0.2.0); internal (ring) gear; compound gears (two gears on one hub, for gear
  trains); a gear train designer (chain several pairs to a target ratio, e.g. 60:1 for a clock).
- **0.3: pin and lantern gears.** Wandel's favorite for wooden clocks: pins (dowels) in a lantern pinion,
  cycloidal teeth on the wheel; drill-hole output for the pins.
- **0.4: escapements and ratchets.** A ratchet wheel and pawl, and a simple clock escapement wheel.
- Profile shift for small pinions; helical gears are out of scope for a 3-axis router.
- Optional printable template (SVG) for anyone cutting on a bandsaw.

## How it's built

Same pattern as QuickCut and Spoilboard Toolbox, so it's familiar and testable:

- `config.html`: the whole dialog, with inline copies of the `lib/*.cjs` modules (the dialog can't load
  external scripts); tests check the copies match.
- `lib/gear-geometry.cjs`: involute and trochoid points, tooth outline, root fillet from the bit,
  validation (`gearProblem(params)` returns the fix in words). Pure functions, unit tested.
- `lib/gear-gcode.cjs`: outlines to toolpaths. The tooth outline isn't convex, so it needs a real offset:
  sample the outline within 0.01 mm, offset by the bit radius, and trim the loops the offset makes in the
  roots. Tested the QuickCut way: every cut point exactly a bit radius from the outline.
- Reuse from QuickCut: tabs (`tabIntervals`), depth levels, program header and footer (M6, safe Z),
  starting feeds, run note. Copy them in for 0.1; they'd move to a shared library if ncSender ever offers
  one (see the "unit input as native library" idea).
- `tests/`: geometry (mesh check: the two outlines never overlap through a full turn, with the backlash
  left), G-code (offset distances, order, tabs), and a browser harness like QuickCut's.

## Decisions (agreed 2026-10-31)

1. **Name and ID**: "Gears", `com.tmuka.gears`, repo `tmuka/ncsender-plugin-gears` (renamed from Wooden
   Gears on 2026-10-31: it cuts many materials). GPL-3.0, since it reuses QuickCut's code.
2. **Units**: follow ncSender's units, with module in mm even in inch mode, and Diametral Pitch for
   inch users.
3. **0.1 scope**: the pair + bores + spokes + frame holes first; pin/lantern gears in 0.3.
4. **Credit wording** in the README: "Inspired by Matthias Wandel's gear work at woodgears.ca",
   with a link to his (more complete) gear generator.

## First steps

1. Repo skeleton (manifest, config.html shell, lib, tests, build script, README, CHANGELOG), copying
   QuickCut's dialog styles so it looks native.
2. `gear-geometry.cjs` with tests: involute tooth, root fillet, undercut, mesh check.
3. Preview of the pair with Turn and Animate.
4. G-code for one gear, then the pair and the frame holes.
5. Browser harness, independent review, then a 0.1 release.
