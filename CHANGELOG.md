# Changelog

## 0.7.0: First cut without knowing gears

- **Your First Cut:** on a first open, a card asks the board's thickness and sets up a small 2:1 test pair for your
  bit (about five minutes with a 1/8" or 3 mm bit): round teeth it cuts, small bores, through the board (the frame's
  too), X0 Y0 at its front-left corner, with its frame holes a link away.
- **Starter standards from your bit:** the Teeth card suggests round sizes the bit cuts (DP 8 for 1/8", module 3
  for 3 mm, module 4 for 4 mm, DP 3 or module 7 for 1/4" and 6 mm), each said as the gears it makes and setting
  the backlash it needs; offered open after a first Generate, not before.
- **Round tooth sizes without a standard:** Start from the Center Distance offers Coarse, Balanced and Fine at round
  sizes the bit cuts, no more odd ones (Fit Tooth Size still fits a distance exactly).
- **New ways to start:** Start from the Ratio (no distance), Match a Gear I Have (its teeth and the diameter across
  its tips give its module and DP, then Add a Gear for its mate).
- **Must Fit (W × H):** each option says whether the pair fits the board it's cut from, measured as Generate nests
  it; the pick prefers one that does, Start from the Ratio tries pinions down to 6, and it says when none fits.
- **Options say more:** whether the bores fit, how much a small gear is undercut (fine, or a little weaker).
- **The tool menu** lists end mills first; V-bits, drills, surfacing and roundover bits behind Show All Tools; an
  end mill too big for the teeth is marked.
- **Less at once:** Backlash, Tip Clearance, Delay, Mist, Flood, the tabs' size, Direction and Gap behind "More";
  a dotted label explains itself when tapped (no hover on a touchscreen); the bit shown in the sidebar.
- **Fixes:** "This bit cuts teeth down to …" (it read as the opposite), its link only when the teeth are too fine;
  a design off the standard says what it meshes with; the footer's problem is a link to its field; new installs
  zero X0 Y0 at the front-left corner and start a metric machine at a 3 mm bit; Help's standard advice matches
  what common bits cut; Start from the Ratio keeps the shop standard and picks the smallest close pair; typing a
  ratio keeps the distance you typed; every "a bit up to" agrees; Load keeps Your First Cut put away.
- **Help: Getting started** (a test pair, one tooth size, start from what you know).

## 0.6.2: Measured previews

### ✨ New
- **The pictures are measured**, in QuickCut's style (accent dimension lines, open arrowheads, bold values): two
  gears' outside diameters and center distance; a rack's length, its pinion's diameter and the axle-to-rack-bottom
  mounting distance; a ring's diameter and its pinion's offset; a planetary set's ring and axle circle; each gear
  train stage's distance along its link; the Frame Holes' spacing and sizes; the cut layout's stock width and
  height. Hidden while a dot or an axle is dragged.

### 🔧 Changed
- **Errors don't move the fields:** a field's error shows in a box under its card's title, the field outlined red,
  instead of under the field (where a long one pushed the field beside it out of line). Center Distance's "no pair
  fits" shows there once, not three times.

## 0.6.1: Help with pictures

### ✨ New
- **Help has pictures:** a tooth close up (pitch, tip and root circles, a module each side, the bit in the root), two
  gears meshing, the same tooth size meshing beside a different one colliding, measuring a gear, a planetary set
  turning (sun, planets, carrier, ring held), a two-stage train with its compound gear, a clock's 12:1 motion work
  turning both hands clockwise on one center, a rack and pinion, the cut with its tabs read back from a real
  program, and the depth passes. Drawn from the plugin's own geometry; they move while Help is open, and stay still
  when the system asks for reduced motion.

### 🔧 Changed
- **Help reads easier:** lines of about 70 characters with each card's figures beside them (stacked above in
  portrait); cards without figures in two columns.

