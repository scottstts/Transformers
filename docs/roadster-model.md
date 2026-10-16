# Roadster model authoring

The Blender build lives in `blender/roadster_build/rdb` (`run.py` entry,
`rdb_build.car_stage()`), saved to `blender/roadster.blend`. Step 1 is in
progress: the car is built and awaiting approval; the robot and the
transformation come next.

## Reference registration

The car is fitted to registered references, not eyeballed (`reference.py`):

- Side: the 6 s frame of `ref_images/roadster/top-side-view.MP4` (a long-lens,
  pure side view of the left side), cropped to 2600 x 800 at (500, 820). Scale
  and origin come from the wheels: 541 px per metre, front hub at y -1.405,
  z 0.397, ground at row 752.
- Top: `top.JPG` (nadir drone shot), 156.9 px per metre, nose at column 670 =
  y -2.19, centreline row 679. Plan half-widths come from its white-body mask's
  upper edge (the lower edge is in shadow).
- Front and rear photos are perspective: a pinhole camera is fitted to
  landmarks (`fit_camera`) and the model is rendered through it.

`reference.overlay('side' | 'top')` and `overlay_front('front' | 'back')` write
model/reference blends to `blender/renders/roadster_ref/`. The registered side
and top images also sit in the scene as planes (collection `91_REFERENCE`,
hidden by default; hide `stage.ground` to see the top plane).

Resulting datums: 4.36 m long (nose -2.19, tail 2.17), 1.91 m over the rear
haunches, roof 1.205, wheelbase 2.911, tyre radius 0.392, light disc r 0.28,
tail deck 0.903.

## Body construction

- One shell lofted through measured transverse stations (`body.ST`): underbody
  edge, rocker band top, side crease, upper edge (fender peak, then belt, then
  haunch), inner edge (hood edge, canopy base, rear glass edge, deck) and the
  centre. One canopy lofted from the measured top silhouette and roof rail.
- Panels are boolean intersections of those solids with convex regions bounded
  by the measured seams (`panels.py`), with 3 mm shut lines. Every panel shares
  the single lofted surface, so seams never step.
- Wheel openings, the propulsion bay, the nozzle slot and the raked lower tail
  are cut before panelling.
- Crease sharpness follows the loft's feature lines (a `band` face attribute
  written by the loft), not a dihedral threshold: an angle threshold flickers
  between sharp and smooth along gently twisting surfaces such as the rear
  quarters. The crown and the front fender flank are smooth.

- Sections are refined: every facet between feature lines is subdivided and
  bowed outward by a measured sagitta (`body.SHELL_BULGE`), and rings are 12 mm
  apart. The canopy is a 6 mm glass shell, not a filled volume, so the cabin
  shows through it.
