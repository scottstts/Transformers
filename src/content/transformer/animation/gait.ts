import * as THREE from 'three/webgpu';
import type { GaitLeg, GaitPose } from '../model/rig.ts';
import type { JumpPose } from '../../../game/jump.ts';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = ( t: number ): number => t * t * ( 3 - 2 * t );
const ramp = ( a: number, b: number, v: number ): number => smooth( clamp( ( v - a ) / ( b - a ), 0, 1 ) );
const RAD = Math.PI / 180;

type Side = 'R' | 'L';
const SIDES = [ 'R', 'L' ] as const;

/**
 * Procedural gait. Produces foot targets (step forward / lift, metres, and
 * foot pitch) for the leg IK plus body channels in degrees: pelvis lean,
 * list and yaw, torso twist, arm swing, elbow, head.
 *
 * Feet: a planted foot moves back under the body exactly as fast as the body
 * moves forward (its stance sweep is the distance travelled while it is
 * down), so it never skates. It lands on the heel with the toe up, rolls flat,
 * then peels off the toe, pivoting about the sole's real heel and toe edges.
 * The swing lifts early (knee flexion), relaxes the toe, retracts slightly
 * before the heel strike and arrives moving with the ground.
 *
 * Body: the pelvis shifts over the planted leg, drops a little on the swing
 * side, yaws with the stepping leg and rises over mid-stance; the shoulders
 * counter-rotate and stay level, the head holds its gaze. Arms swing opposite
 * the legs with a slight lag and follow through on springs. The body leans
 * with speed, into acceleration and into turns.
 *
 * Running is a true run, not a fast walk: stance shortens below half the
 * cycle so both feet leave the ground between steps, the body compresses at
 * mid-stance and floats through the flight, knees lift higher, the torso leans
 * into the run and the arms pump with bent elbows.
 *
 * Jumps (see game/jump.ts) take over the pose by the jump's weight. The
 * stride carries on through the take-off, so feet on the ground stay put while
 * the body loads over them. A standing or walking jump squats and pushes off
 * both feet (staggered as the stride left them), tucks and lands two-footed.
 * A running leap is the stride itself: it springs off the stride's next toe-off
 * and runs the stride's own flight, stretched over the jump's, so the legs leave
 * and land at the stride's rate, hold a gathered leap between (lead knee up,
 * trailing heel folded), and the lead foot lands as a running strike.
 */

/** A walking and running value, or one walking value whose running share the gait sets. */
export type Paced = number | [ number, number ];

/** A paced value at run weight `run`; a single value is scaled by `runScale` at a full run. */
function paced( value: Paced, run: number, runScale: number ): number {

	return typeof value === 'number' ? value * lerp( 1, runScale, run ) : lerp( value[ 0 ], value[ 1 ], run );

}

/** A robot's build as seen in its gait: lengths in metres, angles in degrees. */
export interface GaitStyle {
	/** step length, walking and running (one full cycle covers two) */
	stride: [ number, number ];
	/** foot lift at mid-swing, walking and running */
	lift: [ number, number ];
	/** run: peak flight height and mid-stance compression (a `runCycle` run takes both from gravity instead) */
	runFlight?: number;
	runCompression?: number;
	/** extra stance crouch at full run */
	runCrouch: number;
	/**
	 * Body motion over the stride (a pair is walking and running; a single value is
	 * the walk, which the run scales itself: sway 0.45, list 0.6, the yaws in full):
	 * the pelvis's shift over the planted leg (m), its yaw with the stepping leg and
	 * its drop on the swing side (deg), and the shoulders' counter-rotation (deg).
	 */
	sway: Paced;
	hipYaw: Paced;
	hipList: Paced;
	shoulders: Paced;
	/** the walk's rise and fall */
	bob: number;
	/** arm swing, walking and running */
	armSwing: [ number, number ];
	/** foot pitch at the heel strike and at toe-off, walking and running */
	heelStrike: [ number, number ];
	toeOff: [ number, number ];
	/** sole: heel and toe edges behind / ahead of the ankle, ankle height above the sole */
	heel: number;
	toe: number;
	ankle: number;
	/** jump: crouch depth at full load, leg tuck at the apex */
	jumpCrouch: number;
	jumpTuck: number;
	/**
	 * Optional carriage for builds whose stand does not suit locomotion (a
	 * racer's wide stance and splayed arms read as a clown's walk): the feet's
	 * track as a share of the rig's stance width, and the shoulders' abduction
	 * as a share of the rig's, walking and running (standing keeps the rig's);
	 * the elbow bend at a full run (deg, default 55); and the upper arms'
	 * inward rotation at a full run (deg), which brings the pumping forearms
	 * forward and across the body instead of out to the sides.
	 */
	track?: [ number, number ];
	armAbduct?: [ number, number ];
	runElbow?: number;
	armCross?: number;
	/** Contact share per cycle; shorter running support accommodates long steps without overreaching. */
	stance?: [ number, number ];
	/** Knee pole's up component, standing and moving. */
	kneePoleUp?: [ number, number ];
	/** Forward lean in degrees per m/s, walking and running. */
	lean?: [ number, number ];
	/** Share of the contact sweep ahead of the hip at the strike, walking and running (default 0.5). */
	reach?: [ number, number ];
	/** Knee flexion (deg) left at the stride's longest reach, walking and running (default 20). */
	kneeFloor?: [ number, number ];
	/** How far the walking pelvis vaults over the stance leg instead of holding the stride's lowest carriage (0..1). */
	vault?: number;
	/**
	 * Swing lift as a window (shares of the swing): fully raised by the first
	 * value, lowering from the second, walking and running. Holding the foot up
	 * through the swing folds the leg under the hip and drives the knee instead
	 * of trailing the foot out behind. Default: one early-peaking hump.
	 */
	liftWindow?: [ [ number, number ], [ number, number ] ];
	/** Share of the swing over which the toe-off pitch relaxes, walking and running (default 0.35). */
	toeRelease?: [ number, number ];
	/** Arms carried forward (deg) against the torso's lean while moving, walking and running. */
	armCarry?: [ number, number ];
	/**
	 * Coordinated run: continuous recovery arc, opposing arms and independent
	 * flight height. Its vertical motion is ballistic: gravity over the flight
	 * time sets the rise, and the stance dip reverses the landing's fall.
	 */
	runCycle?: { recoveryPeak: number };
	/**
	 * Toe-down pitch (deg) that levels a sole whose bottom rakes up toward the
	 * toe in the exported stand. Applied while stepping, so the foot rolls from
	 * the heel edge to the toe edge instead of rocking between them, which drops
	 * the ground-projected body at every toe-off. `ankle` is then the height of
	 * the levelled edges.
	 */
	soleTilt?: number;
	/**
	 * The flat sole's lowest point where it bulges below the heel/toe edge line:
	 * forward of the ankle and depth below the edges (m). A foot rolling off a flat
	 * stand bears on it until an edge takes over; modelled as flat, the switch drops
	 * the ground-projected body by the depth within a frame or two.
	 */
	belly?: [ number, number ];
}

