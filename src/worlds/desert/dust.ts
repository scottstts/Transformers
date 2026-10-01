import * as THREE from 'three/webgpu';
import {
	instancedDynamicBufferAttribute, uv, vec2, float, color, mix, smoothstep, clamp, varying
} from 'three/tsl';
import type { Ground } from '../../game/ground.ts';
import { N } from '../../rendering/noise.ts';
import { aerial } from './atmosphere.ts';

/**
 * Kicked-up desert dirt: soft, noisy, slowly expanding billboards.
 * CPU-simulated (a few thousand particles) and drawn as one instanced sprite.
 */
const MAX = 3000;
/** roost puffs per second per m/s of tread slide, per tyre */
const ROOST_RATE = 7;
/**
 * Opacity below which a fading puff is retired early (about 1.5/255 over
 * sand of nearly its own colour: no visible change). A puff is at its
 * largest as it fades, so its last tenth of life is a fifth of its fill.
 */
const FADED = 0.006;
/**
 * How much dust the air may hold: the live puffs' opacity times their area
 * (m^2), summed. Past it new puffs are thinned (kept with the share squared
 * that the ceiling is of the fill), so nothing, however many sources pile up
 * (a crowd's blows, a gun's shells, the stamping feet), turns the air into a
 * sandstorm, and the dust's overdraw stays bounded. Only the fight's dust
 * (bursts, surges, jet blasts) is thinned; a car's tyres never are. A special's blast into
 * clear air is never thinned: the fill is the last frame's. A walk holds
 * about 170, a drift about 330, a special's surge peaks near 3500 and clears;
 * a heavy fight on the sand holds here, on concrete it stays near 160.
 */
const FILL_CEILING = 650;

export class Dust {
	pos: Float32Array;
	vel: Float32Array;
	age: Float32Array;
	life: Float32Array;
	s0: Float32Array;
	s1: Float32Array;
	a0: Float32Array;
	spin: Float32Array;
	/** the ground's height under each puff's birth: its centre stays above it */
	floor: Float32Array;
	ground: Ground;
	cursor = 0;
	aPos: THREE.InstancedBufferAttribute;
	aData: THREE.InstancedBufferAttribute;
	mesh: THREE.Sprite;
	wind: THREE.Vector3;
	/** the air's dust after the last update (see FILL_CEILING) */
	fill = 0;
	/** the share of new puffs kept now */
	private keep = 1;

