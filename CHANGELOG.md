# Changelog

## Unreleased

### ✨ New
- **Rack and pinion:** Gear B's menu can make it a **rack** of N teeth, with Gear A as its pinion: the
  rack's straight teeth match the gears' (backlash shared, roots rounded to the bit), on a bar **Rack
  Height** deep with screw holes along it, cut from outside with tabs on its bottom edge. The preview
  rolls the pinion along it; the facts give the rack's travel a turn and where to mount it from the
  pinion's axle.

## 0.2.0

**Bores for more shafts, and gears spaced to the distance you need.**

### ✨ New
- **D and Keyed bores:** a round bore with one flat (for a D shaft, sized Across the Flat) or with a
  keyway (Key Width and Key Depth), each sharp corner notched so the shaft or key fits.
- **Center Distance:** type where the axles must be; the gears spread to it (with the extra backlash
  and the contact ratio shown, and the range that works), or **Fit Tooth Size** meshes them at exactly
  that distance. Frame Holes drills at it.
- **Spoke windows:** in place of round lightening holes, straight spokes from the hub to the rim with
  windows between them, their corners rounded past the bit (**Spoke Width** blank for automatic).
- **Ratio:** Gear B's field can take the ratio instead (3 for 3:1); its teeth are worked out to the
  nearest whole tooth, with the real ratio shown.
- **The tool table, as in QuickCut:** the Bit Diameter label fills in the loaded tool's diameter; with
  a tool changer it's a menu of the tool table, and the tool picked gets a tool change (M6) at the start.

### 🎨 Layout
- Almost full screen, like Spoilboard Toolbox: on a wide screen the preview stays in the left column
  while the cards scroll in the right; on a narrow or portrait one they stack, with a taller preview.

## 0.1.0

**First version: a meshing gear pair from a dialog.**

### ✨ New
- Gear pair: teeth, tooth size (Module, Diametral Pitch or Circular Pitch), pressure angle, backlash,
  tip clearance; a preview that turns and animates the pair.
- Involute teeth generated as a rack cuts them, with undercut on small gears and the root rounded to
  fit the bit; the smallest teeth the bit can cut, and a refusal with the fix when they're smaller.
- Bores, round or hex (across the flats, with corner notches so a hex shaft fits), and lightening
  holes, cleared out; holding tabs on tooth tips; ramped entries.
- Both gears in one program, or either; Frame Holes at the center distance.
- Starting feeds by material; mm and inch.

### ⚠️ First version
- Checked in simulation and tests (tooth shape, meshing, the bit's path, Z speeds, tabs), but not yet
  cut on a machine: run it in the air first, then a pair in scrap MDF, and please share how they mesh.