/** A heavy machine: a walk at Froude 0.5 that shifts its weight over the planted leg with pelvis and chest carried as one block, a long-stance run. */
export const HEAVY_GAIT: GaitStyle = {
	stride: [ 2.45, 4.6 ],
	stance: [ 0.58, 0.36 ],
	reach: [ 0.45, 0.5 ],
	kneeFloor: [ 12, 20 ],
	vault: 0.5,
	lift: [ 0.32, 0.7 ],
	runFlight: 0.07,
	runCompression: 0.07,
	runCrouch: 0.12,
	sway: [ 0.07, 0.0315 ],
	bob: 0.035,
	hipYaw: [ 3, 5 ],
	hipList: [ 1.5, 1.8 ],
	shoulders: [ 1.5, 4 ],
	armSwing: [ 18, 38 ],
	heelStrike: [ 20, 5 ],
	toeOff: [ 38, 32 ],
	heel: 0.29,
	toe: 0.62,
	ankle: 0.4,
	belly: [ 0, 0.004 ],
	jumpCrouch: 0.38,
	jumpTuck: 0.42
};

/** Momentum (share of a full run) from which a jump is a one-footed leap. */
const LEAP_MOMENTUM = 0.55;
/**
 * A leap springs off a toe-off of the stride: at least this long on the take-off
 * foot (s), and only from a stride whose support leaves a flight (stance share
 * below 0.5 by this margin).
 */
const LEAP_MIN_LOAD = 0.08;
const LEAP_MIN_FLIGHT = 0.05;
/** The leap's legs in the air: their rate while held (share of the flight's mean), and the gather at the apex. */
const LEAP_HOLD = 0.15;
/** Gather: the lead and trailing feet raised by these shares of `jumpTuck`, drawn in toward the hips by this share. */
const LEAP_GATHER: [ number, number ] = [ 0.5, 0.9 ];
const LEAP_DRAW = 0.3;
/** The leap's landing: sink (share of `jumpCrouch`) taken at the touchdown speed, and the recovery (s). */
const LEAP_LAND_DEPTH = 0.8;
const LEAP_RECOVER = 0.22;
/** Stance share of the cycle, walking and running. */
const STANCE: [ number, number ] = [ 0.6, 0.36 ];
/** Cadence floor near rest; the foot sweep itself still fades to zero. */
const MIN_CADENCE_STRIDE = 0.55;
/** Share of the stance spent rolling off the heel, and where the toe-off starts. */
const HEEL_ROLL = 0.2;
const TOE_ROLL = 0.6;
/** Swing: how early the lift peaks (0 at mid-swing), relaxed toe (rad), how fast the stance velocity fades after lift-off and before the strike. */
const LIFT_SKEW = 0.3;
const SWING_TOE = 0.12;
const TOE_RELEASE = 0.35;
const SWING_TANGENT_FADE = 10;
/** A coordinated run bounds the swing's overshoot past the contact stations to this share of the contact sweep. */
const RUN_SWING_OVERSHOOT = 0.05;
/** Samples of the stride cycle handed to the rig to size the pelvis carriage. */
const STRIDE_SAMPLES = 32;
/** Pelvis sway / list lag behind the leg phase (rad): the weight arrives over the leg after the strike. */
const WEIGHT_LAG = 0.3;
/** Gravity (m/s^2) for a ballistic run, and the longest flight or contact it allows (s): a slowing run's cycle grows without bound. */
const GRAVITY = 9.81;
const MAX_BALLISTIC = 0.3;
/** Arm swing lag behind the legs (rad) and the arms' spring (rad/s, damping ratio). */
const ARM_LAG = 0.25;
const ARM_SPRING = 15;
const ARM_DAMPING = 0.7;
/** Two-footed jump: shoulder swing (deg) per unit of the jump's arm swing. */
const JUMP_ARMS = 38;
/** Lean (deg) per m/s^2 of acceleration, and body bank (deg) per m/s^2 of turning. */
const ACCEL_LEAN = 1.8;
const TURN_BANK = 1.6;
/** Most a turn on the spot drives the stepping (m/s equivalent): quick pivots shuffle, they don't sprint in place. */
const TURN_STEP_MAX = 2.6;
/** Idle weight shift: rate (rad/s), pelvis shift (m), list (deg). */
const IDLE_SHIFT: [ number, number, number ] = [ 0.37, 0.018, 0.7 ];

