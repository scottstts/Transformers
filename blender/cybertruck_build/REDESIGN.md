# Robot redesign

Review `../cybertruck-transformer-redesigned.blend` in Blender.

Timeline: frames 0–240, 30 fps (eight seconds). Frame 0 is the approved truck;
frame 240 is the robot. All deployment and support-strut motion is keyed every
frame. Scrubbing backwards reverses the transformation. Timeline markers label
the main phases. No runtime handlers or visibility swaps are required.

The redesign adds a sloping split chest, shoulder shields, layered limb armour,
a tapered abdominal stack, a wider stance, and exposed hands. Head and neck are
fully replaced with a faceted helmet, recessed blue eyes, ear rotors, cheek
armour, and an armoured neck gimbal. Chest leaves lift over the existing cover
on paired telescoping supports before seating at the front.

Implementation: `ctb/redesign.py`. To regenerate, open the original baked file,
add this directory to Python's import path, and call `ctb.redesign.install()`.
During the same Blender session, repeated installation uses an in-memory copy
of the original animation. After reopening the redesigned file, rebuilding is
blocked to prevent applying retiming twice; reopen the original file instead.

Validation was limited to vehicle endpoint transforms and selected viewport
poses, including the closed truck and chest deployment. Vehicle meshes and
materials were not edited. This is a visual mechanical animation, not a strict
collision-certified mechanism. Game export was not regenerated.
