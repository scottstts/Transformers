# Transformation mechanics

Design choices behind the car <-> robot mechanism (Blender build, `ctb/choreo.py`, `ctb/motion.py`, `ctb/linkage.py`).

## Layout

The robot lies on its back in the truck, head at the tailgate, feet in the nose, arms along the torso over the rear wheel wells. Each limb wears the car's cross-section at its station: thigh = front door (outer side) + windshield/cowl (front); shin = hood (front) + front corner pod (fender, flare, liner, wheel, outer nose/bumper) outboard; foot = centre nose, light bar and bumper (toe cap); upper arm = rear quarter pod (a pauldron); forearm = rear door + roof glass; chest = tailgate on a folded tonneau; back = rear bumper and battery modules (the floor pan).

## Motion

- 0.00-0.30 unlock inside the truck: windows drop into their doors, mirrors fold, the tonneau Z-folds, pods and doors step out onto their carriers, the hood squares up and slides up the shin. The skeleton does not move.
- 0.30-0.90 the robot rises about its planted feet like a drawbridge (pelvis on an arc about the ankles), carried in game by lift thrusters on the back plate (cybertruck.md). Knees stay straight until the leg armour has docked (reach = leg length); hip lean is kept <= 8° so tucked hips clear the girdle. The arms stay on the torso (the hips lift the body); elbows flex just enough to lift the fists into the open side-window apertures, then the shoulder booms carry the arms out through them.
- Door and windshield dock after the arms are out; the knees bend into the stance last, then the hood and front pod take their final places above the knee.

Joint ranges that shape this: knee frame clearance ~70°, hip ~60°; the old crouch-and-stand choreography needed 113° and swept the shin armour through the door.

## Every panel is carried

A moving panel must stay connected to its limb (support gate, 30 mm): by its host's structure, its parent assembly, or a modelled linkage.

- Lifters: mount pads on 1-3 stage telescoping rods in bores in the limb. At rest a pad is the limb's ordinary seating datum; in transit it extends (ray cast to the posed panel) to keep bearing on it. Tubes stop above the forearm's hand sleeve, clear of the knee drum and outboard of the chest's head well.
- Tailgate: a U-yoke hinged on brackets outboard of the head well (the head rises between the arms), a turntable hub under the lid. The lid turns 180° on the hub (light bar to the top), then the yoke swings 90° over the chest's front edge; a rigid arm lands it exactly (hinge (0.30, 1.29), hub (0.445, 1.462), chest frame). The tonneau stack sits under it, top at 1.08.
- Rear pods ride a 3-stage carriage out of the upper arm and turn 90° on its hub.
- Rear bumper seats on the chest collar, slides over the back edge on a post, then down the back module.

## Datums worth keeping

- Front flare band width keeps a 5 mm reveal to the door (`FLARE_W` derived); the door leaves in an outer lane 0.20 out and 0.10 down (clears the flare and passes under the fists).
- Front pod: inboard face 0.375 (outboard of the thigh door), top 0.23 above the knee so it clears the sole line; its liner stays below the knee.
- Hood seats on lifters at f 0.284 (4 mm over the liner top), top 0.085 above the knee.
- Windows first step out along the facet normal (the glass is boxed in by a vertical seam to the crease trim and a horizontal seam to the seal), tilt upright, slide over the slot, drop. The B-pillar drops before the front glass.

## Audits

Gates on the build: islands / detached parts, coplanar faces, solid clashes at T = 0 and T = 1, the clash sweep over T (80-160 samples) and the support gate. Accepted: the front glass brushing its own door and the fender edge (~1 cm, ~0.2 s) while it rolls down inside the door; not visible from outside.
