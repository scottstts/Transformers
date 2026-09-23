import * as THREE from 'three/webgpu';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = ( t ) => t * t * ( 3 - 2 * t );

/**
 * Procedural gait. Produces foot targets (step forward / lift, metres) for
 * the leg IK plus body channels in degrees: lean, twist, arm swing, elbow,
 * head. Heavy-machine feel: long stance, weight shift over the planted leg,
 * counter-rotating torso.
 */
export class CybertruckGait {
	phase = 0;
	amp = 0;
	run = 0;
	time = 0;
	events: Array<'R' | 'L'> = [];
	private _stance = { R: true, L: true };
	look = 0;
	lean = 0;

	constructor() {

		this.phase = 0;
		this.amp = 0;
		this.run = 0;
		this.time = 0;
		this.events = []; // footfalls: 'R' | 'L'
		this._stance = { R: true, L: true };
		this.look = 0;
		this.lean = 0;

	}

	update( dt, speed, turnRate, running, active ) {

		this.time += dt;
		const mv = active ? Math.abs( speed ) : 0;
		const eff = active ? Math.max( mv, Math.abs( turnRate ) * 1.4 ) : 0;
		this.amp = lerp( this.amp, clamp( eff / 2.6, 0, 1 ), 1 - Math.exp( - dt * 5 ) );
		this.run = lerp( this.run, running && mv > 4 ? 1 : 0, 1 - Math.exp( - dt * 3 ) );

		const stride = lerp( 1.35, 2.3, this.run ) * this.amp;
		const dir = speed < - 0.05 ? - 1 : 1;
		if ( stride > 0.02 ) this.phase += dir * ( eff / ( 2 * Math.max( stride, 0.55 ) ) ) * TAU * dt;

		const lift = lerp( 0.32, 0.55, this.run ) * this.amp;
		const stanceFrac = lerp( 0.6, 0.44, this.run );
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
			if ( stance && ! this._stance[ S ] && this.amp > 0.2 ) this.events.push( S );
			this._stance[ S ] = stance;
			legs[ S ] = { step: z * dir, up: y, pitch: pitch * dir, toe };

		}

		// pelvis drops at double support, rises over the planted leg
		const crouch = 0.1 + 0.12 * this.run * this.amp + ( 0.03 + 0.05 * this.run ) * this.amp * ( 0.5 + 0.5 * Math.cos( 2 * this.phase ) );
		const sway = Math.sin( this.phase ) * 0.06 * this.amp;
		this.lean = lerp( this.lean, clamp( speed * 1.3, - 4, 10 ), 1 - Math.exp( - dt * 3 ) );

		const arms: Record<'R' | 'L', number> = {} as Record<'R' | 'L', number>, elbow: Record<'R' | 'L', number> = {} as Record<'R' | 'L', number>;
		for ( const [ S, off ] of [ [ 'R', Math.PI ], [ 'L', 0 ] ] as const ) {

			const sw = - Math.cos( this.phase + off ) * lerp( 16, 30, this.run ) * this.amp;
			arms[ S ] = sw + 1.5 * Math.sin( this.time * 0.9 + off );
			elbow[ S ] = - Math.max( 0, - sw ) * 0.7 - this.run * 40 * this.amp;

		}

		// idle life: the head scans slowly when standing still
		this.look = lerp( this.look, ( 1 - this.amp ) * Math.sin( this.time * 0.23 ) * 22, 1 - Math.exp( - dt * 1.5 ) );

		return {
			legs, crouch, sway, arms, elbow,
			lean: this.lean,
			roll: - Math.sin( this.phase ) * 2.2 * this.amp,
			twist: - Math.sin( this.phase ) * 6 * this.amp,
			breath: Math.sin( this.time * 1.3 ) * 0.8,
			headYaw: this.look + THREE.MathUtils.radToDeg( turnRate ) * 0.12,
			headPitch: Math.sin( this.time * 0.41 ) * 2,
			curl: 0.45 + this.run * 0.5
		};

	}

}
