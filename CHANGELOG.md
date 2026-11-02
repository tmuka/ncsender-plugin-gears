# Changelog

## 0.3.2: Add a gear to your set

### ✨ New
- **Add a Gear to This Set** (the Center Distance card's title menu): a new gear that meshes with one you've cut.
  The tooth size and pressure angle are kept; pick the gear you have and type where the new axle goes, and it
  lists the nearest distances whole teeth allow. The new gear becomes Gear B and Cut is set to it alone.
- **Load** and **Save to File Manager**, as in QuickCut: every program ends with the settings it was made with;
  with the switch on it's also saved in File Manager › Gears (never over an older one), and Load fills the form
  from any of them. The program's header names a whole Diametral Pitch beside the module.

### 🔧 Changed
- **Gap Between** is the whole space between the gears where they come closest: at least the bit's diameter
  and a tenth, which is what blank gives. A gap you had saved carries over as the same space.

## 0.3.1: Small bores in big-toothed gears

### 🐛 Fixes
- A small bore in a gear with big teeth is no longer refused: a 6 mm D shaft in a 6-tooth pinion of
  module 8.5 was asked for 12.7 mm of material under the teeth (a spoked rim's 1.5 modules). A solid gear
  now needs one module, or the bit's width, and the message says how much the bore leaves.

## 0.3.0

**Start from where the axles go, cut a rack or a ring gear, and use less stock.** A pair from this release
has been cut in MDF and meshes.

### ✨ New
- **Start from the Center Distance:** a card above Teeth. Type where the axles go, then the **Ratio** (how it
  should turn) or **Gear A's outside diameter**. It works out the teeth, tooth size and pressure angle that mesh
  at exactly that distance with your bit, as three choices: **Coarse** (fewest, biggest teeth: strongest, easiest
  to cut), **Balanced** and **Fine** (smoother). Typing picks one straight away; tap another to change it. Each
  says the ratio it really makes, both outside diameters, the biggest bit that cuts it, and when a small gear's
  teeth are undercut. Everything in the Teeth card can still be changed by hand.
- **Both gears nested:** Gear B is turned so its teeth face Gear A's spaces and set as close as the bit allows
  (one cut's width and 0.5 mm between them), about 14–18 mm less stock on the pairs tried. **Gap Between** is
  now extra space, 0 by default, for a screw or clamp between the gears or sturdier tabs.
- **Rack and pinion:** Gear B's menu can make it a **rack** of N teeth, with Gear A as its pinion: straight
  teeth that match the gears', on a bar **Rack Height** deep with screw holes, cut with tabs on its bottom edge.
  The preview rolls the pinion along it; the facts give the rack's travel a turn and where to mount it.
- **Ring gears:** Gear B's menu can make it a **ring** with its teeth inside, Gear A its pinion turning inside
  it, the ring's teeth shaped as cut from inside with your bit and kept clear of the pinion's roots; a **Rim
  Width** with screw holes, cut with tabs on its tooth tips.
- **The tool menu** (with a tool changer): a filter on top (T number, name, notes or size), the tool in the
  spindle first. **Flutes** come from the tool table (the Fusion 360 importer can fill them), else the tool's
  name ("O flute", "2 flute"...), else 2.

### 🐛 Fixes
- Long tool names in the tool menu wrap instead of running over the next one.
- The tool menu's filter no longer shows at the dialog's top left when the menu is closed.
- A saved Gap Between of 6 mm (the old default) becomes 0, as the gears are now nested; a gap you chose stays.

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
