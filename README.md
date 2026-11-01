# Gears

Design a pair of spur gears and cut them straight from [ncSender](https://github.com/siganberg/ncSender):
pick the teeth, watch them mesh, press **Generate**. For toys, clocks, winches, marble machines and
gear-ratio demonstrations in plywood, MDF, hardwood, HDPE, acrylic or aluminum.

Inspired by Matthias Wandel's gear work at [woodgears.ca](https://woodgears.ca); for paper templates
to cut on a bandsaw, use his (more complete) [gear template generator](https://woodgears.ca/gear/).
Gears isn't affiliated with him: its geometry is the standard involute, written fresh.

## What it makes

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
- **Gear bodies:** a **Bore** for the axle, round or **Hex** (sized across the flats, such as 12.7 mm
  for a 1/2" hex shaft, with a small notch in each corner so a sharp-cornered shaft fits), and
  **Lightening Holes** in a ring between the hub and the teeth. Holes are cleared out from the
  middle, so nothing comes loose.
- **Cutting:** each gear's holes, then its teeth from outside a bit radius out; depth passes, each
  ramped down along the path at 5° or less (Z never faster than the Plunge Rate), and **Holding Tabs**
  on tooth tips, where they're easy to sand off. Conventional or Climb.
- **Both gears in one program**, side by side with a **Gap Between**, or either one; X0 Y0 at the
  gear's center or the front-left corner of the cuts.
- **Frame Holes:** the two axle holes in a frame board, exactly the center distance apart (round;
  for a hex bore, blank means across its corners so the shaft turns).
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
