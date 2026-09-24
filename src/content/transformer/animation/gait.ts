import * as THREE from 'three/webgpu';
import type { GaitPose } from '../model/rig.ts';
import type { JumpPose } from '../../../game/jump.ts';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = ( t ) => t * t * ( 3 - 2 * t );

/**
 * Procedural gait. Produces foot targets (step forward / lift, metres) for
 * the leg IK plus body channels in degrees: lean, twist, arm swing, elbow,
 * head. Heavy-machine feel: long stance, weight shift over the planted leg,
 * counter-rotating torso.
 *
 * Running is a true run, not a fast walk: stance shortens below half the
 * cycle so both feet leave the ground between steps, the body compresses at
 * mid-stance and floats through the flight, knees lift higher, the torso leans
 * into the run and the arms pump with bent elbows. A jump (see game/jump.ts)
 * overrides the legs with a load / tuck / reach sequence and freezes the cycle
 * in the air.
 */

/** A robot's build as seen in its gait: lengths in metres, swings in degrees. */
export interface GaitStyle {
	/** stride length, walking and running */
	stride: [ number, number ];
	/** foot lift at mid-swing, walking and running */
	lift: [ number, number ];
	/** run: peak flight height and mid-stance compression */
	runFlight: number;
	runCompression: number;
	/** extra stance crouch at full run */
	runCrouch: number;
	/** pelvis sway at full stride */
	sway: number;
	/** arm swing, walking and running */
	armSwing: [ number, number ];
	/** jump: crouch depth at full load, leg tuck at the apex */
	jumpCrouch: number;
	jumpTuck: number;
}

/** A heavy machine: long stance, weight shift over the planted leg. */
export const HEAVY_GAIT: GaitStyle = {
	stride: [ 1.35, 2.3 ],
	lift: [ 0.32, 0.7 ],
	runFlight: 0.07,
	runCompression: 0.07,
	runCrouch: 0.12,
	sway: 0.06,
	armSwing: [ 16, 38 ],
	jumpCrouch: 0.38,
	jumpTuck: 0.42
};

export class RobotGait {
	phase = 0;
	amp = 0;
	run = 0;
	time = 0;
	events: Array<'R' | 'L'> = [];
	private _stance = { R: true, L: true };
	look = 0;
	lean = 0;

	private readonly style: GaitStyle;

	constructor( style: GaitStyle = HEAVY_GAIT ) {

		this.style = style;
		this.phase = 0;
		this.amp = 0;
		this.run = 0;
		this.time = 0;
		this.events = []; // footfalls: 'R' | 'L'
		this._stance = { R: true, L: true };
		this.look = 0;
		this.lean = 0;

	}

