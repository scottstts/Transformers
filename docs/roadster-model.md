# Roadster model authoring

The Blender build lives in `blender/roadster_build/rdb` (`run.py` entry), saved to
`blender/roadster.blend`. `rdb_build.car_stage()` builds the car (approved and locked);
`rdb_build.robot_stage()` then builds the robot on top of it, docks the car parts and
bakes the transformation. Step 1: the robot and transformation are in their first
rough pass, awaiting inspection.

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
- `aero.py` road / high-downforce poses; the transformation uses them for its launch configuration.

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

## Robot

- 6.0 m to the head top (the Cybertruck's class). Datums are read off the concept
  sheet's front and side views at 0.00725 m per pixel (rig.py). At that scale the
  car's light bar matches the concept's chest light bar and the rear wheels match
  the concept's calf wheels; the nose clip is a little wider and deeper than the
  concept's chest.
- Car parts on the robot (dock.py, one rigid car-to-robot map per assembly):
  - Chest: the nose clip (nose forward, pitched 12 deg nose-down), so its fenders
    are the chest's flanks and its black front is the lower band. A gloss-black
    plate fills the cowl between the fenders as the concept's black chest top;
    white covers close the front wheel arches.
  - Back: the floor tub and the tail fold up the back as a hinge chain. The tail stands
    rear end down as the flight pack, rear glass facing back and the fans and nozzles
    thrusting down. The roof strip folds into its open top (it lies inside, below the rim);
    a two-leaf lid seals the top at the end (lid.py, below). The tub,
    holding the folded cabin and the windscreen, stands between the pack and the back.
  - Forearms: the gullwing doors are the shields, with the door glass folded down
    inside the skin.
  - Shoulders: the front wheels sit outboard of the shoulder joints, inside
    arched pauldrons.
  - Calves: the rear wheels sit on the outer calves, under white arches.
- Robot armour is faceted convex plates (hs.py: gem plates, sector wraps round a
  limb) over graphite mechanics with bronze rams and hoses.
- The wheel fenders (pauldrons, calf arches) are smooth swept arches (hs.fender):
  the arc is finely stepped and smooth shaded, while the section keeps the low-poly
  edges (flat inner face, chamfered outer lip, crown crease). The ends taper toward
  the tyre. The pauldron's arc runs from -8 to 234 deg and is deepest at the top-back
  and where it drops past the front of the wheel. Tyre clearance, wall face and lip
  are as before.

### Head and neck (r_helmet.py, r_head.py)

- Traced from ref_images/roadster/head-face-neck.png. Its front and back panels
  are orthographic at 1.55 mm per pixel (centre lines u 312.5 / 943.5, head centre
  c at v 295, the visor's centre height); they set every outline's X and Z. The
  near-profile panel is the same head drawn 1.087x larger (1.426 mm per pixel)
  and sets the depths. Where the panels disagree, the front panel wins: the back
  panel's lowest plate under the ear is left out because the front shows none there.
- The stowed head lies face down in the nose. In the head frame the car floor is
  at Y -0.31 and the hood line at Y 0.54 - 0.78 Z. So the face's front is held at
  Y -0.297, and the horn tips at Y 0.19. The horns rake less than the profile
  draws them, with a raked leading edge and an upright trailing edge.
- The black dome is flat facets. The centre panels, top cap and crown are each one
  plane across the centre line. Each side facet's free corner is solved onto the
  plane of its other three. The mask is a twisted wedge: its centre recedes 0.10 m
  top to bottom, while its edges under the jaw blades hardly move. So it folds on
  convex diagonals instead.
- Under every shell and plate is a closed gloss helmet body (head.core). It is
  fitted by horizontal rays from the head's axis to the first inner surface,
  less 6 mm, so every seam shows it recessed, never the hollow behind a panel.
  Below the plates it tapers into the neck on fixed sections (r_helmet.LOWER).
  Change a plate, and the body refits on the next build.
- The back spine plates are inset panels, 4 mm proud of the dome.
- The visor is one continuous white strip in a slot between the brow and the mask.
  Its V and plan curve are zc / ys in r_helmet.py.
- The neck stands on the neck bone. It has a front plate stack, back spine plates,
  front rams (converging down), rear rams (upright) and two links under the chin.
  It is bolted through a base flange onto the chest deck, which is flat at z -0.380
  about c. Each ram hangs on rod-end lugs: the pins run level and square to the
  ram, through clevis forks. The lower forks stand on the flange. The upper forks
  are posted up into the head body. They are on the neck bone, so a head pitch
  slides the posts inside the head rather than parting a joint.
- `headref.render(dir)` renders the head and neck orthographically at each panel's
  scale, for pixel overlays on the sheet. `refine.sync()` swaps the head and neck
  meshes in place, without a rebuild or rebake.

## Transformation (flight.py, choreo.py, linkage.py, bake.py)

9 s, 270 frames at 30 fps. Frame 0 is the car and frame 270 is the stand the live gait
takes over from: the export reads the rig's stand from the last frame. The hero landing
(7.3 s) comes before that last frame. Played backward, the same track runs crouch, jump,
flip at the apex, then a thrust-braked landing as the car.

### Flight

- The scene has no altitude. The game adds A(t), keyed on `flight.altitude` (z) and
  recorded in the scene's `roadster_flight`, so the export can add it to the lift track.
  A(t) = W(t) - c(t), where c is the baked height of the chest-pelvis midpoint. The
  midpoint's world path is therefore exactly W, whatever the poses do.
- W segments: on the ground to lift-off (0.8 s), constant-acceleration boost to 1.6 s,
  then one ballistic parabola peaking at the apex (4.0 s) to touch-down (6.6 s).
  W is solved so it starts at c(lift-off) and lands on c(touch-down); currently about
  18 m apex altitude and 5.6 m/s^2 effective gravity.
- The backflip turns the whole assembly about that midpoint (2.8 to 5.2 s, rate peaking
  at the apex). There is also a 4 deg launch pitch.
- Before lift-off the body squats on its suspension; after lift-off the wheels droop.
- Every part turns one way only, with the backflip. The chest and nose make one full
  turn; the pelvis also unwinds from its folded car pose in the same direction. The
  fold's root rotation is stored as a single x pitch, wrapped so it unwinds backward.
  An Euler decomposition came out as the equivalent (x + 180, 180, 180) set, and
  interpolating that spun the body forward against the flip at 3.3 to 4.3 s.
- In the air, the Blender view lifts the assembly only to keep its lowest point on the
  ground; A cancels that lift in the game. Contact is exact on the ground phases.

### Car mode

- The miniature robot is folded under the dash and in the nose, with each chain scaled
  in choreo.MINI. The fold pose is fitted so every casting's support points lie in the
  car's hidden volumes.
- The chest stands in the nose clip, the head lies in the nose, and the legs and arms
  are curled in the footwell. Nothing is stowed in the floor tub, so it swings clear
  without crossing anything.
- Each chain grows about its joints (castings and bone offsets together) while it unfolds.
  The head and neck never scale.

### Sequence

- **Opening (2.0 to 2.7 s):**
  - The gullwing doors rise 45 deg on their roof hinges.
  - The cabin folds into the floor tub.
  - The windscreen slides back flat into the tub's slab.
- **Clip drop (2.4 to 2.95 s):** the nose clip runs 0.6 m down its rails off the chest
  core, so the head, chest and arms rise clear of it rather than through its skin.
  - The head is the one part still crossing: its stowed place is inside the nose solid.
  - The clip rises back onto the chest at 3.4 to 3.9 s, before the knees come up in the
    tuck.
- **Arms and doors:** the arms rise straight up out of the footwell, then reach over the
  sills. The forearm braces take the doors at 3.1 s, and only then does the roof fold
  into the tail. The door's hinge stays on the roof until the grab.
- **Back pack:**
  - The floor tub swings 78 deg up about its front edge (3.1 to 3.85 s), then slides down
    the back's rails.
  - The tail turns 180 deg over the tub's rear edge (3.1 to 4.2 s), rear end down.
  - Hinges are explicit keys (`('hinge', pivot, axis, deg)`). Interpolating a 180 deg
    turn between poses is ambiguous and flipped the tail forward through the robot.
  - The pack's lid (lid.py) has two gloss-black leaves on a knuckle joint. Closed, they
    lie on the pack's rim plane, which the near wall top, both side bands and the rear
    glass's top edge all sit on (z = 5.349 - 0.351 (y - 0.766) in the stand pose). The
    outline follows the rear glass's curved edge.
    - Folded face to face, the pair stands upright inside the tail's near wall (a solid
      75 mm slab). It is hidden in the car and through the whole transformation.
    - 8.20 s: the pair rises out of the wall top. 8.45 s: the front leaf swings back
      about the near rim. 8.72 to 8.97 s: the rear leaf unfolds onto the far half.
    - The head is tipped back over the near wall through the landing, so the pair
      stands up only after it has come forward.
    - The leaves are the only nodes keyed: children of the tail's node, local matrices
      derived from the stand pose. `robot_stage()` rebuilds them after every bake.
    - A lid can't close the mouth before the end: in the car the cabin's rear reaches
      into the mouth, the windscreen and door glass pass through it until 3.3 s, and
      the roof folds into it.
- **Front wheels:** after the clip has dropped, they telescope 0.32 m straight out of
  their arches. The shoulder braces take them at 3.25 s, and they slide onto the pauldron
  hubs along the axle from 0.35 m outboard.
- **Rear wheels:** past the apex, the knees swing wide so the calves reach the pack's
  lower corners. The calf braces take the wheels at 4.5 s.
- **Shoulder shrug:** a clavicle rises with arm abduction beyond 20 deg (choreo.shrug),
  so the pauldron rides over the chest's fender. Arms that need to go wide go out and
  forward, abduction at most about 60 deg: a pauldron swung further strikes the fender.
- **Pose fixing:** key poses are fitted with posed-overlap tests (audit.posed / overlap)
  against the nose, pack, tub and other limbs.

### Carriers and braces

- Carrier keys are (t, host, pose). Pose is one of:
  - 'car': where it sat relative to that host at t = 0;
  - 'hold': keeps the world pose at a hand-over;
  - 'dock';
  - ('carpose', M);
  - ('hinge', ...);
  - ('approach', offset): the dock offset in the host bone's frame.
- Braced parts glide straight to their dock, turning about their own centre. Other
  turns of more than 15 deg follow the motion's screw axis.
- Each brace (linkage.py, the game's `link.<name>.pin.A/B/stage.n` convention)
  works like this:
  - It lies closed along its docked line inside the limb.
  - It reaches out from deploy to grab.
  - It carries the part in and closes at the dock.
  - Its closed length is its docked span, so the final frame is the brace's rest. That
    is what braces.ts lays live.
  - Current maximum stages: door 3, rear wheel 3, front wheel 7.

### Interface with the robot modelling

- rig.py datums and dock.py maps are the contract; castings only hang off bones.
- SHOULDER_X is 1.28 (the sheet's 1.04, moved out) so the pauldrons clear the fenders.
- The pauldron arch is built about dock.PAULDRON_HUB, as the calf arch is about
  dock.CALF_HUB.
- After a model change, rerun `rdb_build.robot_stage()` and `audit.car_mode_exposed()`. The
  fold fit and pose checks measure the castings; anything the check reports (other than
  rays through the slot behind each front tyre into its wheel well, which nothing reads
  through) shows through the car at frame 0.
- Known static overlaps when docked, for the modelling pass:
  - the tyres against the pauldron and calf arch walls;
  - the clavicle bridges inside the fenders (hidden).
