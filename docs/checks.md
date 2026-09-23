# Development checks

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:model`, and `npm run build` after code changes. `check:model` runs the headless checks transplanted from the prototype: folded robot containment, suspension and wheel contact, 201 forward and reverse transform poses, and 360 locomotion frames. The pose and gait checks intentionally produce no screenshots.

The browser view is intentionally left for manual visual review. After changing procedural panels, joints, materials, or terrain, inspect the car, intermediate transform, robot, walking, and driving states in the browser. Headless numerical checks catch invalid or drifting transforms but cannot judge silhouette, shading, or panel intersections.
