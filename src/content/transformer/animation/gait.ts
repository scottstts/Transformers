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
 * Jumps (see game/jump.ts) take over the pose by the jump's weight. A
 * The stride carries on through the take-off, so feet on the ground stay put
 * while the body loads over them. A standing or walking jump squats and
 * pushes off both feet (staggered as the stride left them), tucks and lands
 * two-footed. From a run the take-off is short: the free leg drives its knee
 * up, the body leaps off the planted foot's toe, scissors through the air and
 * lands on the lead foot straight into the stride.
 */

/** A robot's build as seen in its gait: lengths in metres, angles in degrees. */
export interface GaitStyle {
	/** step length, walking and running (one full cycle covers two) */
	stride: [ number, number ];
	/** foot lift at mid-swing, walking and running */
	lift: [ number, number ];
	/** run: peak flight height and mid-stance compression */
	runFlight: number;
	runCompression: number;
	/** extra stance crouch at full run */
	runCrouch: number;
	/** pelvis shift over the planted leg, and the walk's rise and fall */
	sway: number;
	bob: number;
	/** pelvis yaw with the stepping leg, and its drop on the swing side */
	hipYaw: number;
	hipList: number;
	/** shoulder counter-rotation */
	shoulders: number;
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
}

/** A heavy machine: long stance, weight shift over the planted leg. */
export const HEAVY_GAIT: GaitStyle = {
	stride: [ 2.025, 4.6 ],
	lift: [ 0.32, 0.7 ],
	runFlight: 0.07,
	runCompression: 0.07,
	runCrouch: 0.12,
	sway: 0.07,
	bob: 0.035,
	hipYaw: 5,
	hipList: 3,
	shoulders: 4,
	armSwing: [ 18, 38 ],
	heelStrike: [ 12, 5 ],
	toeOff: [ 26, 32 ],
	heel: 0.31,
	toe: 0.62,
	ankle: 0.4,
	jumpCrouch: 0.38,
	jumpTuck: 0.42
};

