# Gears

**Real, working gears from your CNC in a few minutes.** Tell Gears how far apart the axles are and
the ratio you want. It picks the teeth, shows them turning, and writes the G-code for
[ncSender](https://github.com/siganberg/ncSender). Press **Generate**, cut, and they mesh.

<p align="center"><img src="docs/gears-turning.gif" width="420" alt="A 24 and 12 tooth gear pair turning in the Gears preview"></p>

Great for toys, clocks, winches, marble machines and gear-ratio demos, in plywood, MDF, hardwood,
HDPE, acrylic or aluminum.

<p align="center"><img src="docs/cut-gears.jpg" width="600" alt="A 12 and 6 tooth gear pair cut in MDF, still in the stock"></p>
<p align="center"><em>The first pair cut with Gears: 12 and 6 teeth in MDF, straight off the machine. They mesh.</em></p>

## Three steps

1. **Pick your bit.** Choose it from the tool table or type its size. Gears only offers teeth that
   bit can cut.
2. **Type the center distance and the ratio.** Tap one of the pairs that fit: coarse, balanced or
   fine.
3. **Press Generate.** Both gears come out in one program, nested close together to save stock.

![The Gears dialog: a 2:1 pair at 90 mm, with three pairs to choose from](docs/dialog.png)

## Racks and ring gears too

Switch Gear B to a **rack** for straight-line motion, or to a **ring** for planetary gears and
compact reductions.

<p align="center">
  <img src="docs/rack.png" width="380" alt="A pinion on a rack">
  <img src="docs/ring.png" width="380" alt="A pinion inside a ring gear">
</p>

Inspired by Matthias Wandel's gear work at [woodgears.ca](https://woodgears.ca); for paper templates
to cut on a bandsaw, use his (more complete) [gear template generator](https://woodgears.ca/gear/).
Gears isn't affiliated with him: its geometry is the standard involute, written fresh.

## Everything it does

- **A gear pair** that meshes: teeth for Gear A and Gear B, one tooth size (**Module**, **Diametral
  Pitch** or **Circular Pitch**, from the menu on its label), a **Pressure Angle** (14.5°, 20° or 25°).
  The preview shows the pair at the center distance; **Turn** rolls them through mesh and **Animate**
  runs them. The ratio, center distance, outside diameters and contact ratio are listed under it.
- **True involute teeth, cut as a rack cuts them.** The flanks are within 0.001 mm of the exact
  involute, and gears with few teeth get the undercut the mating tooth needs, so any two gears of the
  same tooth size and pressure angle mesh.
- **Teeth your bit can cut.** The bottom of each tooth space is rounded to at least the bit's radius,
  so a round end mill reaches all of it. That sets the smallest teeth a bit can cut, which the Teeth
  card shows with a link to use it (a 1/8" bit: about 3.2 mm module, Diametral Pitch 7; a 1/4" bit
  twice that). Teeth too small for the bit are refused with what to change.
- **Clearances for real materials.** **Backlash** (play between the teeth, 0.3 mm by default) and
  **Tip Clearance** (room at the root: blank is a quarter module, or more when the bit's rounding at
  the root needs it so the other gear's tips clear it; a typed one under that is refused).
- **Gear bodies:** a **Bore** for the axle: round; **Hex** (sized across the flats, such as 12.7 mm
  for a 1/2" hex shaft); **D** (round with one flat, for a D shaft such as a motor's, sized by
  **Across the Flat**); or **Keyed** (round with a keyway, **Key Width** at least the bit's and
  **Key Depth** past the bore). Each sharp corner gets a small notch so a sharp-cornered shaft or key
  fits. And **Lightening Holes** in a ring between the hub and the teeth, or **Spokes**: straight
  spokes from the hub to the rim (**Spoke Width**, blank for automatic) with windows between them,
  their corners rounded past the bit. Holes and windows are cleared out from the middle, so nothing
  comes loose.
- **Cutting:** each gear's holes, then its teeth from outside a bit radius out; depth passes, each
  ramped down along the path at 5° or less (Z never faster than the Plunge Rate), and **Holding Tabs**
  on tooth tips, where they're easy to sand off. Conventional or Climb.
- **Both gears in one program**, nested to save stock: Gear B turned so its teeth face Gear A's spaces, as close as
  the bit allows (one cut's width and 0.5 mm between them), with an optional **Gap Between** for a screw or clamp, or
  sturdier tabs. Or either one alone; X0 Y0 at the gear's center or the front-left corner of the cuts.
- **Rack and pinion:** Gear B's menu can make it a straight **rack** with that many teeth, Gear A
  its pinion: the same tooth size, pressure angle, backlash and bit-rounded roots, on a bar **Rack
  Height** deep under the teeth, with screw holes along it (Gear B's Bore and Holes fields become
  the screw holes' size and count). It's cut from outside with tabs on its flat bottom edge. The
  preview rolls the pinion along it, and the facts give the rack's travel a turn and where to mount
  it: its pitch line and bottom edge from the pinion's axle.
- **Ring gears:** Gear B's menu can make it a **ring** (an internal gear) with its teeth inside and
  Gear A its pinion turning inside it, the same way: for planetary gears and compact reductions. The
  ring needs at least 12 more teeth than the pinion at 20° (10 at 25°, 16 at 14.5°), or their tips
  collide. Its teeth are shaped as your bit cuts them from inside, a little short so they clear the
  pinion's root rounding; it has a **Rim Width** outside its teeth with screw holes (Gear B's Bore and
  Holes fields). It's cut from inside with tabs on its tooth tips, so the middle stays put until you
  cut them, then round its outside.
- **Ratio:** Gear B's field can take the ratio A:B instead of its teeth (3 for 3:1); Gear B's teeth
  are worked out to the nearest whole tooth and the real ratio shown.
- **Center Distance:** blank is the gears' own. Type the distance the axles must be and either
  spread the gears to it (a little wider: more backlash, shown with the contact ratio; too wide or
  too close is refused with the range that works) or press **Fit Tooth Size** to make the teeth mesh
  at exactly that distance. An idea: with Spoilboard Toolbox, the center-to-center spacing of your
  spoilboard's holes or threaded inserts is a distance you can fit to, to try a pair on bolts in the
  spoilboard (for a test: a bolt's thread wears a bore).
- **Frame Holes:** the two axle holes in a frame board, exactly the center distance apart (round;
  for a hex bore, blank means across its corners so the shaft turns).
- **The tool table**, as in QuickCut: click the **Bit Diameter** label for the loaded tool's
  diameter. With a tool changer it's a menu of the tool table instead: pick the tool and the program
  starts with a tool change to it (M6); typing another diameter, or **No tool change**, leaves it out.
  The menu lists the tool in the spindle first, with a filter on top (T number, name, notes or
  size). Picking a tool, or taking the loaded one, sets **Flutes** from its name or notes
  (O flute, 0flute, single flute, 2 flute, 3FL...), or to 2 when they don't say.
- **Start from the Center Distance:** type where the axles go, then the ratio (or Gear A's outside diameter), and pick one of the pairs that mesh there, coarse to fine: tooth counts, tooth size and pressure angle worked out for the bit you're cutting with. A tap fills in the Teeth card, where it can still be changed.
- **Starting feeds** from the **Material** and **Flutes** (the same table as QuickCut and Spoilboard
  Toolbox, after [ncCAM](https://github.com/siganberg/ncsender-plugin-nccam)'s formula), kept within
  the machine's max feed and spindle range.
- **Units:** follows ncSender's (mm or inches); module is in mm either way. Programs are written in mm,
  and an inch machine gets G20 back at the end.

## Install

From ncSender's Plugin Manager, or download the zip from
[Releases](https://github.com/tmuka/ncsender-plugin-gears/releases) and install it there. Open it from
**Gears** in the plugin tool menu.

## Development

```
npm test        # the inline copies are current, then node --test tests/*.cjs
npm run inline  # copy lib/*.cjs into config.html after changing them
npm run build   # dist/com.tmuka.gears_v<version>.zip from the last commit
```

`config.html` is the dialog; ncSender runs it inline, so `lib/*.cjs` are copied into it between
markers by `.scripts/inline.cjs`. See CLAUDE.md for how it's built and tested.

## License

GPL-3.0. Built from [QuickCut](https://github.com/siganberg/ncsender-plugin-quickcut)'s starting points
(its dialog style, starting feeds and unit entry, used under its GPL-3.0 option).
