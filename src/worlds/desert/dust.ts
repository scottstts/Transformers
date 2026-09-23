import * as THREE from 'three/webgpu';
import {
	instancedDynamicBufferAttribute, uv, vec3, float, color, mix, smoothstep, mx_fractal_noise_float, clamp
} from 'three/tsl';

/**
 * Kicked-up desert dirt: soft, noisy, slowly expanding billboards.
 * CPU-simulated (a few thousand particles) and drawn as one instanced sprite.
 */
const MAX = 3000;

export class Dust {
	pos: Float32Array;
	vel: Float32Array;
	age: Float32Array;
	life: Float32Array;
	s0: Float32Array;
	s1: Float32Array;
	a0: Float32Array;
	spin: Float32Array;
	cursor = 0;
	aPos: THREE.InstancedBufferAttribute;
	aData: THREE.InstancedBufferAttribute;
	mesh: THREE.Sprite;
	wind: THREE.Vector3;

	constructor( scene ) {

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

		const m = new THREE.SpriteNodeMaterial( { transparent: true, depthWrite: false } );
		m.positionNode = p;
		m.scaleNode = d.x;
		m.rotationNode = d.w;

		// soft billow: radial falloff broken up by 3D noise (seeded per particle)
		const q = uv().sub( 0.5 ).mul( 2.0 );
		const r = q.length();
		const n = mx_fractal_noise_float( vec3( q.mul( 1.6 ), d.z.mul( 17.0 ) ), 4, 2.0, 0.55 ).mul( 0.5 ).add( 0.5 );
		const shape = float( 1.0 ).sub( smoothstep( 0.15, 1.0, r.add( n.sub( 0.5 ).mul( 0.55 ) ) ) );
		const dens = clamp( shape.mul( n.mul( 1.1 ).add( 0.25 ) ), 0.0, 1.0 );

		// fake lighting: sunlit top, shadowed underside
		const lit = mix( color( 0x8f7a63 ), color( 0xe6d6c0 ), smoothstep( 0.0, 1.0, uv().y.add( n.sub( 0.5 ).mul( 0.6 ) ) ) );
		m.colorNode = lit;
		m.opacityNode = dens.mul( d.y );

		this.mesh = new THREE.Sprite( m );
		this.mesh.count = MAX;
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 2;
		scene.add( this.mesh );

		this.wind = new THREE.Vector3( 0.7, 0, 0.25 );

	}

	emit( x, y, z, vx, vy, vz, { size = 0.5, grow = 2.5, life = 2.5, alpha = 0.25 } = {} ) {

		const i = this.cursor;
		this.cursor = ( this.cursor + 1 ) % MAX;
		this.pos.set( [ x, y, z ], i * 3 );
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

	/** tyre spray: continuous, scaled by speed and wheel slip */
	wheel( p, fwd, speed, slip, dt ) {

		const v = Math.abs( speed );
		const rate = Math.max( 0, v - 1.2 ) * 3.2 + slip * 60;
		let n = rate * dt;
		const intensity = Math.min( 1, v / 18 + slip );
		while ( n > 0 ) {

			if ( n < 1 && Math.random() > n ) break;
			n -= 1;
			const back = - Math.sign( speed ) * ( 0.15 + Math.random() * 0.25 ) * v;
			this.emit(
				p.x + ( Math.random() - 0.5 ) * 0.4, 0.2 + Math.random() * 0.2, p.z + ( Math.random() - 0.5 ) * 0.4,
				fwd.x * back + ( Math.random() - 0.5 ) * 2.0, 0.4 + Math.random() * 1.4 * intensity, fwd.z * back + ( Math.random() - 0.5 ) * 2.0,
				{ size: 0.45 + v * 0.01, grow: 2.0 + v * 0.09, life: 2.2 + v * 0.05, alpha: 0.12 + 0.2 * intensity }
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

	update( dt ) {

		const P = this.pos, V = this.vel, D = this.aData.array, O = this.aPos.array;
		const drag = Math.exp( - 1.8 * dt );
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
			const y = Math.max( P[ j + 1 ], size * 0.32 );
			O[ j ] = P[ j ]; O[ j + 1 ] = y; O[ j + 2 ] = P[ j + 2 ];
			D[ k ] = size;
			D[ k + 1 ] = this.a0[ i ] * Math.min( 1, t * 8 ) * Math.pow( 1 - t, 1.6 );
			D[ k + 3 ] += this.spin[ i ] * dt;

		}

		this.aPos.needsUpdate = true;
		this.aData.needsUpdate = true;

	}

}