interface Spring { x: number; v: number }

export class RobotGait {

	phase = 0;
	amp = 0;
	run = 0;
	time = 0;
	events: Side[] = []; // footfalls
	look = 0;
	lean = 0;
	/** the leg a jump with momentum leads with (lands on); null for a two-footed jump */
	jumpLead: Side | null = null;

	private readonly style: GaitStyle;
	private readonly stance: Record<Side, boolean> = { R: true, L: true };
	private accelLean = 0;
	private bank = 0;
	private lastSpeed = 0;
	private travelShare = 0;
	// this frame's swing and contact shape (blended walking to running)
	private reachShare = 0.5;
	private liftRise = 0;
	private liftFall = 0;
	private toeRelease = TOE_RELEASE;
	private tangentFade = SWING_TANGENT_FADE;
	private readonly armSpring: Record<Side, Spring> = { R: { x: 0, v: 0 }, L: { x: 0, v: 0 } };
	private readonly elbowSpring: Record<Side, Spring> = { R: { x: 0, v: 0 }, L: { x: 0, v: 0 } };
	private springsLive = false;
	// a two-footed jump: its own leg pose and the legs at take-off
	private jumping = false;
	private landed = false;
	private sinceLanding = 0;
	private startLegs = false;
	// leap: the stride's own flight stretched over the jump's (phase at take-off, span to the
	// lead foot's strike, the stride's rate as a share of the flight's mean), then the landing sink
	private leaping = false;
	private leapLive = false;
	private leapFrom = 0;
	private leapSpan = 0;
	private leapRate = 1;
	private landClock = - 1;
	private landSpeed = 0;
	// last frame's support share and stride rate (cycles/s), for timing a leap
	private stanceShare = 0.6;
	private strideRate = 0;
	private lead: Side = 'R';
	private readonly jumpLegs: Record<Side, GaitLeg> = { R: { step: 0, up: 0, pitch: 0 }, L: { step: 0, up: 0, pitch: 0 } };
	private readonly takeoff: Record<Side, GaitLeg> = { R: { step: 0, up: 0, pitch: 0 }, L: { step: 0, up: 0, pitch: 0 } };
	private readonly stridePath: GaitLeg[] = Array.from( { length: STRIDE_SAMPLES }, () => ( { step: 0, up: 0, pitch: 0 } ) );

	constructor( style: GaitStyle = HEAVY_GAIT ) {

		this.style = style;

	}

