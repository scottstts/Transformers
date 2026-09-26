# Robot locomotion

The procedural gait (`src/content/transformer/animation/gait.ts`) and jump timeline (`src/game/jump.ts`) are shared by every robot; each character supplies a `GaitStyle` (step, lift, sway, hip and shoulder motion, heel/toe roll angles, and its sole: heel and toe edges from the ankle, ankle height). The rig (`model/rig.ts`) turns the channels into the pelvis frame, torso and head rotations and the two-bone leg IK.

## Walking and running

Shift switches walking to running. The run is a true run: stance is 36 % of the cycle (60 % walking), so both feet leave the ground; the body compresses at mid-stance and floats, knees lift higher, the torso leans and the arms pump.

- **Feet never skate.** A stance foot sweeps back exactly what the body travels while it is down (`2 × stance share × cadence stride`). The earlier gait swept one step length whatever the stance share, so walking feet crept forward (83 % of body speed) and running feet slid back (139 %). This was the main reason the walk looked stiff. A test checks a flat foot moves back at body speed.
- **Heel to toe.** The foot lands toe-up on the heel, rolls flat over the first 20 % of stance and peels onto the toe over the last 40 %, pivoting about the sole's measured heel and toe edges (the ankle target moves on the arc about that edge). The swing carries the toe-off into the air, relaxes the toe, lifts early (`LIFT_SKEW` warps the lift arc; a power law had an infinite slope at lift-off) and retracts slightly before the strike (Hermite swing leaving and arriving with part of the stance speed).
- **Body.**
  - The pelvis shifts over the planted leg and drops a little on the swing side, lagging the leg phase slightly. The earlier sway had the wrong sign and swayed over the swinging leg.
  - The hips yaw with the stepping leg; the shoulders counter-rotate and are held level against the hip list.
  - The head holds its gaze against the shoulder yaw and half of the bank.
  - The body leans with speed and into acceleration, and banks into turns.
  - Standing still, the weight shifts slowly from leg to leg.
- **Arms** swing opposite the legs with a small lag and follow through on damped springs (sub-stepped).

## Steering (`game/movement.ts`)

- Camera-relative, answered at once: the turn rate asked is 9 rad/s per radian off the wanted heading (ceiling 9 rad/s walking, 6 running), taken up at 18/s, damped just under critical. Facing the other way from a stand takes about 0.4 s. The old rate (2 rad/s ceiling, 6/s response) stepped slowly round and read as unresponsive.
- Speed rises at 4.5/s and falls at 7/s; while turning, the speed kept is (cos(angle off) + 0.3) / 1.3, so a sharp turn pivots before it runs.
- The gait's stepping takes a turn on the spot as at most 2.6 m/s of motion (`TURN_STEP_MAX`): a fast pivot shuffles instead of sprinting in place. The head's turn into a turn is capped at 18°.

## Carriage per robot

Each robot's `GaitStyle` may carry its own carriage for moving, when its stand does not suit locomotion (`track`, `armAbduct`, `runElbow`, `armCross`): the feet's track and the shoulders' abduction as shares of the rig's (blended in with the stride's amplitude, standing keeps the rig's own), the elbow bend at a full run, and the upper arms' inward rotation about their own axis (applied before the swing, so the bent forearms come forward and across the body). The rig reads them from the gait pose (`GaitPose.track`, `abduct`, `armTwist`), and the fight's overlay blends from the same track.

The F1's stand is built wide (feet 0.36 m out against 0.27 m hips, arms splayed 16°). Carried into the stride as it was, the swing foot kicked out and the pumping forearms swung out to the sides: the clown walk. Its style tracks the feet at 0.78 / 0.64 of the stance walking / running, brings the shoulders in to 0.55 / 0.45 of the splay, bends the elbows 72° at a run with 22° of inward rotation, and lifts the feet less at a run (0.44 m). The truck keeps the defaults.

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