- Rear and front perspective photos are registered at a plane (`reference.PLANES`):
  the rear at the tail plane (603 px/m, anchored on the deck edge, cross-checked
  against the side frame's lower lip), the front at the nose plane. The front
  photo is near-orthographic (a long lens): the camera distance that fits both the
  fender peaks and the roof is 30 m.

## Verification

- `linecheck.run(view)` projects every model feature line (creases, material
  borders, open seams, silhouettes; visibility ray-cast) onto the registered
  reference and measures each sample's distance to the nearest reference edge;
  `linecheck.tiles(view)` cuts 4-6x zoomed reference | overlay tiles. Views:
  'side', 'top', and fitted-camera photos ('nv' = normal-view.avif). Review every
  tile, not the full frame: discrepancies of a few millimetres only show zoomed.
- Feature curves are pchip-interpolated stations then Gaussian-smoothed along y
  (body.SMOOTH): raw pchip is only C1 and its curvature steps at every station
  showed as vertical bands in reflections.
- The front fender is cut from its own shell (shell_mesh(flank=True)): its flank
  is one smooth arc from rocker to the fender-top crease, as the 3/4 photo shows;
  everything behind the fender / door shut line comes from the faceted shell.
  Details placed on the fender (marker) read their surface from the same ring.
- The wheel face is one lofted surface (wheels.rim): dished toward the hub, six
  channel-section spokes whose edges are real vertex columns, bronze fins in the
  channels; the rear propulsion parts are lofted / swept / turned profiles
  (propulsion.py), not boxes.

## Decisions from the reference audits

- The rear is a carbon guard (shroud, shelf, pillars, trapezoid lip, dividers)
  with compressor engines behind it, not fans in the face: each engine shows its
  casing, outlet guide vanes, compressor stage and a domed tail cone. The guard's
  outline and every datum come from back.JPG at the tail plane
  (propulsion.py docstring).
- The light bar and nose face are straight across: the 3/4 photo's camera fit is
  best with no plan bow (mean 14 px against 17 px with the top view's apparent
  95 mm curve). The nose corners are rounded in plan (body.CORNER_R).
- The front lip is a 65 mm black blade that wraps the nose corners and runs back
  along the body side to the front wheel, its bottom falling from z 0.264 to 0.19.
- The windshield's side edge and the door frame seam behind it are measured lines
  on the side frame (car.SCREEN_EDGE, GLASS_SEAMS); the white roof rail runs down
  the A-pillar to the cowl.
- Glass meets body on the body's own crease (canopy base 1 mm above p4) and a
  seat volume under the glass is cut from the shell, so no body facet crosses the
  glass between stations.
- Cut panels take their normals from the uncut loft (car.adopt, data transfer on
  the on-surface vertices); the hood and crown height curves are smoothed with a
  60 mm Gaussian so reflections do not band.
- The wheel's six arms are a measured V pattern: the 0/180 degree arms radial,
  the other four meeting in pairs at points 88 mm above and below the hub.
- Interior per interior.avif: reclined white bucket seats with grey wings, a white
  console, slim alcantara dash and carbon face, floating screen, white square
  yoke, the alcantara header / A-pillar hoop / diagonal struts / rails, a mirror
  on a triangular bracket, carbon door cards with an alcantara blade and red light.
- Inspection renders use AgX and denoised EEVEE ray tracing (stage.py).

## Modules

- `rear.py` every rear element with its measured position (docstring table): the
  inset light-bar housing, arched red bar, smoked lenses, faceted tail panel with
  its ledge, embossed plate and camera, reflectors, the U mask with its nozzle slot,
  flanged nozzles, fan cells, ramped diffuser with strakes, and the raked side pods.
- `front.py` light bar, carbon-weave grille, sensor, lip, splitter (kept inside the
  plan outline) and the headlamps, which are the lower tip of each fender-top facet
  up to a level edge at z 0.72, with LED fins.
- `side.py` side markers; the fender flaps are cut in `car.body_panels`.
- `wheels.py` tyres with grooves and sidewall lettering, the six-arm rim with its
  aero disc and bronze vanes, drilled discs; calipers and suspension sit on
  non-spinning `asm.hub.*` nodes.
- `interior.py` / `doors.py` the cabin from the interior photo (white bucket seats
  with alcantara bases, square white yoke, floating landscape screen, header beam,
  diagonal bars to the dash, roof spine, red ambient strips, door cards).
- `aero.py` road / high-downforce poses and a preview loop on the timeline (f0-90).

## Car features from the video

- The active wing is the full-width deck lid aft of the rear glass (`asm.wing`),
  flush in road mode; its end plates are the tail corners' side skins
  (`asm.plate.L/R`). High-downforce mode (video, 18 s side shot): the lid pitches
  19 degrees about its leading edge and moves 0.17 aft, 0.07 up, its trailing
  edge ~0.15 behind the tail; the plates ride with it and flare as fins. Each strut
  is a blade pinned under the lid (`asm.wing.strut.*`) that slides in a sleeve
  fixed in the tail, re-aimed at the sleeve in every pose (aero.deployed).
- The fender section between the front wheel opening, the side marker and the
  door shut line is an active flap (`asm.flap.L/R`) that opens at its rear edge.
- Four ducted fans sit in cells behind the raked lower tail, four nozzles in a
  slot above them. Four lift jets (behind the front wheels, under the rear pods)
  are a fixed sleeve and a telescoping stage (`asm.jet.*`, `asm.jet.*.stage`).
- Doors are gullwings that carry the side glass and the roof outboard of the
  tapered centre strip (|x| 0.160 -> 0.095); the side glass has the measured frame
  seams behind the A-pillar and ahead of the door shut line.