	update( dt: number, speed: number, turnRate: number, running: boolean, active: boolean, jump: JumpPose | null = null ): GaitPose {

		const st = this.style;
		this.time += dt;
		const mv = active ? Math.abs( speed ) : 0;
		// turning on the spot steps too, but a fast pivot doesn't make the feet flail
		const eff = active ? Math.max( mv, Math.min( Math.abs( turnRate ) * 1.4, TURN_STEP_MAX ) ) : 0;
		this.amp = lerp( this.amp, clamp( eff / 2.6, 0, 1 ), 1 - Math.exp( - dt * 5 ) );
		this.run = lerp( this.run, running && mv > 4 ? 1 : 0, 1 - Math.exp( - dt * 3 ) );

		const jumpWeight = jump?.weight ?? 0;
		const inJump = !! jump && ( jumpWeight > 0 || jump.airborne || jump.landing );
		const locomotion = 1 - jumpWeight;
		const dir = speed < - 0.05 ? - 1 : 1;

		const stride = lerp( st.stride[ 0 ], st.stride[ 1 ], this.run ) * this.amp;
		const cadenceStride = Math.max( stride, MIN_CADENCE_STRIDE );
		const contact = st.stance ?? STANCE;
		const stanceFrac = lerp( contact[ 0 ], contact[ 1 ], this.run );
		const strideRate = eff / ( 2 * cadenceStride );
		if ( jump && inJump && ! this.jumping ) {

			this.jumping = true;
			this.landed = false;
			this.startLegs = true;
			this.leaping = this.canLeap( jump.momentum, stanceFrac );
			this.leapLive = false;

		}
		if ( this.leaping && jump?.airborne ) {

			// a leap runs the stride's own flight, stretched over the jump's
			if ( ! this.leapLive ) this.takeOff( stanceFrac, strideRate, jump.airTime, dir );
			this.phase = this.leapFrom + this.leapSpan * leapWarp( jump.flight, this.leapRate );

		} else if ( stride > 0.02 && ! jump?.airborne ) this.phase += dir * strideRate * TAU * dt;
		// a two-footed jump freezes the stride in the air; on the ground (loading, recovering) it keeps pace with the body
		this.stanceShare = stanceFrac;
		this.strideRate = strideRate;

		// stance sweep: what the body travels while the foot is down
		// Blend translation into a pivot/stop without snapping an extended foot to its station.
		this.travelShare = lerp( this.travelShare, eff > 0 ? mv / eff : 0, 1 - Math.exp( - dt * 10 ) );
		const sweep = 2 * stanceFrac * stride * this.travelShare;
		const lift = lerp( st.lift[ 0 ], st.lift[ 1 ], this.run ) * this.amp;
		const strike = lerp( st.heelStrike[ 0 ], st.heelStrike[ 1 ], this.run ) * RAD * this.amp;
		const toeOff = lerp( st.toeOff[ 0 ], st.toeOff[ 1 ], this.run ) * RAD * this.amp;
		this.reachShare = st.reach ? lerp( st.reach[ 0 ], st.reach[ 1 ], this.run ) : 0.5;
		if ( st.liftWindow ) {

			this.liftRise = lerp( st.liftWindow[ 0 ][ 0 ], st.liftWindow[ 1 ][ 0 ], this.run );
			this.liftFall = lerp( st.liftWindow[ 0 ][ 1 ], st.liftWindow[ 1 ][ 1 ], this.run );

		}
		this.toeRelease = st.toeRelease ? lerp( st.toeRelease[ 0 ], st.toeRelease[ 1 ], this.run ) : TOE_RELEASE;
		// A short support hands the swing a fast ground speed to match; carried by the
		// fixed fade it flings the foot low and far past its strike, which pins the
		// whole run's carriage down. The overshoot peaks near m / (e (N + 1)).
		const tangent = ( 1 - stanceFrac ) / stanceFrac;
		this.tangentFade = st.runCycle ? Math.max( SWING_TANGENT_FADE, tangent / ( Math.E * RUN_SWING_OVERSHOOT ) - 1 ) : SWING_TANGENT_FADE;

		const legs = {} as Record<Side, GaitLeg>;
		for ( const S of SIDES ) {

			const f = this.cycle( S );
			const leg = this.legAt( f, stanceFrac, sweep, lift, strike, toeOff, { step: 0, up: 0, pitch: 0 } );
			leg.step *= dir;
			leg.pitch *= dir;
			legs[ S ] = leg;
			const stance = f < stanceFrac;
			// a leap loads on the stride itself: its strikes still sound (the landing's own is the jump's)
			const recovering = ! jump || ( jump.landing && jumpWeight < 0.5 ) || jumpWeight === 0 || ( this.leaping && ! jump.landing );
			if ( stance && ! this.stance[ S ] && this.amp > 0.2 && recovering && ! jump?.airborne ) this.events.push( S );
			this.stance[ S ] = stance;

		}

		// pelvis: rises over the planted leg (walk) or compresses and floats (run)
		const run = this.run * this.amp;
		let w = ( ( this.phase / TAU ) % 0.5 + 0.5 ) % 0.5;
		if ( ! Number.isFinite( w ) ) w = 0;
		const flight = w >= stanceFrac ? ( w - stanceFrac ) / ( 0.5 - stanceFrac ) : - 1;
		let rise = st.runFlight ?? 0, dip = st.runCompression ?? 0;
		if ( st.runCycle ) {

			// Ballistic: the body leaves the toe rising at g tf / 2, peaks g tf^2 / 8
			// above take-off and lands falling as fast; the stance dip reverses that
			// fall over the contact time, so height and vertical velocity stay continuous.
			const cycleTime = eff > 0 ? 2 * cadenceStride / eff : Infinity;
			const flightShare = Math.max( 0, 0.5 - stanceFrac );
			const tf = flightShare > 0 ? Math.min( flightShare * cycleTime, MAX_BALLISTIC ) : 0;
			const tc = Math.min( stanceFrac * cycleTime, MAX_BALLISTIC );
			rise = GRAVITY * tf * tf / 8;
			dip = GRAVITY * tf * tc / ( 2 * Math.PI );

		}
		let air = flight >= 0 ? 4 * rise * run * flight * ( 1 - flight ) : 0;
		const sink = flight < 0 ? dip * run * Math.sin( Math.PI * w / stanceFrac ) : 0;
		// a coordinated run sinks after the pelvis is sized to the legs' reach, which would level a sink in the crouch
		let compression = st.runCycle ? sink * locomotion : 0;
		let crouch = 0.1 + st.runCrouch * run
			+ st.bob * ( 1 - this.run ) * this.amp * ( 0.5 + 0.5 * Math.cos( 2 * ( this.phase - 0.5 ) ) )
			+ ( st.runCycle ? 0 : sink );

		// weight over the planted leg: shift toward it, drop the swing side; the idle robot shifts its weight slowly
		const weightPhase = Math.sin( this.phase - WEIGHT_LAG ) * this.amp;
		const idle = Math.sin( this.time * IDLE_SHIFT[ 0 ] ) * ( 1 - this.amp );
		const sway = ( - weightPhase * paced( st.sway, this.run, 0.45 ) + idle * IDLE_SHIFT[ 1 ] ) * locomotion;
		const list = ( weightPhase * paced( st.hipList, this.run, 0.6 ) - idle * IDLE_SHIFT[ 2 ] ) * locomotion;

		// lean with speed and into acceleration; bank into turns
		const accel = dt > 0 ? ( speed - this.lastSpeed ) / dt : 0;
		this.lastSpeed = speed;
		this.accelLean = lerp( this.accelLean, active ? clamp( accel * ACCEL_LEAN, - 6, 8 ) : 0, 1 - Math.exp( - dt * 4 ) );
		this.lean = lerp( this.lean, clamp( speed * lerp( st.lean?.[ 0 ] ?? 1.3, st.lean?.[ 1 ] ?? 1.9, this.run ), - 4, 15 ), 1 - Math.exp( - dt * 3 ) );
		this.bank = lerp( this.bank, active ? clamp( speed * turnRate * TURN_BANK, - 9, 9 ) : 0, 1 - Math.exp( - dt * 4 ) );

		// hips yaw with the stepping leg (right hip forward at the right heel strike), shoulders counter-rotate
		const hipYaw = Math.cos( this.phase ) * paced( st.hipYaw, this.run, 1 ) * this.amp * locomotion;
		const shoulderYaw = - Math.cos( this.phase ) * paced( st.shoulders, this.run, 1 ) * this.amp * locomotion;
		const twist = ( shoulderYaw - hipYaw ) / 1.6;

		const carry = st.armCarry ? lerp( st.armCarry[ 0 ], st.armCarry[ 1 ], this.run ) * this.amp : 0;
		const armFrequency = eff / ( 2 * cadenceStride ) * TAU;
		const armResponse = clamp( armFrequency * 2.4, ARM_SPRING, 36 );
		// Compensate the spring's sinusoidal phase delay; support duration must
		// not warp the left and right pumps away from half-cycle opposition.
		const armLead = Math.atan2( 2 * ARM_DAMPING * armResponse * armFrequency, armResponse ** 2 - armFrequency ** 2 );
		const arms = {} as Record<Side, number>, elbow = {} as Record<Side, number>;
		for ( const [ S, off ] of [ [ 'R', 0 ], [ 'L', Math.PI ] ] as const ) {

			// negative shoulder pitch swings forward: the right arm swings back as the right leg reaches forward
			// Follow the actual support/swing timing: a run's toe-off happens well before half-cycle.
			const f = this.cycle( S, this.phase - ARM_LAG );
			const armPhase = f < stanceFrac ? Math.PI * f / stanceFrac : Math.PI + Math.PI * ( f - stanceFrac ) / ( 1 - stanceFrac );
			// Counter the thigh drive, which precedes foot strike: the same-side
			// arm is forward at push-off and back as the recovering knee comes through.
			const pump = st.runCycle ? lerp( Math.cos( armPhase ), Math.cos( this.phase + off + Math.PI / 2 + dir * armLead - ARM_LAG ), this.run ) : Math.cos( armPhase );
			const sw = pump * lerp( st.armSwing[ 0 ], st.armSwing[ 1 ], this.run ) * this.amp;
			arms[ S ] = sw - carry + 1.5 * Math.sin( this.time * 0.9 + off );
			elbow[ S ] = - Math.max( 0, - sw ) * 0.7 - this.run * ( st.runElbow ?? 55 ) * this.amp;

		}

		// idle life: the head scans slowly when standing still
		this.look = lerp( this.look, ( 1 - this.amp ) * Math.sin( this.time * 0.23 ) * 22, 1 - Math.exp( - dt * 1.5 ) );

		let lean = this.lean + this.accelLean;
		if ( jump && inJump ) {

			const m = jump.momentum;
			const hump = Math.sin( Math.PI * jump.flight );
			lean = lerp( lean, lean * lerp( 0.35, 0.9, m ) + jump.crouch * 8 - jump.tuck * 3 * ( 1 - m ) + hump * 4 * m, jumpWeight );
			if ( this.leaping ) {

				// The legs are the stride's (its flight stretched over the jump's); at the
				// apex they gather, the lead knee up and the trailing heel folded. The load
				// and the landing sink act on the pelvis after it is sized to the legs'
				// reach, which would level them in the crouch. The arms run on with the stride.
				this.jumpLead = this.leapLive ? this.lead : null;
				if ( jump.airborne ) {

					for ( const S of SIDES ) {

						const lead = S === this.lead;
						legs[ S ].up += st.jumpTuck * LEAP_GATHER[ lead ? 0 : 1 ] * jump.tuck;
						if ( lead ) legs[ S ].step *= 1 - LEAP_DRAW * jump.tuck;

					}

				}
				if ( ! jump.landing ) compression += jump.crouch * st.jumpCrouch * jumpWeight;
				if ( jump.landed ) {

					this.landClock = 0;
					this.landSpeed = jump.landSpeed;

				}

			} else {

				this.jumpLegsUpdate( dt, speed, jump, legs, stanceFrac );
				crouch = lerp( crouch, 0.1 + jump.crouch * st.jumpCrouch, jumpWeight );
				for ( const S of SIDES ) {

					legs[ S ].step = lerp( legs[ S ].step, this.jumpLegs[ S ].step, jumpWeight );
					legs[ S ].up = lerp( legs[ S ].up, this.jumpLegs[ S ].up, jumpWeight );
					legs[ S ].pitch = lerp( legs[ S ].pitch, this.jumpLegs[ S ].pitch, jumpWeight );
					// both arms swing back, then forward and up
					arms[ S ] = lerp( arms[ S ], - JUMP_ARMS * jump.armSwing, jumpWeight );
					const standElbow = - 32 * Math.max( jump.crouch * 0.4, jump.armSwing, jump.tuck * 0.8 );
					elbow[ S ] = lerp( elbow[ S ], standElbow, jumpWeight );

				}

			}
			air = lerp( air, jump.air, jumpWeight );
			if ( ! jump.airborne && ! jump.landing && jumpWeight === 0 ) this.jumping = false;

		} else this.jumping = false;
		if ( ! this.jumping ) this.leaping = false;
		if ( ! inJump ) this.jumpLead = null;
		if ( this.landClock >= 0 ) {

			// the lead leg takes the fall at the touchdown speed (a quarter sine that starts
			// at that speed), then hands the weight back to the stride
			const depth = st.jumpCrouch * LEAP_LAND_DEPTH;
			const impact = Math.PI * depth / ( 2 * Math.max( this.landSpeed, 0.1 ) );
			const t = this.landClock;
			compression += depth * ( t < impact ? Math.sin( 0.5 * Math.PI * t / impact ) : 0.5 + 0.5 * Math.cos( Math.PI * Math.min( 1, ( t - impact ) / LEAP_RECOVER ) ) );
			this.landClock = t + dt < impact + LEAP_RECOVER ? t + dt : - 1;

		}

		// Keep spring lag bounded as cadence rises, so the arms stay opposite the legs.
		this.follow( arms, elbow, dt, armResponse );

		const roll = list + this.bank;
		// a leap keeps the stride's carriage and track; a two-footed jump takes the legs over
		const carried = this.leaping ? 1 : locomotion;
		const moving = this.amp * carried;
		const tilt = ( st.soleTilt ?? 0 ) * RAD * this.amp;
		legs.R.pitch += tilt;
		legs.L.pitch += tilt;
		const cross = ( st.armCross ?? 0 ) * lerp( 0.35, 1, this.run ) * moving;
		// the whole cycle's foot path, fading out as a two-footed jump takes over the legs
		for ( let i = 0; i < STRIDE_SAMPLES; i ++ ) {

			const leg = this.legAt( i / STRIDE_SAMPLES, stanceFrac, sweep, lift, strike, toeOff, this.stridePath[ i ] );
			leg.step *= dir * carried;
			leg.up *= carried;

		}
		return {
			// the body owns its height in a run's flight and a leap's (recovering feet must not pull it down)
			freeFlight: Math.max( st.runCycle ? run * locomotion : 0, this.leaping ? jumpWeight : 0 ),
			compression,
			// gaits that move the body with their own channels: a coordinated run, a vaulting walk
			steadyCarriage: st.runCycle ? 1 : ( st.vault ?? 0 ) * ( 1 - this.run ),
			minKnee: ( st.kneeFloor ? lerp( st.kneeFloor[ 0 ], st.kneeFloor[ 1 ], this.run ) : 20 ) * moving,
			stridePath: this.stridePath,
			strideCycle: this.cycle( 'R' ),
			vault: ( st.vault ?? 0 ) * ( 1 - this.run ) * moving,
			kneePoleUp: st.kneePoleUp ? lerp( st.kneePoleUp[ 0 ], st.kneePoleUp[ 1 ], moving ) : undefined,
			track: st.track ? lerp( 1, lerp( st.track[ 0 ], st.track[ 1 ], this.run ), moving ) : 1,
			abduct: st.armAbduct ? lerp( 1, lerp( st.armAbduct[ 0 ], st.armAbduct[ 1 ], this.run ), moving ) : 1,
			armTwist: { R: cross, L: cross },
			legs, crouch, sway, arms, elbow, air,
			lean,
			roll,
			yaw: hipYaw,
			torsoRoll: - list * 0.85,
			twist,
			breath: Math.sin( this.time * 1.3 ) * 0.8,
			headYaw: ( this.look + clamp( THREE.MathUtils.radToDeg( turnRate ) * 0.12, - 18, 18 ) ) * locomotion - shoulderYaw * 0.85,
			headPitch: lerp( Math.sin( this.time * 0.41 ) * 2 - this.accelLean * 0.3, - lean * 0.35, jumpWeight ),
			headRoll: - this.bank * 0.5,
			curl: 0.45 + this.run * 0.5
		};

	}