	constructor( scene, ground: Ground ) {

		this.ground = ground;
		this.floor = new Float32Array( MAX );

		this.pos = new Float32Array( MAX * 3 );
		this.vel = new Float32Array( MAX * 3 );
		this.age = new Float32Array( MAX ).fill( 1e9 );
		this.life = new Float32Array( MAX ).fill( 1 );
		this.s0 = new Float32Array( MAX );
		this.s1 = new Float32Array( MAX );
		this.a0 = new Float32Array( MAX );
		this.spin = new Float32Array( MAX );
		this.cursor = 0;

		this.aPos = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 3 ), 3 );
		this.aData = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 4 ), 4 ); // size, alpha, seed, rot
		this.aPos.setUsage( THREE.DynamicDrawUsage );
		this.aData.setUsage( THREE.DynamicDrawUsage );

		const p = instancedDynamicBufferAttribute( this.aPos, 'vec3' );
		const d = instancedDynamicBufferAttribute( this.aData, 'vec4' ) as any;

		// the scene's fog would run the aerial perspective for every one of the
		// overlapping transparent fragments (two fifths of the dust's fill cost);
		// the air hardly changes across a puff, so it is taken once, at its centre
		const m = new THREE.SpriteNodeMaterial( { transparent: true, depthWrite: false, fog: false } );
		m.positionNode = p;
		m.scaleNode = d.x;
		m.rotationNode = d.w;

		// Reuse the desert's mipmapped noise texture instead of evaluating four
		// octaves of 3D noise for every transparent dust fragment.
		const q = uv().sub( 0.5 ).mul( 2.0 );
		const r = q.length();
		const noise = N( uv().mul( 0.55 ).add( vec2( d.z.mul( 13.7 ), d.z.mul( 29.3 ) ) ) ).toVar();
		const n = noise.r.mul( 0.75 ).add( noise.a.mul( 0.25 ) );
		const shape = float( 1.0 ).sub( smoothstep( 0.15, 1.0, r.add( n.sub( 0.5 ).mul( 0.55 ) ) ) );
		const dens = clamp( shape.mul( n.mul( 1.1 ).add( 0.25 ) ), 0.0, 1.0 );

		// fake lighting: sunlit top, shadowed underside
		const lit = mix( color( 0x8f7a63 ), color( 0xe6d6c0 ), smoothstep( 0.0, 1.0, uv().y.add( n.sub( 0.5 ).mul( 0.6 ) ) ) );
		const alpha = dens.mul( d.y );
		const air = varying( aerial( p as THREE.Node<'vec3'> ), 'vDustAir' );
		// as the fog node would: the puff's light dimmed by the air, the air's light added over its cover
		m.colorNode = lit.mul( air.a ).add( air.rgb.mul( alpha ) );
		m.opacityNode = alpha;

		this.mesh = new THREE.Sprite( m );
		this.mesh.count = MAX;
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 2;
		scene.add( this.mesh );

		this.wind = new THREE.Vector3( 0.7, 0, 0.25 );

	}

	/** A puff at (x, z), `y` m above the ground there; `governed` (the fight's dust) is thinned past FILL_CEILING, a car's tyres never are. */
	emit( x, y, z, vx, vy, vz, { size = 0.5, grow = 2.5, life = 2.5, alpha = 0.25 } = {}, governed = true ) {

		if ( governed && this.keep < 1 && Math.random() > this.keep ) return;
		const i = this.cursor;
		this.cursor = ( this.cursor + 1 ) % MAX;
		const floor = this.ground.height( x, z );
		this.floor[ i ] = floor;
		this.pos.set( [ x, floor + y, z ], i * 3 );
		this.vel.set( [ vx, vy, vz ], i * 3 );
		this.age[ i ] = 0;
		this.life[ i ] = life * ( 0.75 + Math.random() * 0.5 );
		this.s0[ i ] = size * ( 0.7 + Math.random() * 0.6 );
		this.s1[ i ] = this.s0[ i ] + grow * ( 0.7 + Math.random() * 0.6 );
		this.a0[ i ] = alpha;
		this.spin[ i ] = ( Math.random() - 0.5 ) * 0.6;
		this.aData.array[ i * 4 + 2 ] = Math.random();
		this.aData.array[ i * 4 + 3 ] = Math.random() * 6.28;

	}

	/**
	 * Tyre dust, continuous: a rolling tyre lifts a trail behind it with speed;
	 * a sliding tread (drift, wheelspin, lock) throws a roost of sand the way
	 * it slides over the ground, which billows into a heavy cloud. `velocity`
	 * is the contact's ground velocity, `slide` the tread's slide (m/s).
	 */
	wheel( p: THREE.Vector3, velocity: THREE.Vector3, slide: THREE.Vector3, dt: number ) {

		const v = Math.hypot( velocity.x, velocity.z );
		const s = Math.hypot( slide.x, slide.z );
		const intensity = Math.min( 1, v / 18 + s / 6 );
		let n = Math.max( 0, v - 1.2 ) * 3.2 * dt;
		while ( n > 0 ) {

			if ( n < 1 && Math.random() > n ) break;
			n -= 1;
			const back = - ( 0.15 + Math.random() * 0.25 );
			this.emit(
				p.x + ( Math.random() - 0.5 ) * 0.4, 0.2 + Math.random() * 0.2, p.z + ( Math.random() - 0.5 ) * 0.4,
				velocity.x * back + ( Math.random() - 0.5 ) * 2.0, 0.4 + Math.random() * 1.4 * intensity, velocity.z * back + ( Math.random() - 0.5 ) * 2.0,
				{ size: 0.45 + v * 0.01, grow: 2.0 + v * 0.09, life: 2.2 + v * 0.05, alpha: 0.12 + 0.2 * intensity }, false
			);

		}

		if ( s < 0.8 ) return;
		const sx = slide.x / s, sz = slide.z / s;
		n = Math.min( s, 16 ) * ROOST_RATE * dt;
		while ( n > 0 ) {

			if ( n < 1 && Math.random() > n ) break;
			n -= 1;
			const throwSpeed = s * ( 0.35 + Math.random() * 0.5 );
			const carry = 0.2 + Math.random() * 0.25;
			this.emit(
				p.x + sx * 0.25 + ( Math.random() - 0.5 ) * 0.5, 0.15 + Math.random() * 0.25, p.z + sz * 0.25 + ( Math.random() - 0.5 ) * 0.5,
				sx * throwSpeed + velocity.x * carry + ( Math.random() - 0.5 ) * 2.4,
				0.8 + Math.random() * ( 1.2 + s * 0.14 ),
				sz * throwSpeed + velocity.z * carry + ( Math.random() - 0.5 ) * 2.4,
				{ size: 0.55 + s * 0.035, grow: 3.0 + s * 0.28, life: 2.6 + s * 0.09, alpha: 0.16 + 0.16 * Math.min( 1, s / 8 ) }, false
			);

		}

	}

	/** footfall / impact: a low radial ring of dirt */
	burst( p, strength = 1, count = 28 ) {

		for ( let i = 0; i < count; i ++ ) {

			const a = Math.random() * Math.PI * 2;
			const sp = ( 1.2 + Math.random() * 2.6 ) * strength;
			this.emit(
				p.x + Math.cos( a ) * 0.5, 0.15 + Math.random() * 0.15, p.z + Math.sin( a ) * 0.5,
				Math.cos( a ) * sp, 0.25 + Math.random() * 0.9 * strength, Math.sin( a ) * sp,
				{ size: 0.5, grow: 2.2 + strength * 1.5, life: 1.8 + strength, alpha: 0.2 + 0.1 * strength }
			);

		}

	}

	/**
	 * A blast's base surge: a wall of sand rolling out along the ground from a
	 * ring of `radius` around `p`, and a column of it thrown up the middle
	 * (`strength` 1: a full special's blast).
	 */
	surge( p: THREE.Vector3, radius: number, strength: number ) {

		// a weaker surge (a shell, a slam) is not only fewer puffs but smaller, fainter and shorter lived: at
		// a full special's strength (1) it is the wall of sand it was, below it the cloud falls away fast
		const s = Math.min( 1.5, strength );
		const small = Math.min( 1, s );
		const ring = Math.round( 260 * strength );
		for ( let i = 0; i < ring; i ++ ) {

			const a = Math.random() * Math.PI * 2;
			const r = radius * ( 0.3 + Math.random() * 0.7 );
			const sp = ( 14 + Math.random() * 18 ) * strength;
			this.emit(
				p.x + Math.cos( a ) * r, 0.3 + Math.random() * 0.8, p.z + Math.sin( a ) * r,
				Math.cos( a ) * sp, 0.6 + Math.random() * 3.2 * strength, Math.sin( a ) * sp,
				{ size: 1.4, grow: 3 + 5.5 * s, life: 2 + 5 * s, alpha: ( 0.3 + 0.12 * s ) * small }
			);

		}
		const column = Math.round( 110 * strength );
		for ( let i = 0; i < column; i ++ ) {

			const a = Math.random() * Math.PI * 2;
			const r = Math.random() * radius * 0.5;
			const up = ( 6 + Math.random() * 22 ) * strength;
			this.emit(
				p.x + Math.cos( a ) * r, 0.5 + Math.random() * 1.5, p.z + Math.sin( a ) * r,
				Math.cos( a ) * 2.5 * strength, up, Math.sin( a ) * 2.5 * strength,
				{ size: 1.6, grow: 3 + 6 * s, life: 2.5 + 5.5 * s, alpha: ( 0.26 + 0.1 * s ) * small }
			);

		}

	}

	/** jet blast: sand driven radially out along the ground from `p` (continuous, scaled by strength 0..1) */
	blast( p, strength, dt ) {

		let n = strength * 150 * dt;
		while ( n > 0 ) {

			if ( n < 1 && Math.random() > n ) break;
			n -= 1;
			const a = Math.random() * Math.PI * 2;
			const r = 0.3 + Math.random() * 0.6;
			const sp = ( 6 + Math.random() * 9 ) * ( 0.4 + 0.6 * strength );
			this.emit(
				p.x + Math.cos( a ) * r, 0.08 + Math.random() * 0.2, p.z + Math.sin( a ) * r,
				Math.cos( a ) * sp, 0.3 + Math.random() * 1.6 * strength, Math.sin( a ) * sp,
				{ size: 0.35, grow: 2.6 + strength * 2.2, life: 1.6 + strength * 1.4, alpha: 0.12 + 0.16 * strength }
			);

		}

	}

	update( dt ) {

		const P = this.pos, V = this.vel, D = this.aData.array, O = this.aPos.array;
		const drag = Math.exp( - 1.8 * dt );
		let fill = 0;
		for ( let i = 0; i < MAX; i ++ ) {

			const age = ( this.age[ i ] += dt );
			const t = age / this.life[ i ];
			const j = i * 3, k = i * 4;
			if ( t >= 1 ) {

				D[ k ] = 0;
				D[ k + 1 ] = 0;
				continue;

			}

			V[ j ] = V[ j ] * drag + this.wind.x * ( 1 - drag );
			V[ j + 1 ] = V[ j + 1 ] * drag + ( 0.12 - 0.25 * ( 1 - t ) ) * dt;
			V[ j + 2 ] = V[ j + 2 ] * drag + this.wind.z * ( 1 - drag );
			P[ j ] += V[ j ] * dt;
			P[ j + 1 ] += V[ j + 1 ] * dt;
			P[ j + 2 ] += V[ j + 2 ] * dt;

			const size = this.s0[ i ] + ( this.s1[ i ] - this.s0[ i ] ) * ( 1 - Math.pow( 1 - t, 2.2 ) );
			// keep the billboard centre above the ground so it doesn't slice into it
			const y = Math.max( P[ j + 1 ], this.floor[ i ] + size * 0.32 );
			O[ j ] = P[ j ]; O[ j + 1 ] = y; O[ j + 2 ] = P[ j + 2 ];
			const alpha = this.a0[ i ] * Math.min( 1, t * 8 ) * Math.pow( 1 - t, 1.6 );
			if ( t > 0.5 && alpha < FADED ) {

				this.age[ i ] = 1e9;
				D[ k ] = 0;
				D[ k + 1 ] = 0;
				continue;

			}
			D[ k ] = size;
			D[ k + 1 ] = alpha;
			fill += alpha * size * size;
			D[ k + 3 ] += this.spin[ i ] * dt;

		}

		this.fill = fill;
		this.keep = fill > FILL_CEILING ? ( FILL_CEILING / fill ) ** 2 : 1;
		this.aPos.needsUpdate = true;
		this.aData.needsUpdate = true;

	}

}
