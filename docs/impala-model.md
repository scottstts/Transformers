# Impala model authoring

The Impala remains one assembled model throughout deployment. Car stampings
and trim move on rigid carriers; the internal mechanical core is fitted into
the car rather than exchanged for a second model. Native Blender authoring is
still undergoing reference and motion review. Export and game integration
follow user approval of the model, animation, and separate cutlass.

Car reference matching uses fixed pinhole cameras and unchanged source photos.
Contact sheets preserve image aspect ratios and do not deform either image.
The side profile supplies longitudinal body contours, while the front, rear,
and top constrain transverse sections, fascia depth, glazing, and plan shape.
The shell's side and shoulder share topology; independently sampled overlapping
skins previously caused the repeating jagged ridge along the whole beltline.

The head is a rigid casting and face assembly, with three concept-panel crops
for comparison. Its deployment uses translation and rotation. No animated head
scale is permitted. Body armor can fold around the shared car panels where a
literal mapping would prevent the required robot silhouette.

The cutlass is excluded from this scene and its deployment. Weapon authoring is
a separate Blender task. The car's wheel tubs are also intentionally omitted.

The bumper apron and front bumper are one closed stamping, so their shared
ledge has a single surface owner. End sections turn around the corners as
complete sections; varying their width independently at each height can fold
the cap through itself. Rear chrome uses tangent corner fillets instead of a
Catmull-Rom spline through alternating long straights and short elbows.

The hero robot is wider and deeper than the car body, so robot castings are
nested into their own joints in car mode (`stowage.py`): each group slides along
one straight line in its joint frame until it sits inside the body envelope,
whose top is the door beltline so nothing shows through the glass. During
deployment each group slides back out of its joint while the joint moves with
the skeleton. Nothing travels between the bonnet, boot and joints; overlaps
between castings exist only inside the closed body. No casting swivels through
open air (the old seat-base swivel in `storage.py` is disabled).

Groups that would sit in the cabin, where the glass would show them, are
instead squashed in place to 4% about their own centre in car mode and grow
back on their joint as it deploys; scale is keyed only on these nest nodes. The
head and neck are never scaled: they keep unit scale at every frame and only
slide within their joints.
The torso core grows first, because the roof and hood braces bear on it. The
cabin shows only its seats and trim in car mode.

Car panels that end far from where they start follow authored waypoints or real
hinges rather than a straight blend in the joint frame:

- The engine block sits forward in the bay, clear of the robot head packed
  behind it. It rises flush under the hood skin in the first moments and
  settles back down inside the chest once the car front has docked.
- The car front (hood, grille, bumper, engine) is one unit on keyed waypoints
  in the chest frame. It moves clear past the top of the lying robot's head
  while the rear hood stamp folds under it, turns level over the head, drops
  face-down well in front of the face, rotates level below the chin and slides
  onto the chest. No part of it crosses the head or shoulders.
- The rear module (tail, bumper, trunk lid, rear screen) sets down on its
  lowest point when the rear wheels leave, rises clear of the ground and folds
  on its own seams before closing on the back progressively (it does not hang
  back on long braces and dock at the end): the aft lid stamping swings down on the tail's top edge,
  the forward stamping folds under it, and the rear screen, still joined to
  that edge, stands up behind the tail lamps. It is carried onto the back on
  telescopic spine braces from the waist to the lid's forward stamping, which
  ends facing the robot, so no brace crosses a panel. Their lid pins sit 50 mm
  under the lid skin, concealed in car mode. On the finished back it reads as the
  car's rear: window between the C-pillars, tail lamps, bumper.
- Panels with left and right halves (roof, floor pans, benches) fold as mirror
  images on their centre line, like a closing book; no half flips over the
  other, so the back stays symmetrical through the fold. The folded floor pans
  and roof dock as thin upright sheets running side to side inside the torso,
  so none reaches the chest front or stands above it.
- The propeller shaft folds in half at its centre joint and docks inside the
  torso.
- The roof rides telescopic braces from the upper back until it docks. The
  fuel tank and its crossmember are carried by two cradle arms bolted to the
  tail panel, so the tank rides the rear module rigidly (the module sets down
  on it). The front door vent glass fills the four-sided opening. The
  tailpipe tails pivot on the pipe's own top surface.

`transition_audit.py` sweeps the timeline for car panels crossing the head,
neck, chest and shoulders, and for unsupported islands: connected clusters of
moving groups (exact surface distance under 30 mm) that touch neither the
robot body nor the ground.

The deployment opens the front wheel track, unfolds and plants both mechanical
feet, and then raises the chassis over them. The front wheels retain support
until the feet plant. Limb lengths are fixed by two-link inverse kinematics;
the head, limbs, and panels retain unit scale. Telescopic braces use nested
constant-length stages, with their stroke fitted across the entire timeline.
Ground clearance is measured from actual posed vertices, separately from
visual checks for crossing parts and unsupported motion.

The authoring meshes keep the car's small manufactured detail. A game mesh
pass remains necessary after the shape and motion are approved; the Blender
authoring density is not a runtime triangle budget.
