# Impala model authoring

The Impala remains one assembled model throughout deployment. Car stampings
and trim move on rigid carriers; the internal mechanical core is fitted into
the car rather than exchanged for a second model. Native Blender authoring is
approved and exported (`impala_build/export.py`, run through `export_game.py`). Game
integration is impala.md.

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

## Game export

`assets/impala.{json,bin}` carry the baked timeline of `impala.blend` (241 frames,
8 s) in the shared container; `assets/impala-cutlass.{json,bin}` is the weapon
(`weapons_build/wpn/cutlass.py`: 3.41 m overall, a 2.87 m blade, grip centre at the
origin, edge toward +X, the blade curving toward -X; the pommel end is its second grip).

- The authoring scene hosts every car panel and linkage stage in world space. The
  export parents each to the skeleton bone nearest it in the finished robot and
  stores the exact transform relative to that bone at every frame, so playback
  matches the authored motion and the live gait carries the panels. Stowed
  castings stay children of their joint (`part:<joint>`); the four wheels are
  hub-centred `wheel:wheelF.*` / `wheel:wheelR.*` nodes (tyre, rim, hub and drum spin;
  the leaf spring stays on the assembly).
- The export targets 4.5 M triangles from the 5.5 M authoring model. The entire
  robot head and meshes containing paint, chrome, glass, lamp or bulb-glass slots
  retain their authoring topology and corner normals. Remaining meshes share the
  remaining budget, with collapse reductions checked against a sampled 0.5 mm
  surface-distance limit. This checks geometry rather than shading fidelity;
  visual approval is still pending. The budget is a soft target because failed
  reductions retain more geometry (`IMPALA_TRI_BUDGET=0` retains all density).
  The current inspection export contains 4,622,916 triangles and a 69.36 MB binary.
- Ground lift is the lowest support point of the model on z = 0 (linkage stages
  excluded); it stays within 5 mm over the whole timeline.
- The rig block describes the authored stand pose. Two things differ from the
  conventions the live gait assumes (hands that bend fingers about Y, forearms
  that only flex): the Impala's fingers flex about X and its forearms turn in
  32 deg. The game rig reads both from the bones (`RobotRig.hand`, impala.md), so the
  handover to the gait is seamless.
- The brace stages leave their 4 % nests in frames 1 to 3 (a scale jump of about
  0.9), which the export reproduces.