	update( dt: number, speed: number, turnRate: number, running: boolean, active: boolean, jump: JumpPose | null = null ): GaitPose {

		this.time += dt;
		const mv = active ? Math.abs( speed ) : 0;
		const eff = active ? Math.max( mv, Math.abs( turnRate ) * 1.4 ) : 0;
		this.amp = lerp( this.amp, clamp( eff / 2.6, 0, 1 ), 1 - Math.exp( - dt * 5 ) );
		this.run = lerp( this.run, running && mv > 4 ? 1 : 0, 1 - Math.exp( - dt * 3 ) );

		const st = this.style;
		const stride = lerp( st.stride[ 0 ], st.stride[ 1 ], this.run ) * this.amp;
		const dir = speed < - 0.05 ? - 1 : 1;
		const airborne = !! jump?.airborne;
		const jumpWeight = jump?.weight ?? 0;
		const locomotion = 1 - jumpWeight;
		if ( stride > 0.02 && ! airborne ) this.phase += dir * ( eff / ( 2 * Math.max( stride, 0.55 ) ) ) * TAU * dt * locomotion;

		const lift = lerp( st.lift[ 0 ], st.lift[ 1 ], this.run ) * this.amp;
		const stanceFrac = lerp( 0.6, 0.36, this.run );
		const legs: Record<'R' | 'L', { step: number; up: number; pitch: number; toe: number }> = {} as Record<'R' | 'L', { step: number; up: number; pitch: number; toe: number }>;
		for ( const [ S, off ] of [ [ 'R', 0 ], [ 'L', Math.PI ] ] as const ) {

			let f = ( ( this.phase + off ) / TAU ) % 1;
			if ( f < 0 ) f += 1;
			let z, y, pitch, toe = 0;
			if ( f < stanceFrac ) {

				const t = f / stanceFrac;
				z = stride / 2 - t * stride;
				y = 0;
				pitch = 0;
				toe = t > 0.8 ? - ( t - 0.8 ) * 60 * this.amp : 0; // roll onto the toe

			} else {

				const t = ( f - stanceFrac ) / ( 1 - stanceFrac );
				z = - stride / 2 + stride * smooth( t );
				y = lift * Math.sin( Math.PI * t );
				pitch = Math.sin( Math.PI * t ) * 0.3 * this.amp * ( t < 0.45 ? 1 : - 0.8 );

			}

			const stance = f < stanceFrac;
			if ( stance && ! this._stance[ S ] && this.amp > 0.2 && ! airborne && jumpWeight === 0 ) this.events.push( S );
			this._stance[ S ] = stance;
			legs[ S ] = { step: z * dir, up: y, pitch: pitch * dir, toe };

		}

		// walk: the pelvis drops at double support and rises over the planted leg;
		// run: it compresses at mid-stance and floats through the flight between steps
		const run = this.run * this.amp;
		let w = ( ( this.phase / TAU ) % 0.5 + 0.5 ) % 0.5;
		if ( ! Number.isFinite( w ) ) w = 0;
		const flight = w >= stanceFrac ? ( w - stanceFrac ) / ( 0.5 - stanceFrac ) : - 1;
		let air = flight >= 0 ? 4 * st.runFlight * run * flight * ( 1 - flight ) : 0;
		let crouch = 0.1 + st.runCrouch * run
			+ 0.03 * ( 1 - this.run ) * this.amp * ( 0.5 + 0.5 * Math.cos( 2 * this.phase ) )
			+ ( flight < 0 ? st.runCompression * run * Math.sin( Math.PI * w / stanceFrac ) : 0 );
		const sway = Math.sin( this.phase ) * st.sway * this.amp * locomotion;
		this.lean = lerp( this.lean, clamp( speed * lerp( 1.3, 1.9, this.run ), - 4, 15 ), 1 - Math.exp( - dt * 3 ) );

		const arms: Record<'R' | 'L', number> = {} as Record<'R' | 'L', number>, elbow: Record<'R' | 'L', number> = {} as Record<'R' | 'L', number>;
		for ( const [ S, off ] of [ [ 'R', Math.PI ], [ 'L', 0 ] ] as const ) {

			const sw = - Math.cos( this.phase + off ) * lerp( st.armSwing[ 0 ], st.armSwing[ 1 ], this.run ) * this.amp;
			arms[ S ] = sw + 1.5 * Math.sin( this.time * 0.9 + off );
			elbow[ S ] = - Math.max( 0, - sw ) * 0.7 - this.run * 55 * this.amp;

		}

		// idle life: the head scans slowly when standing still
		this.look = lerp( this.look, ( 1 - this.amp ) * Math.sin( this.time * 0.23 ) * 22, 1 - Math.exp( - dt * 1.5 ) );

		let lean = this.lean;
		if ( jump && jumpWeight > 0 ) {

			// The jump owns the whole pose through touchdown; tuck is not a blend
			// weight, otherwise the frozen stride reappears as the feet extend.
			crouch = lerp( crouch, 0.1 + jump.crouch * st.jumpCrouch, jumpWeight );
			lean = lerp( lean, this.lean * 0.35 + jump.crouch * 8 - jump.tuck * 3, jumpWeight );
			const t = jump.tuck;
			for ( const [ S, lead ] of [ [ 'R', 0.28 ], [ 'L', - 0.12 ] ] as const ) {

				const leg = legs[ S ];
				leg.step = lerp( leg.step, lead * t, jumpWeight );
				leg.up = lerp( leg.up, st.jumpTuck * t, jumpWeight );
				leg.pitch = lerp( leg.pitch, 0.15 * t, jumpWeight );
				leg.toe = lerp( leg.toe, 0, jumpWeight );
				// In the authoring frame negative shoulder pitch swings forward.
				arms[ S ] = lerp( arms[ S ], - 32 * jump.armSwing, jumpWeight );
				elbow[ S ] = lerp( elbow[ S ], - 32 * Math.max( jump.crouch * 0.4, jump.armSwing, t * 0.8 ), jumpWeight );

			}
			air = lerp( air, jump.air, jumpWeight );

		}

		return {
			legs, crouch, sway, arms, elbow, air,
			lean,
			roll: - Math.sin( this.phase ) * 2.2 * this.amp * locomotion,
			twist: - Math.sin( this.phase ) * 6 * this.amp * locomotion,
			breath: Math.sin( this.time * 1.3 ) * 0.8,
			headYaw: ( this.look + THREE.MathUtils.radToDeg( turnRate ) * 0.12 ) * locomotion,
			headPitch: lerp( Math.sin( this.time * 0.41 ) * 2, - lean * 0.35, jumpWeight ),
			curl: 0.45 + this.run * 0.5
		};

	}

}
