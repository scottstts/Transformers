# Impala shared model and deployment

The editable scene is `../impala.blend`. Frame 0 is the car and frame 240 is the
robot. The shared car geometry, articulated mechanical core, and rigid
deployment are present in the live scene. Reference likeness and intermediate
motion review are still in progress. No model export or game integration is approved.

The car uses 39 rigid carriers. Body skins have actual thickness, authored
longitudinal curves and concave transverse sections. Hood channels, wheel
apertures and trim share dimensions in `contract.py`. Chrome rocker molding
stops at the wheel openings. The lamps have recessed reflectors, curved fluted
lenses and separate bezels; grille bars stop outside their apertures. Hubcaps
are formed dishes with five actual kidney vents. The cabin, cowl vents, rear
trim, suspension, driveline and exhaust are separate named manufactured parts.

The raised rear Chevrolet badge comes from subpixel contours of the supplied
`67_impala_chevrolet_logo.jpg`, including the letter counters. Contour cleanup
stays within 0.1 source pixel. Its chrome skin follows the rear panel, with
1.42–3.58 mm of relief. The grille badge uses the same source contours.

`run.car_stage()` rebuilds only objects marked `impala_build`. Scripts run in the
connected Blender session through MCP. `audit.run()` checks each finished part
for open edges, zero-area faces, loose vertices and positive volume; it also
checks wheel/body, lens/grille and corner-housing/body intersections.
Upper tyres sit behind the fenders; the actual surfaces, rather than a nominal
arch radius, determine clearance. Game mesh preparation remains a later task.

The front corner has a separate projecting profile, a shaped receiving opening
in the fender crown, and a housing return to the shell. The bumper and apron
are one closed stamping with no overlapping joining skins. The lower fender edge slopes rearward, and the
side molding begins behind the front wheel. All four wheel faces dish inward
about 50 mm from the outer lip to the ventilation bed; the central medallion
also remains inside the lip. Analytic stamp normals keep triangulation density
from producing ripples along the body creases. Each fender and door now owns
one continuous side-and-shoulder skin, with shared boundary vertices and a
single inner skin. Separate closed crown strips have been removed; their
mismatched sampling and overlapping joins contributed to the repeating
sawtooth ridge. Aligned support rows now follow every transverse stamping
station through the shoulder and character crease. One-sided derivatives at
the side's top boundary prevent the clamped curve endpoint from giving it the
wrong tangent. Face attributes retain the side and crown parameter fields through
native Boolean operations so their authored normals remain stable.

The quarter's inner shoulder now reaches the traced C-pillar foot. The lower
backlight cowl continues the deck channels and shares its outer contour with
the quarter. Its landing tangent fades into the quarter stamping instead of
changing cross-section abruptly at the trunk edge. The side window sill ends
at the front of that pillar landing.

Current inspection renders are in `../reviews/impala_reference_correction/`;
`impala_rebuild_car/` contains the rejected earlier checkpoint. Cameras, lights and
ground are grouped in `90_REVIEW_STAGE`. The scene has 241 baked frames at 30 fps.
All moving carriers have translation and quaternion channels; the head and limb
dimensions stay fixed. Feet deploy before the front wheels leave the floor.
Pinned, constant-length telescopic stages connect the front fenders, shoulder
doors, gauntlets, and hood to the mechanical core. `pose_audit.py` checks exact
posed mesh bounds against the ground, with failures driving the next motion pass.

The hood has two closed stampings sharing a position and analytical tangent in
car mode. Chassis rails, floor stampings, exhaust pipes, and axle halves have
separate mechanical carriers. Hardtop glass rolls into the doors in car mode
and rises on the shoulder assemblies. The rear sails fold with the backlight,
separately from the roof crown.

`run.refresh_car()` retains the inspection environment and existing robot core.
`run.robot_stage()` rebuilds the articulated core, fits the braces,
and bakes the deployment. `run.bake_stage()` refreshes the braces and timeline.
`head_review.py` and `robot_review.py` produce unwarped reference comparisons;
the latter also makes a nine-frame motion contact sheet.

The cutlass is excluded from the Impala scene. `stowage.py` creates rigid
storage carriers inside closed car volumes and bakes their return to the
joint frames. `robot_refit.py` owns the short cervical cradle and forged
shoulder bridges. The arm rig uses forward elbow flexion and mirrored inner
thumb roots. The wheel bead seats on the rim without a daylight gap; wheel
tubs are omitted as requested.
