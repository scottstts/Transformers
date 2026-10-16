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
- The black front (front photo through the fitted camera, 3/4 photo): a convex
  carbon visor under the light bar whose sharp lower edge is the thin highlight
  line, an open intake cavity below it (front.INTAKE) with the sensor on its back
  wall, and the lip. The lip is a rounded-rectangle blade across the nose
  (z 0.266-0.332) that steps down 30 mm at each corner and runs back along the
  sides, its bottom falling to 0.19 at the wheel. The black rocker band under each
  white nose corner sits below a 20 mm shadow gap along p1 (front.corner_gap).
- The nose face widens downward (front photo): the white corner's inner edge runs
  straight from the light bar's end out to |x| 0.583 at p1. Ahead of the front
  wheel opening the lower body (p0, p1) reaches |x| 0.87, in line with the tyre's
  outer face, so the shell hides the wheels from the front (body.NOSE_LOW); the
  side crease p2 by the opening follows the top view (0.82 at y -1.81).
- The windshield's side edge and the door frame seam behind it are measured lines
  on the side frame (car.SCREEN_EDGE, GLASS_SEAMS).
- The white roof rail is the 45-degree chamfer between roof and side glass, with
  the black seal in the side glass's plane. Down the front it is the A-pillar, a
  part of the body: straight in plan (body.A_PILLAR_X), full width to the
  windscreen's corner, where it runs into the white body. The side glass and seal
  close on the belt line where the pillar reaches down to it, so the side window's
  front tip ends behind the pillar foot. Ahead of the foot the windscreen's side
  edge is the pillar's inner line (body.PILLAR_IN) until it meets the hood edge.
- The windscreen rises straight off the hood and stands 11 mm above the side
  silhouette at the A-pillar foot; that lift eases out behind the foot
  (body.screen_lift). The pillar's top edge follows the silhouette, not the lift.
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
- Rear quarter (top view): behind the rear door joint the rail's top edge is the
  rear glass's side edge, straight and slightly inward to a corner at y 1.20, then
  straight in to the deck (body.EDGE_X). The window's top edge stays outboard
  (RAIL_X), so the white rail over the rear quarter window widens into a shallow
  surface lying with the sail. Behind the window tip it runs out into the sail over
  RUNOUT (body.REAR_FOOT): no separate strip carries on to the deck.
- The rear quarter window closes to a point: its pane keeps one inclination to the
  tip (body.quarter_base), its lower edge lands on the seal line, the seal tapers
  out over the last 60 mm, and its bows fall with the square of its height.
- The sails' ridges stand up beside the rear glass; the glass and the lid floor
  stay at their heights (rear photo, rear view at 33 s in the video, top view).
  Each ridge (shell p3, body.RIDGE_X / RIDGE_Z) carries the rail-top plan line
  straight on from the glass edge's corner and rises RIDGE_POP above the glass
  edge, with a concave outer flank (SAIL_CONCAVE) and an inner face down to the
  glass edge. On the wing lid it runs down in a straight line to the deck at an
  apex by the trailing edge, and the floor's edges turn out from the glass's
  trailing corners to that apex, so each lid triangle is one plane. The lid's
  outer deck and floor carry no bow, the ridge crease is sharp behind y 1.26
  (shell 'sharp_behind'), and the lid takes no transferred loft normals (they
  blotched its facets).
- Inspection renders use AgX and denoised EEVEE ray tracing (stage.py).

## Modules

- `rear.py` every rear element with its measured position (docstring table): the
  inset light-bar housing, arched red bar, smoked lenses, faceted tail panel with
  its ledge, embossed plate and camera, reflectors, the U mask with its nozzle slot,
  flanged nozzles, fan cells, ramped diffuser with strakes, and the raked side pods.
- `front.py` light bar, carbon-weave grille, sensor, lip, splitter (kept inside the
  plan outline). The headlamps are the tip of each fender-top facet ahead of
  y -1.884, in the lit 'lens' material, with nothing added on them.
- Front photo: both edges of the fender-top facet are straight seen from the front
  (body.FRONT_LINES): the crease p3 from the nose tip to the fender peak, the hood
  edge p4 from the tip to y -1.505. Their heights stay measured; x follows the
  lines. The side crease p2 also runs straight out from the lamp tip (front
  photo): its height follows a line from the tip to the measured crease at
  y -1.808 (P2_LINE_Y), and in plan it keeps a smoothly growing offset outboard
  of the straight p3 line back to y -1.86, so the faces between them neither
  twist nor overhang. The measured side crease begins at z 0.50 at the nose; only
  the tip constraint joined it to the lamp, which made it sag behind the tip.
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
  tapered centre strip (|x| 0.160 -> 0.095). The two black bands on the side glass
  are the door's window frame posts (`door.*.post0/1`), structural members the
  door carries, not trim: the front post runs from the windshield edge back to
  POST_SEAMS[0], the rear post from POST_SEAMS[1] back to the door shut line S2
  (the door-open photo shows the body's quarter glass starting at S2). They rise
  from the belt to the underside of the white roof rail and are cut from a
  POST_D (25 mm) deep version of the glazing loft, so their faces sit flush with
  the glass and the pane sits between them with the 3 mm panel gap.
