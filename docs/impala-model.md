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

Rigid storage carriers nest robot castings inside the bonnet, boot and seat
pedestals. They return to their joint frames during deployment without a
visibility swap or animated scaling. Their closed-volume check establishes
car-mode concealment bounds; visual transition inspection remains necessary.
The short cervical cradle supports a fixed-size helmet, and twin shoulder webs
enclose the clavicular slides. The arm convention uses forward elbow flexion,
inner thumb roots and mirrored finger order.

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