	/** A leg's place in the cycle (0..1): the right leg leads, the left is half a cycle behind. */
	private cycle( side: Side, phase = this.phase ): number {

		let f = ( ( phase + ( side === 'L' ? Math.PI : 0 ) ) / TAU ) % 1;
		if ( f < 0 ) f += 1;
		return Number.isFinite( f ) ? f : 0;

	}

	/**
	 * The leg at cycle fraction f: in stance its sole sweeps `sweep` back
	 * (heel strike, flat, toe-off), in swing it is carried forward.
	 */
	private legAt( f: number, stance: number, sweep: number, lift: number, strike: number, toeOff: number, out: GaitLeg ): GaitLeg {

		let base: number, up = 0, heel: number, toe: number, relax = 0;
		if ( f < stance ) {

			const t = f / stance;
			base = sweep / 2 - t * sweep;
			heel = strike * ( 1 - ramp( 0, HEEL_ROLL, t ) );
			toe = toeOff * ramp( TOE_ROLL, 1, t );

		} else {

			const t = ( f - stance ) / ( 1 - stance );
			// Match the stance velocity at both ends, with zero vertical velocity at contact.
			// The tangent terms fade quickly, limiting overshoot past the contact stations.
			const m = - sweep * ( 1 - stance ) / stance;
			base = sweep * ( smooth( t ) - 0.5 ) + m * ( t * ( 1 - t ) ** this.tangentFade + ( t - 1 ) * t ** this.tangentFade );
			if ( this.style.liftWindow ) up = lift * ramp( 0, this.liftRise, t ) * ( 1 - ramp( this.liftFall, 1, t ) );
			else {

				const clearance = Math.sin( Math.PI * ( t + LIFT_SKEW * t * ( 1 - t ) ) );
				up = lift * clearance * clearance;

			}
			if ( this.style.runCycle ) {

				// A single rounded recovery, not a high shelf followed by a late
				// vertical drop. Zero endpoint velocity preserves the ground contact.
				const peak = this.style.runCycle.recoveryPeak;
				const a = t < peak ? t / peak : ( 1 - t ) / ( 1 - peak );
				const arc = 0.5 - 0.5 * Math.cos( Math.PI * a );
				up = lerp( up, lift * arc, this.run );

			}
			toe = toeOff * ( 1 - ramp( 0, this.toeRelease, t ) );
			heel = strike * ramp( 0.6, 1, t );
			const toeRelax = Math.sin( Math.PI * t );
			relax = SWING_TOE * toeRelax * toeRelax * this.amp;

		}
		// the whole path shifts back so the foot lands `reachShare` of the sweep ahead of the hip
		base += ( this.reachShare - 0.5 ) * sweep;
		const st = this.style;
		// rolling about the heel (toe up) and the toe (heel up) moves the ankle along an arc about that edge
		const step = base
			+ st.heel * ( Math.cos( heel ) - 1 ) - st.ankle * Math.sin( heel )
			+ st.toe * ( 1 - Math.cos( toe ) ) + st.ankle * Math.sin( toe );
		up += st.heel * Math.sin( heel ) + st.ankle * ( Math.cos( heel ) - 1 )
			+ st.toe * Math.sin( toe ) + st.ankle * ( Math.cos( toe ) - 1 );
		const pitch = toe - heel;
		if ( st.belly && pitch !== 0 ) {

			// the ankle stands on whichever of the edges and the belly reaches lowest (flat: the belly, the station)
			const [ b, depth ] = st.belly;
			const edges = Math.max( st.toe * Math.sin( pitch ), - st.heel * Math.sin( pitch ) ) + st.ankle * Math.cos( pitch );
			const bulge = b * Math.sin( pitch ) + ( st.ankle + depth ) * Math.cos( pitch );
			up += Math.max( 0, bulge - edges ) - depth;

		}
		out.step = step;
		out.up = up;
		out.pitch = toe - heel + relax;
		return out;

	}

