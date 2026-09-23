# Cybertruck character

The vehicle is authored in a shared local frame: +Z forward, +Y up, +X right, in metres. The humanoid stands about `ROBOT_Z` forward of the vehicle origin. The transform path runs from 0 (vehicle) to 1 (robot); reverse transformation traverses the same path backward. The 8-second duration is the canonical value in the character choreography.

Panels begin in exact vehicle positions. The model maps each panel into a skeleton bone's folded frame, then applies its hinge, slide, and unlatch steps over the authored time windows. The track evaluator limits tangents so interpolated joints do not overshoot. Ground lift is solved from support points for intermediate and robot poses; tyres stay at their radius while vehicle suspension moves the body.

The robot's gait hands over at progress 1. While transforming, either locomotion path brakes toward a stop. A transform request made while moving waits until speed is below 0.3 m/s; Space may reverse an in-progress transform. The current drive model is a camera-relative bicycle approximation, and robot motion pivots around the robot standing point. Motion values in `src/game/movement.ts` are the defaults for this character until another vehicle needs its own tuning.

Controls are Space to transform, WASD or arrow keys to move in camera space, Shift to boost or run, pointer drag to look, and the wheel to zoom. Normal play has no on-screen controls or HUD.

The character's visible materials are node materials and TSL. Geometry remains authored as named panels and bone structure so moving parts retain their identities. Altering panel geometry or transform steps should be checked across both endpoints and intermediate poses, not just in one form.
