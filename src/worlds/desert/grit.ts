import * as THREE from 'three/webgpu';
import { instancedDynamicBufferAttribute, uv, float, mix, color, smoothstep, hash } from 'three/tsl';

/**
 * Grit thrown by a sliding tyre: clods of crust and small stones flung
 * ballistically out of the roost, falling back within a second or so. Tiny
 * opaque sprites (alpha-tested, so they need no sorting and write depth),
 * CPU-simulated in a ring and drawn in one instanced call. Buffers upload
 * only while something is in the air.
 */
const MAX = 1200;
/** clods per second per m/s of tread slide, per tyre */
const RATE = 9;
const GRAVITY = 9.81;
/** air drag on a clod (1/s) */
const DRAG = 0.35;

export class Grit {

	private readonly pos = new Float32Array( MAX * 3 );
	private readonly vel = new Float32Array( MAX * 3 );
	private readonly alive = new Uint8Array( MAX );
	private readonly aPos: THREE.InstancedBufferAttribute;
	private readonly aSize: THREE.InstancedBufferAttribute;
	private readonly mesh: THREE.Sprite;
	private cursor = 0;
	private count = 0;

	constructor( scene: THREE.Scene ) {

		this.aPos = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 3 ), 3 );
		this.aSize = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 2 ), 2 ); // size (0 = dead), seed
		this.aPos.setUsage( THREE.DynamicDrawUsage );
		this.aSize.setUsage( THREE.DynamicDrawUsage );

		const p = instancedDynamicBufferAttribute( this.aPos, 'vec3' );
		const d = instancedDynamicBufferAttribute( this.aSize, 'vec2' ) as any;
		const m = new THREE.SpriteNodeMaterial( { alphaTest: 0.5 } );
		m.positionNode = p;
		m.scaleNode = d.x;
		m.rotationNode = d.y.mul( 6.283 );

		// an irregular clod: a lumpy disc, sunlit on top and shaded beneath (unlit, like the dust),
		// crust or darker stone by seed
		const q = uv().sub( 0.5 ).mul( 2 );
		const lump = hash( d.y.mul( 91.7 ).add( q.x.mul( 2.3 ).floor() ).add( q.y.mul( 2.3 ).floor().mul( 7.1 ) ) ).mul( 0.25 );
		m.opacityNode = float( 1 ).sub( smoothstep( 0.62, 0.8, q.length().add( lump ) ) );
		const tone = mix( color( 0xc9ae8a ), color( 0x8a7560 ), hash( d.y.mul( 17.3 ) ).pow( 3 ) );
		m.colorNode = tone.mul( mix( float( 0.5 ), float( 1.05 ), smoothstep( - 0.8, 0.8, q.y ) ) );

		this.mesh = new THREE.Sprite( m );
		this.mesh.count = MAX;
		this.mesh.frustumCulled = false;
		scene.add( this.mesh );

	}

	/** A tyre whose tread slides at `slide` (world, m/s) over contact `p` moving at `velocity`: flings clods along the slide. */
	spray( p: THREE.Vector3, velocity: THREE.Vector3, slide: THREE.Vector3, dt: number ): void {

		const s = Math.hypot( slide.x, slide.z );
		if ( s < 1.5 ) return;
		const sx = slide.x / s, sz = slide.z / s;
		let n = Math.min( s, 16 ) * RATE * dt;
		while ( n > 0 ) {

			if ( n < 1 && Math.random() > n ) break;
			n -= 1;
			const i = this.cursor;
			this.cursor = ( this.cursor + 1 ) % MAX;
			if ( ! this.alive[ i ] ) this.count ++;
			this.alive[ i ] = 1;
			const speed = s * ( 0.5 + Math.random() * 0.8 );
			const spread = ( Math.random() - 0.5 ) * 0.9;
			const j = i * 3;
			this.pos[ j ] = p.x + sx * 0.2 + ( Math.random() - 0.5 ) * 0.3;
			this.pos[ j + 1 ] = 0.05 + Math.random() * 0.12;
			this.pos[ j + 2 ] = p.z + sz * 0.2 + ( Math.random() - 0.5 ) * 0.3;
			this.vel[ j ] = ( sx - sz * spread ) * speed + velocity.x * 0.3;
			this.vel[ j + 1 ] = 1.2 + Math.random() * ( 1.5 + s * 0.25 );
			this.vel[ j + 2 ] = ( sz + sx * spread ) * speed + velocity.z * 0.3;
			const size = this.aSize.array as Float32Array;
			size[ i * 2 ] = 0.025 + Math.pow( Math.random(), 3 ) * 0.07;
			size[ i * 2 + 1 ] = Math.random();

		}

	}

	/**
	 * A blast's grit: `count` clods thrown from `center` at up to `speed` m/s,
	 * in a cone about `dir` (`spread` 0 a jet along it, 1 every way above the ground).
	 */
	burst( center: THREE.Vector3, speed: number, count: number, dir: THREE.Vector3, spread: number ): void {

		const size = this.aSize.array as Float32Array;
		for ( let n = 0; n < count; n ++ ) {

			const i = this.cursor;
			this.cursor = ( this.cursor + 1 ) % MAX;
			if ( ! this.alive[ i ] ) this.count ++;
			this.alive[ i ] = 1;
			// a direction in the cone, kept above the horizon
			let x = dir.x * ( 1 - spread ) + ( Math.random() * 2 - 1 ) * spread;
			let y = dir.y * ( 1 - spread ) + Math.random() * spread;
			let z = dir.z * ( 1 - spread ) + ( Math.random() * 2 - 1 ) * spread;
			const l = Math.hypot( x, y, z ) || 1;
			x /= l; y /= l; z /= l;
			const v = speed * ( 0.3 + 0.7 * Math.random() );
			const j = i * 3;
			this.pos[ j ] = center.x + ( Math.random() - 0.5 ) * 0.8;
			this.pos[ j + 1 ] = 0.1 + Math.random() * 0.2;
			this.pos[ j + 2 ] = center.z + ( Math.random() - 0.5 ) * 0.8;
			this.vel[ j ] = x * v;
			this.vel[ j + 1 ] = Math.abs( y ) * v + 1;
			this.vel[ j + 2 ] = z * v;
			size[ i * 2 ] = 0.03 + Math.pow( Math.random(), 3 ) * 0.1;
			size[ i * 2 + 1 ] = Math.random();

		}

	}

	update( dt: number ): void {

		// nothing in the air: the last upload already cleared the final clods
		if ( this.count === 0 ) return;
		const P = this.pos, V = this.vel, O = this.aPos.array as Float32Array, S = this.aSize.array as Float32Array;
		const drag = Math.exp( - DRAG * dt );
		for ( let i = 0; i < MAX; i ++ ) {

			if ( ! this.alive[ i ] ) continue;
			const j = i * 3;
			V[ j ] *= drag;
			V[ j + 1 ] = V[ j + 1 ] * drag - GRAVITY * dt;
			V[ j + 2 ] *= drag;
			P[ j ] += V[ j ] * dt;
			P[ j + 1 ] += V[ j + 1 ] * dt;
			P[ j + 2 ] += V[ j + 2 ] * dt;
			// back on the ground: it settles into the sand and is gone
			if ( P[ j + 1 ] <= 0 ) {

				this.alive[ i ] = 0;
				this.count --;
				S[ i * 2 ] = 0;
				continue;

			}
			O[ j ] = P[ j ]; O[ j + 1 ] = P[ j + 1 ]; O[ j + 2 ] = P[ j + 2 ];

		}
		this.aPos.needsUpdate = true;
		this.aSize.needsUpdate = true;

	}

}
