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