/** Momentum (share of a full run) from which a jump is a one-footed leap. */
const LEAP_MOMENTUM = 0.55;
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
/** Samples of the stride cycle handed to the rig to size the pelvis carriage. */
const STRIDE_SAMPLES = 16;
/** Pelvis sway / list lag behind the leg phase (rad): the weight arrives over the leg after the strike. */
const WEIGHT_LAG = 0.3;
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
	private readonly armSpring: Record<Side, Spring> = { R: { x: 0, v: 0 }, L: { x: 0, v: 0 } };
	private readonly elbowSpring: Record<Side, Spring> = { R: { x: 0, v: 0 }, L: { x: 0, v: 0 } };
	private springsLive = false;
	// jump: its own leg pose, the legs at take-off, which legs are planted
	private jumping = false;
	private landed = false;
	private sinceLanding = 0;
	private lead: Side = 'R';
	private readonly jumpLegs: Record<Side, GaitLeg> = { R: { step: 0, up: 0, pitch: 0 }, L: { step: 0, up: 0, pitch: 0 } };
	private readonly takeoff: Record<Side, GaitLeg> = { R: { step: 0, up: 0, pitch: 0 }, L: { step: 0, up: 0, pitch: 0 } };
	private readonly planted: Record<Side, boolean> = { R: true, L: true };
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
		// the stride freezes in the air; on the ground (loading, recovering) it keeps pace with the body
		if ( stride > 0.02 && ! jump?.airborne ) this.phase += dir * ( eff / ( 2 * cadenceStride ) ) * TAU * dt;

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

		const legs = {} as Record<Side, GaitLeg>;
		for ( const S of SIDES ) {

			const f = this.cycle( S );
			const leg = this.legAt( f, stanceFrac, sweep, lift, strike, toeOff, { step: 0, up: 0, pitch: 0 } );
			leg.step *= dir;
			leg.pitch *= dir;
			legs[ S ] = leg;
			const stance = f < stanceFrac;
			const recovering = ! jump || ( jump.landing && jumpWeight < 0.5 ) || jumpWeight === 0;
			if ( stance && ! this.stance[ S ] && this.amp > 0.2 && recovering && ! jump?.airborne ) this.events.push( S );
			this.stance[ S ] = stance;

		}

		// pelvis: rises over the planted leg (walk) or compresses and floats (run)
		const run = this.run * this.amp;
		let w = ( ( this.phase / TAU ) % 0.5 + 0.5 ) % 0.5;
		if ( ! Number.isFinite( w ) ) w = 0;
		const flight = w >= stanceFrac ? ( w - stanceFrac ) / ( 0.5 - stanceFrac ) : - 1;
		let air = flight >= 0 ? 4 * st.runFlight * run * flight * ( 1 - flight ) : 0;
		let crouch = 0.1 + st.runCrouch * run
			+ st.bob * ( 1 - this.run ) * this.amp * ( 0.5 + 0.5 * Math.cos( 2 * ( this.phase - 0.5 ) ) )
			+ ( flight < 0 ? st.runCompression * run * Math.sin( Math.PI * w / stanceFrac ) : 0 );

		// weight over the planted leg: shift toward it, drop the swing side; the idle robot shifts its weight slowly
		const weightPhase = Math.sin( this.phase - WEIGHT_LAG ) * this.amp;
		const idle = Math.sin( this.time * IDLE_SHIFT[ 0 ] ) * ( 1 - this.amp );
		const sway = ( - weightPhase * st.sway * lerp( 1, 0.45, this.run ) + idle * IDLE_SHIFT[ 1 ] ) * locomotion;
		const list = ( weightPhase * st.hipList * lerp( 1, 0.6, this.run ) - idle * IDLE_SHIFT[ 2 ] ) * locomotion;

		// lean with speed and into acceleration; bank into turns
		const accel = dt > 0 ? ( speed - this.lastSpeed ) / dt : 0;
		this.lastSpeed = speed;
		this.accelLean = lerp( this.accelLean, active ? clamp( accel * ACCEL_LEAN, - 6, 8 ) : 0, 1 - Math.exp( - dt * 4 ) );
		this.lean = lerp( this.lean, clamp( speed * lerp( st.lean?.[ 0 ] ?? 1.3, st.lean?.[ 1 ] ?? 1.9, this.run ), - 4, 15 ), 1 - Math.exp( - dt * 3 ) );
		this.bank = lerp( this.bank, active ? clamp( speed * turnRate * TURN_BANK, - 9, 9 ) : 0, 1 - Math.exp( - dt * 4 ) );

		// hips yaw with the stepping leg (right hip forward at the right heel strike), shoulders counter-rotate
		const hipYaw = Math.cos( this.phase ) * st.hipYaw * this.amp * locomotion;
		const shoulderYaw = - Math.cos( this.phase ) * st.shoulders * this.amp * locomotion;
		const twist = ( shoulderYaw - hipYaw ) / 1.6;

		const carry = st.armCarry ? lerp( st.armCarry[ 0 ], st.armCarry[ 1 ], this.run ) * this.amp : 0;
		const arms = {} as Record<Side, number>, elbow = {} as Record<Side, number>;
		for ( const [ S, off ] of [ [ 'R', 0 ], [ 'L', Math.PI ] ] as const ) {

			// negative shoulder pitch swings forward: the right arm swings back as the right leg reaches forward
			// Follow the actual support/swing timing: a run's toe-off happens well before half-cycle.
			const f = this.cycle( S, this.phase - ARM_LAG );
			const armPhase = f < stanceFrac ? Math.PI * f / stanceFrac : Math.PI + Math.PI * ( f - stanceFrac ) / ( 1 - stanceFrac );
			const sw = Math.cos( armPhase ) * lerp( st.armSwing[ 0 ], st.armSwing[ 1 ], this.run ) * this.amp;
			arms[ S ] = sw - carry + 1.5 * Math.sin( this.time * 0.9 + off );
			elbow[ S ] = - Math.max( 0, - sw ) * 0.7 - this.run * ( st.runElbow ?? 55 ) * this.amp;

		}

		// idle life: the head scans slowly when standing still
		this.look = lerp( this.look, ( 1 - this.amp ) * Math.sin( this.time * 0.23 ) * 22, 1 - Math.exp( - dt * 1.5 ) );

		let lean = this.lean + this.accelLean;
		if ( jump && inJump ) {

			const m = jump.momentum;
			this.jumpLegsUpdate( dt, speed, jump, legs, stanceFrac, lift );
			crouch = lerp( crouch, 0.1 + jump.crouch * st.jumpCrouch, jumpWeight );
			const leap = this.jumpLead ? m : 0;
			const hump = Math.sin( Math.PI * jump.flight );
			lean = lerp( lean, lean * lerp( 0.35, 0.9, m ) + jump.crouch * 8 - jump.tuck * 3 * ( 1 - m ) + hump * 4 * m, jumpWeight );
			for ( const S of SIDES ) {

				legs[ S ].step = lerp( legs[ S ].step, this.jumpLegs[ S ].step, jumpWeight );
				legs[ S ].up = lerp( legs[ S ].up, this.jumpLegs[ S ].up, jumpWeight );
				legs[ S ].pitch = lerp( legs[ S ].pitch, this.jumpLegs[ S ].pitch, jumpWeight );
				// standing: both arms swing back, then forward and up; leaping: the arm opposite the lead leg drives forward
				const lead = S === this.lead;
				const leapArm = lead ? 12 + 16 * Math.max( 0, jump.armSwing ) : - ( 18 + 22 * Math.max( 0, jump.armSwing ) );
				arms[ S ] = lerp( arms[ S ], lerp( - JUMP_ARMS * jump.armSwing, leapArm, leap ), jumpWeight );
				const standElbow = - 32 * Math.max( jump.crouch * 0.4, jump.armSwing, jump.tuck * 0.8 );
				elbow[ S ] = lerp( elbow[ S ], lerp( standElbow, - 50, leap ), jumpWeight );

			}
			air = lerp( air, jump.air, jumpWeight );
			if ( ! jump.airborne && ! jump.landing && jumpWeight === 0 ) this.jumping = false;

		} else this.jumping = false;
		if ( ! inJump ) this.jumpLead = null;

		// Keep spring lag bounded as cadence rises, so the arms stay opposite the legs.
		const armResponse = clamp( eff / ( 2 * cadenceStride ) * TAU * 2.4, ARM_SPRING, 36 );
		this.follow( arms, elbow, dt, armResponse );

		const roll = list + this.bank;
		const moving = this.amp * locomotion;
		const cross = ( st.armCross ?? 0 ) * lerp( 0.35, 1, this.run ) * moving;
		// the whole cycle's foot path, fading out as a jump takes over the legs
		for ( let i = 0; i < STRIDE_SAMPLES; i ++ ) {

			const leg = this.legAt( i / STRIDE_SAMPLES, stanceFrac, sweep, lift, strike, toeOff, this.stridePath[ i ] );
			leg.step *= dir * locomotion;
			leg.up *= locomotion;

		}
		return {
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
	 * The leg at cycle fraction f: in stance its sole sweeps \`sweep\` back
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
			base = sweep * ( smooth( t ) - 0.5 ) + m * ( t * ( 1 - t ) ** SWING_TANGENT_FADE + ( t - 1 ) * t ** SWING_TANGENT_FADE );
			if ( this.style.liftWindow ) up = lift * ramp( 0, this.liftRise, t ) * ( 1 - ramp( this.liftFall, 1, t ) );
			else {

				const clearance = Math.sin( Math.PI * ( t + LIFT_SKEW * t * ( 1 - t ) ) );
				up = lift * clearance * clearance;

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
		out.step = step;
		out.up = up;
		out.pitch = toe - heel + relax;
		return out;

	}

	/**
	 * The jump's own leg pose, from the locomotion legs \`legs\` of this frame:
	 * planted feet stay where they are on the ground while the body moves over
	 * them, the free leg drives to its take-off place, the legs tuck (standing)
	 * or scissor (leaping) in the air and reach for the landing, which for a
	 * leap is the stride itself at the lead foot's heel strike.
	 */
	private jumpLegsUpdate( dt: number, speed: number, jump: JumpPose, legs: Record<Side, GaitLeg>, stanceFrac: number, lift: number ): void {

		const st = this.style;
		const m = jump.momentum;
		const J = this.jumpLegs;
		const leaping = m > LEAP_MOMENTUM && this.amp > 0.2;
		if ( ! this.jumping ) {

			this.jumping = true;
			this.landed = false;
			// lead with the leg in the air, or the one further back (about to swing)
			const swingR = ! this.stance.R, swingL = ! this.stance.L;
			this.lead = swingR !== swingL ? ( swingR ? 'R' : 'L' ) : ( legs.R.step < legs.L.step ? 'R' : 'L' );
			for ( const S of SIDES ) Object.assign( J[ S ], legs[ S ] );

		}
		this.jumpLead = leaping ? this.lead : null;
		const runStride = st.stride[ 1 ];

		if ( ! jump.airborne && ! jump.landing ) {

			// the stride carries on under the load; a leap drives the lead knee up, and the
			// feet push off their toes (both for a two-footed jump, the take-off foot for a leap)
			const k = smooth( clamp( ( jump.weight + jump.push ) / 2, 0, 1 ) );
			const push = jump.push * lerp( 0.3, 0.5, m );
			for ( const S of SIDES ) {

				const leg = J[ S ];
				Object.assign( leg, legs[ S ] );
				if ( leaping && S === this.lead ) leg.up = lerp( leg.up, Math.max( leg.up, st.jumpTuck * 0.7 ), k );
				else {

					const toe = Math.max( 0, push - leg.pitch );
					leg.up += st.toe * Math.sin( toe ) + st.ankle * ( Math.cos( toe ) - 1 );
					leg.pitch += toe;

				}
				Object.assign( this.takeoff[ S ], leg );

			}
			return;

		}

		// the landing: for a leap, the stride at the lead foot's strike; standing, two feet side by side
		const landF = stanceFrac * 0.5 * ( 1 - m );
		const landPhase = TAU * landF + ( this.lead === 'L' ? Math.PI : 0 );
		const landSweep = 2 * stanceFrac * Math.max( lerp( st.stride[ 0 ], st.stride[ 1 ], this.run ), MIN_CADENCE_STRIDE );
		const strike = lerp( st.heelStrike[ 0 ], st.heelStrike[ 1 ], this.run ) * RAD;
		const toeOff = lerp( st.toeOff[ 0 ], st.toeOff[ 1 ], this.run ) * RAD;

		if ( jump.airborne ) {

			const f = jump.flight;
			const toMid = ramp( 0, 0.4, f );
			const toLand = ramp( 0.55, 0.95, f );
			for ( const S of SIDES ) {

				const lead = S === this.lead;
				const t = jump.tuck;
				// standing tuck (the lead foot a little ahead), leaping scissor
				const tuck = { step: ( lead ? 0.28 : - 0.12 ) * t, up: st.jumpTuck * t, pitch: 0.15 * t };
				const scissor = lead
					? { step: 0.3 * runStride, up: st.jumpTuck * 0.8, pitch: - 0.1 }
					: { step: - 0.3 * runStride, up: st.jumpTuck * 0.55, pitch: 0.35 };
				const mid = leaping ? mixLeg( tuck, scissor, m ) : tuck;
				const land = this.landingLeg( S, leaping ? m : 0, landPhase, stanceFrac, landSweep, lift, strike, toeOff );
				const from = this.takeoff[ S ];
				const leg = J[ S ];
				// the tuck is timed by the jump itself; a leap reaches its scissor early
				leg.step = lerp( lerp( from.step, mid.step, toMid ), land.step, toLand );
				leg.up = lerp( lerp( from.up, mid.up, toMid ), land.up, toLand );
				leg.pitch = lerp( lerp( from.pitch, mid.pitch, toMid ), land.pitch, toLand );

			}
			return;

		}

		// on the ground again: pick the stride up where the landing put the feet, planted feet hold the ground
		if ( ! this.landed ) {

			this.landed = true;
			this.sinceLanding = 0;
			this.phase = landPhase;
			for ( const S of SIDES ) {

				Object.assign( J[ S ], this.landingLeg( S, leaping ? m : 0, landPhase, stanceFrac, landSweep, lift, strike, toeOff ) );
				this.planted[ S ] = J[ S ].up < 0.03;

			}
			return;

		}
		// a foot still in the air (the trailing leg of a leap) swings on into the stride
		this.sinceLanding += dt;
		const into = ramp( 0, 0.18, this.sinceLanding );
		for ( const S of SIDES ) {

			const leg = J[ S ];
			if ( this.planted[ S ] ) {

				leg.step -= speed * dt;
				continue;

			}
			const from = this.landingLeg( S, leaping ? m : 0, this.phase, stanceFrac, landSweep, lift, strike, toeOff );
			leg.step = lerp( from.step, legs[ S ].step, into );
			leg.up = lerp( from.up, legs[ S ].up, into );
			leg.pitch = lerp( from.pitch, legs[ S ].pitch, into );

		}

	}

	/** Where a leg lands: side by side (m = 0) blended toward the stride at the landing phase (a leap). */
	private landingLeg( side: Side, m: number, phase: number, stanceFrac: number, sweep: number, lift: number, strike: number, toeOff: number ): GaitLeg {

		const stride = this.legAt( this.cycle( side, phase ), stanceFrac, sweep, lift, strike, toeOff, { step: 0, up: 0, pitch: 0 } );
		return { step: stride.step * m, up: stride.up * m, pitch: stride.pitch * m };

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

function mixLeg( a: GaitLeg, b: GaitLeg, t: number ): GaitLeg {

	return { step: lerp( a.step, b.step, t ), up: lerp( a.up, b.up, t ), pitch: lerp( a.pitch, b.pitch, t ) };

}