### 🐛 Fixes
- **Start from the Center Distance says when nothing fits:** a ratio (or Gear A's size) no pair can make at the
  distance with your bit is an error under the field and in the problems, saying the distance or bit that would
  work (rounded so typing it works) and that the Teeth card still has the pair from before. It was a grey hint, so
  the old pair looked like the answer.
- The Depth view's Total Depth label no longer runs off the edge with a long value.

## 0.6.0: Shop standard and planetary sets

### ✨ New
- **Shop standard:** keep one tooth size and pressure angle for everything, so every gear you cut meshes with every
  other. Set it on the Teeth card (or the round size nearest); it's shown in the sidebar and kept apart from
  designs, Load and sets. Start from the Center Distance then lists the whole-tooth pairs at it nearest your
  distance (spread to it when they can; the nearest within 2% of the ratio is picked), picked when you leave the
  field; a design off it says it won't mesh with your other gears, with Use the Standard.
- **Planetary sets:** a **Planetary** button on the Gear Pair tab: a sun, planets on a carrier and a ring. Find a
  set by ratio or type the teeth; the planets are checked for even spacing and clearance, with the nearest teeth
  that work; the preview turns it all; the facts give the ring-held, carrier-held and sun-held ratios. Cut
  everything nested (the sun and planets inside the ring's opening where they fit, the ring last, X0 Y0 at its
  center), one part, or the carrier plate (drilled to the Frame Holes tab's depth).
- **Two Gears | Rack and Pinion | Ring and Pinion | Planetary** buttons at the top of the Gear Pair tab, whose title
  follows them; the rack and ring were hidden in Gear B's label menu.
- **Pinion and Ring nest:** the pinion is cut inside the ring's opening, on the same center, then the ring, instead
  of beside it (beside only when the pinion and the Gap Between don't fit inside the opening).
- **Up and Down arrows** step number fields, as in QuickCut: 1, Shift 10, Alt (Option) 0.1, Ctrl (Command) 0.001.
- **Help:** "Designing gears: how it's usually done" (what makes gears mesh, a shop standard, the usual order,
  fixed distances, how a clockmaker starts, measuring a gear), "Planetary sets, plainly", and what Ø means.

### 🔧 Changed
- **The Gear Pair tab starts with the design:** Center Distance (or Planetary), Teeth, Gear Bodies, then Tool,
  Depth and Cut. The design card names the bit it's for, with a link to change it.
- **What to fix shows at once:** a field that keeps the preview from drawing shows its error straight away, and
  the preview and the footer say what it is (switching to Ring and Pinion with 8 ring teeth said only "Fix the
  fields").

### 🐛 Fixes
- The facts no longer show a backlash and a negative contact ratio for a Center Distance that can't work: they give
  the range that does.
- Help said 12 teeth avoids undercut at 20°; it's 17 (12 is the 25° figure).

## 0.5.0: Clock trains and diagrams

### ✨ New
- **Folded gear trains:** drag an axle round the one before it in the Gear Train picture, a degree at a time,
  locking onto each 30° (or type its Angle). **Fold Compact** finds the smallest fold with no gear reaching another
  axle's shaft; **Straighten** undoes it. Frame Holes drills the axles where the picture shows them.
- **Same center:** **Last Axle on the First** finds two stages that bring the last axle back onto the first, as a
  clock's hour wheel on the minute hand's shaft (12:1 is 8:32 then 10:30): one frame hole for both, and that gear
  bored to a **Tube Ø** to turn on a tube over the shaft.
- **Presets** in Find a Train: a clock's seconds to minutes (60:1), its minutes to hours (12:1, same center), a
  slow crank (10:1) and a spinner (1:5), each saying what its axles do.
- **Diagrams that follow the settings:**
  - The Cut cards show the stock from above, drawn from the program itself: every cut through at Total Depth at
    the bit's width, the holding tabs as orange dots, X0 Y0 and the stock's size.
  - The Depth card shows the cut from the side: Z0, each pass, the tab left standing, Total Depth into the
    wasteboard.
  - The Teeth card shows where the teeth meet, close up: a tooth of B in a space of A, the pitch circles, the
    line of action at the pressure angle, the backlash, the tip clearance and the bit in A's root.
- **Help:** "Gear trains, plainly" (stages, compound gears, folding, same center, which way they turn) and "What
  to make with them" (clocks, replacement gears and how to measure one, indexing wheels, jigs, turntables...).

### 🔧 Changed
- **All gears packs tighter:** each gear goes where the stock stays smallest (touching one or two placed already,
  Gap Between apart, within the machine's travel, turned along its longer axis when that fits better), never
  worse than the old rows: 16-27% less stock on the trains tried.
- Touch drags on the preview's handles no longer scroll the page.

## 0.4.0: Gear trains

### ✨ New
- **Gear Train** tab: pairs in a row, each driven gear on one axle with the next stage's driver, for more ratio
  than one pair makes (60:1 for a clock). Type a ratio and it finds the smallest trains that make it (exactly
  when whole teeth allow, else within 0.5%), within a range of teeth, every stage turning the same way; or type
  the stages. Every gear gets the Axle Ø bore, each stage's bigger gear Wheel Spokes. The preview turns the
  train and warns when a gear reaches another axle's shaft (the frame isn't drilled for such a train). Cut all
  the gears in one program (packed in rows, biggest first), a stage's pair, one gear, or the frame's axle holes.
- **Drag the preview:** Gear B's center sets the Center Distance, the top of Gear A its outside diameter. A tap
  goes to the field. Two gears only.
- **Named sets** in the Load panel: save the settings you have under a name (the program's name to start with),
  load or delete them (with Undo), no program needed. Kept in the plugin's settings.
- **The fine print** in Help and the README: you run the machine, check each program first, no warranty or
  liability (GPL-3.0), not an official ncSender plugin.

### 🔧 Changed
- **Holes and Windows: Cut Out** is the new default: lightening holes and spoke windows are cut round their
  edge with two tabs holding the piece, instead of cleared out. A clock train with spoked wheels went from
  56 minutes to 20. **Clear Out** is the old way. Bores are still cleared.
- Tab heights in a program's comments are rounded (an inch tab showed 1.5239999999999998 mm).

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