	/**
	 * Seconds until the stride's next toe-off a running leap can spring from (at
	 * least `LEAP_MIN_LOAD` on that foot), or null when the jump is two-footed:
	 * too slow, or a stride whose support leaves no flight. The jump times its
	 * take-off with it (`RobotJump.start`).
	 */
	leapTakeoff( momentum: number ): number | null {

		if ( ! this.canLeap( momentum, this.stanceShare ) || this.strideRate <= 0 ) return null;
		let soonest = Infinity;
		for ( const S of SIDES ) {

			// cycles until this leg leaves the ground
			let until = ( ( this.stanceShare - this.cycle( S ) ) % 1 + 1 ) % 1;
			if ( until / this.strideRate < LEAP_MIN_LOAD ) until += 1;
			soonest = Math.min( soonest, until / this.strideRate );

		}
		return soonest;

	}

	private canLeap( momentum: number, stanceFrac: number ): boolean {

		return momentum > LEAP_MOMENTUM && this.amp > 0.2 && stanceFrac < 0.5 - LEAP_MIN_FLIGHT;

	}

	/**
	 * The leap leaves the ground: the leg nearest its toe-off takes off, the other
	 * lands. The flight runs the stride on to that leg's strike (half a cycle after
	 * the take-off leg's strike) over the jump's air time, leaving and landing at
	 * the stride's own rate.
	 */
	private takeOff( stanceFrac: number, strideRate: number, airTime: number, dir: number ): void {

		let past = Infinity;
		for ( const S of SIDES ) {

			// how far past its toe-off, wrapped to half a cycle either way
			const d = ( ( this.cycle( S ) - stanceFrac + 0.5 ) % 1 + 1 ) % 1 - 0.5;
			if ( Math.abs( d ) < Math.abs( past ) ) {

				past = d;
				this.lead = S === 'R' ? 'L' : 'R';

			}

		}
		const span = Math.max( 0.5 - stanceFrac - past, 0.05 );
		this.leapFrom = this.phase;
		this.leapSpan = dir * TAU * span;
		this.leapRate = strideRate * airTime / span;
		this.leapLive = true;

	}

