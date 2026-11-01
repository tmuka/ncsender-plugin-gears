# Gears: notes for working on it

An ncSender plugin (`com.tmuka.gears`, formerly planned as Wooden Gears) that designs a meshing pair of
spur gears and cuts them. PLAN.md is the plan and its later versions; README.md the user guide.
GPL-3.0: it reuses QuickCut's code (siganberg/ncsender-plugin-quickcut, GPL-3.0 or commercial).

## Layout

| File | What |
| --- | --- |
| `config.html` | The dialog: markup, styles, the UI script. ncSender runs it inline, so `lib/*.cjs` are copied into it between `/* BEGIN lib/x.cjs */` markers. |
| `lib/gear-geometry.cjs` | Rack-generated involute teeth (`gear`), the smallest module a bit can cut (`minModule`), pair facts (`pair`), the outward offset with loop trimming (`offsetOutward`), simplification. mm, radians. |
| `lib/gear-gcode.cjs` | The program: holes (cleared), teeth (offset path, depth passes, ramps, tabs on tips), both gears, frame holes. |
| `lib/starting-feeds.cjs`, `lib/unit-input.cjs` | Copied from QuickCut; keep in step with it. |
| `.scripts/inline.cjs` | Copies the libs into config.html; `--check` fails when a copy is stale (`npm test` runs it). |
| `.scripts/build.sh` | `dist/com.tmuka.gears_v<version>.zip` from the last commit. |

## How the teeth are made

`gear()` rolls a rack tooth along the pitch circle and records, at ~180 radii from root to tip, how far
from the tooth space's middle any rack position reaches (`spaceWidth`). The tooth's half angle is half
a pitch less that. So the flanks come out as the involute the rack's straight flank generates, the
undercut appears by itself on small gears, and the root is the trochoid of the rack's rounded tip. That
tip is rounded to the bit's radius × 1.02 (at least 0.3 m): a bit of that radius can follow it, which is
what limits the smallest module (`minModule`, from the rack tip's half width). Backlash thins the rack
tooth by half the backlash per gear; tip clearance makes the rack reach m + c in.

The bit's path is the outline offset outward by the bit radius (`offsetOutward`: arcs round outside
corners, miters in inside ones, loops trimmed), started at the point farthest out (always on the path).

## Testing

`npm test`. The tests check: flanks against the involute formula (< 0.001 mm) with the backlash; a pair
never overlapping through a pitch, closest at B cos α / 2; the path exactly the bit radius from the
outline and reaching all of it; `minModule` where the gear stops fitting; G-code run through a small
simulator (nothing below Total Depth, no rapids at depth, Z never faster than the Plunge Rate, teeth
never gouged, tabs on tips, holes).

UI: the test kit at `~/Documents/projects/ncsender-plugin-testkit` (its README is the method):
`openLocal({ config: 'config.html', pluginId: 'com.tmuka.gears' })` renders as ncSender does at the Pi's
1920 × 1174; `audit(page, '.gr-content.active', '.gr-field')`; on the Pi with the user's OK
(`pi.sh debug`, `pi.sh tunnel`, `connectPi`, `openPlugin(page, 'com.tmuka.gears', 'Gears', '.gr-nav')`);
speed with `frozen` / `profile`. On the Pi (0.1.0): opening ~80 ms; a new tooth count ~120 ms; Animate ~34 fps. Gears and their bit paths are kept for reuse (`gear`, `toolPath`), since the preview, the run note and Generate ask for the same ones; the run note's `programMinutes` scans the program by hand (a pair is ~40,000 lines). Install
a test build on the Pi: `curl -F plugin=@dist/<zip> http://192.168.1.65:8090/api/plugins/install`.
