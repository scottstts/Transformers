# Robot locomotion

The procedural gait (`src/content/transformer/animation/gait.ts`) and jump timeline (`src/game/jump.ts`) are shared by every robot; each character supplies a `GaitStyle` (step, lift, sway, hip and shoulder motion, heel/toe roll angles, and its sole: heel and toe edges from the ankle, ankle height). The rig (`model/rig.ts`) turns the channels into the pelvis frame, torso and head rotations and the two-bone leg IK.

## Walking and running

Shift switches walking to running. Walking contact occupies 60 % of the cycle; running contact occupies 36 % for the truck and 28 % for the F1, leaving a flight interval between steps. Step lengths (one full cycle covers two steps) are 2.025 / 4.6 m walking / running for the truck and 1.575 / 3.8 m for the F1. Longer strides preserve the original step rate: movement speeds are 5.1 / 15 m/s for the truck and 4.8 / 15.6 m/s for the F1. Tune speed together with stride length to retain cadence and ground contact.

- **Ground contact.** At a settled walk or run, a stance foot sweeps back exactly what the body travels while it is down (`2 × stance share × step length`). At starts, stops and pivots, the sweep fades with amplitude and a damped translation share. The cadence floor never imposes a minimum foot excursion, which would snap the feet outward at startup. Below that floor, settling the feet takes priority over exact contact speed.
- **Heel to toe.** The foot lands toe-up on the heel, rolls flat over the first 20 % of stance and peels onto the toe over the last 40 %, pivoting about the sole's measured heel and toe edges. The swing matches the full stance velocity at both ends, but those tangent terms fade quickly (`SWING_TANGENT_FADE`): a cubic Hermite carried them through the whole swing and, with the short run stance, flung the feet 0.3 m past their contact stations, which forced the pelvis down every flight. A squared, early-peaking sine lifts the foot and a squared sine relaxes its pitch, so both vertical and angular velocity meet the contact pose continuously.
- **Leg reach.** Before IK, the pelvis lowers as far as needed to reach the ankle targets with a soft knee (20° minimum at full locomotion amplitude). The gait hands the rig one leg's path sampled over the whole cycle (`GaitPose.stridePath`), and the pelvis is sized to that path's longest reach, not the current frame's. Sized per frame, the long run stride splayed the legs in flight and plunged the pelvis 0.3–0.5 m just when it should float: a spiky bounce. The steady carriage leaves the run's vertical motion to the flight hump and stance compression (about 6–7 cm). A long stride therefore runs lower; stride length is the lever on carriage height. The current frame's reach still applies through a smooth maximum over 6 cm (jumps, where the path fades out with the jump weight). This avoids straight-leg clipping and shortening the requested stride. The correction fades out with a combat overlay, which owns its own pelvis placement; the neutral exported stand is preserved.
- **Body.**
  - The pelvis shifts over the planted leg and drops a little on the swing side, lagging the leg phase slightly. The earlier sway had the wrong sign and swayed over the swinging leg.
  - The hips yaw with the stepping leg; the shoulders counter-rotate and are held level against the hip list.
  - The head holds its gaze against the shoulder yaw and half of the bank.
  - The body leans with speed and into acceleration, and banks into turns.
  - Standing still, the weight shifts slowly from leg to leg.
- **Arms** swing opposite the legs with a small lag and follow through on damped springs (sub-stepped). Their phase follows the actual stance and recovery durations, so the shorter run support does not put the arms out of step. Spring response rises with cadence within bounded limits, keeping the arms synchronized at full running speed.

## Steering (`game/movement.ts`)

- Camera-relative, answered at once: the turn rate asked is 9 rad/s per radian off the wanted heading (ceiling 9 rad/s walking, 6 running), taken up at 18/s, damped just under critical. Facing the other way from a stand takes about 0.4 s. The old rate (2 rad/s ceiling, 6/s response) stepped slowly round and read as unresponsive.
- Speed rises at 4.5/s and falls at 7/s; while turning, the speed kept is (cos(angle off) + 0.3) / 1.3, so a sharp turn pivots before it runs.
- The gait's stepping takes a turn on the spot as at most 2.6 m/s of motion (`TURN_STEP_MAX`): a fast pivot shuffles instead of sprinting in place. The head's turn into a turn is capped at 18°.

## Carriage per robot

Each robot's `GaitStyle` may carry its own carriage for moving, when its stand does not suit locomotion (`track`, `armAbduct`, `runElbow`, `armCross`): the feet's track and the shoulders' abduction as shares of the rig's (blended in with the stride's amplitude, standing keeps the rig's own), the elbow bend at a full run, and the upper arms' inward rotation about their own axis (applied before the swing, so the bent forearms come forward and across the body). The rig reads them from the gait pose (`GaitPose.track`, `abduct`, `armTwist`), and the fight's overlay blends from the same track.

The F1's stand is built wide (feet 0.36 m out against 0.27 m hips, arms splayed 16°). During locomotion its feet use parallel tracks at 0.82 / 0.78 of that width walking / running. Shoulder splay falls to 0.45 / 0.4, with only 6° of inward arm rotation at a run. The running elbow channel adds 52° to the rig's resting 14°, with a modest extra bend on the forward pump; total flexion stays below 95°. Walking clearance is 0.16 m and running recovery clearance is 0.48 m, before the sole roll.

The F1's transformation needs a knee pole tilted upward. Its moving pose blends that pole toward pelvis-forward, keeping the knees in forward-bending planes rather than kicking sideways when lifted. Reduced sway, hip list and shoulder yaw restrain the torso, while the speed lean accounts for the spine's existing 8° lean in the exported stand. These are runtime carriage changes; the transformation asset and standing pose remain authoritative.

`tests/locomotion-rig.test.ts` checks full step distance, solved ankle accuracy, steady planted-foot velocity, knee range, running pelvis bounce, joint continuity through movement transitions, velocity continuity at foot contact, and the F1's knee and arm alignment. It does not replace visual inspection of the assembled robot.

## Jumping

The timeline takes the forward momentum at take-off (speed over run speed). Timings (anticipation 0.36 s standing to 0.14 s at a full run, recovery 0.42 to 0.28 s) and squat depths shorten with it, so a jump from a run fires almost immediately. Take-off speed and gravity are the same for all: about 1.1 m high, 0.87 s in the air; momentum carries, no steering in the air, and a transformation can't start mid-jump.

- **Take-off.** The stride keeps running under the load, so feet on the ground stay put while the body loads over them. The old gait froze the stride while the body kept moving: feet skated through the anticipation.
  - Standing and walking jumps push off both feet (staggered as the stride left them) with a toe push, tuck, and land two-footed side by side.
  - From a run (momentum above 0.55) it is a leap: the free leg drives its knee up, the planted foot pushes off its toe, the legs scissor in the air.
- **Landing.**
  - Two-footed: both feet strike (`land(null)`).
  - Leap: it lands heel first on the lead foot straight into the stride. The gait phase is set to the lead foot's strike, and the trailing leg follows the live stride. Only the lead foot strikes (`land(lead)`), and the other's first footfall comes from the stride.
  - Footfall events are suppressed while loading and in the air, and resume once the landing has handed back half its weight.
- **Arms.** Standing: back during loading, forward and up before the feet leave, held through the apex, braced into the landing. Leaping: the arm opposite the lead leg drives forward. Shoulder pitch is negative forward in the authoring frame.
- **Ground contact.** The airborne height reaches the model as the gait's `air` channel, on top of the live foot contact.

All pose channels stay continuous through take-off and touchdown at standing, walking and running speed (tested against rate bounds that catch one-frame resets).