	/**
	 * A two-footed jump's own leg pose, from the locomotion legs `legs` of this
	 * frame: planted feet stay where they are on the ground while the body moves
	 * over them and push off their toes, the legs tuck in the air and reach for a
	 * landing side by side.
	 */
	private jumpLegsUpdate( dt: number, speed: number, jump: JumpPose, legs: Record<Side, GaitLeg>, stanceFrac: number ): void {

		const J = this.jumpLegs;
		if ( this.startLegs ) {

			this.startLegs = false;
			// lead with the leg in the air, or the one further back (about to swing)
			const swingR = ! this.stance.R, swingL = ! this.stance.L;
			this.lead = swingR !== swingL ? ( swingR ? 'R' : 'L' ) : ( legs.R.step < legs.L.step ? 'R' : 'L' );
			for ( const S of SIDES ) Object.assign( J[ S ], legs[ S ] );

		}
		this.jumpLead = null;

		if ( ! jump.airborne && ! jump.landing ) {

			// the stride carries on under the load, and the feet push off their toes
			const push = jump.push * lerp( 0.3, 0.5, jump.momentum );
			for ( const S of SIDES ) {

				const leg = J[ S ];
				Object.assign( leg, legs[ S ] );
				const toe = Math.max( 0, push - leg.pitch );
				leg.up += this.style.toe * Math.sin( toe ) + this.style.ankle * ( Math.cos( toe ) - 1 );
				leg.pitch += toe;
				Object.assign( this.takeoff[ S ], leg );

			}
			return;

		}

		if ( jump.airborne ) {

			const f = jump.flight;
			const toMid = ramp( 0, 0.4, f );
			const toLand = ramp( 0.55, 0.95, f );
			const t = jump.tuck;
			for ( const S of SIDES ) {

				// the tuck (the lead foot a little ahead), then both feet side by side for the landing
				const lead = S === this.lead;
				const from = this.takeoff[ S ];
				const leg = J[ S ];
				leg.step = lerp( lerp( from.step, ( lead ? 0.28 : - 0.12 ) * t, toMid ), 0, toLand );
				leg.up = lerp( lerp( from.up, this.style.jumpTuck * t, toMid ), 0, toLand );
				leg.pitch = lerp( lerp( from.pitch, 0.15 * t, toMid ), 0, toLand );

			}
			return;

		}

		// on the ground again: pick the stride up with the feet side by side, planted
		if ( ! this.landed ) {

			this.landed = true;
			this.sinceLanding = 0;
			this.phase = TAU * stanceFrac * 0.5 * ( 1 - jump.momentum ) + ( this.lead === 'L' ? Math.PI : 0 );
			for ( const S of SIDES ) Object.assign( J[ S ], ZERO_LEG );
			return;

		}
		this.sinceLanding += dt;
		for ( const S of SIDES ) J[ S ].step -= speed * dt;

	}

	/** Arms and elbows follow their targets on damped springs (sub-stepped, frame-rate independent). */
	private follow( arms: Record<Side, number>, elbow: Record<Side, number>, dt: number, response: number ): void {

		if ( ! this.springsLive ) {

			for ( const S of SIDES ) {

				this.armSpring[ S ].x = arms[ S ];
				this.elbowSpring[ S ].x = elbow[ S ];

			}
			this.springsLive = true;

		}
		const steps = Math.max( 1, Math.ceil( dt * 240 ) );
		const h = dt / steps;
		const k = response * response, c = 2 * ARM_DAMPING * response;
		for ( const S of SIDES ) {

			for ( const [ s, target ] of [ [ this.armSpring[ S ], arms[ S ] ], [ this.elbowSpring[ S ], elbow[ S ] ] ] as const ) {

				for ( let i = 0; i < steps; i ++ ) {

					s.v += ( k * ( target - s.x ) - c * s.v ) * h;
					s.x += s.v * h;

				}

			}
			arms[ S ] = this.armSpring[ S ].x;
			elbow[ S ] = this.elbowSpring[ S ].x;

		}

	}

}

const ZERO_LEG: GaitLeg = { step: 0, up: 0, pitch: 0 };

/**
 * The leap's progress through the stride's flight (0..1) at progress `u` through
 * the jump's: it leaves and lands at `rate` (the stride's own rate as a share of
 * the mean), slows into a hold at `LEAP_HOLD` of the mean in between, and is
 * C1 throughout. The rate eases over `tau` at each end: `hold + (rate - hold) (1 - u / tau)^2`,
 * with `tau` set so the whole comes to 1. A stride slower than the flight needs
 * (rate below 3 - 2 hold) eases over half the flight and holds faster instead.
 */
function leapWarp( u: number, rate: number ): number {

	let hold = LEAP_HOLD, tau = 1.5 * ( 1 - hold ) / ( rate - hold );
	if ( ! ( tau <= 0.5 && tau > 0 ) ) {

		tau = 0.5;
		hold = ( 3 - rate ) / 2;

	}
	const v = clamp( u, 0, 1 );
	return v <= 0.5 ? leapEase( v, rate, hold, tau ) : 1 - leapEase( 1 - v, rate, hold, tau );

}

/** The first half of `leapWarp`: the rate's integral from the start. */
function leapEase( x: number, rate: number, hold: number, tau: number ): number {

	return hold * x + ( rate - hold ) * tau / 3 * ( 1 - ( 1 - Math.min( x, tau ) / tau ) ** 3 );

}
