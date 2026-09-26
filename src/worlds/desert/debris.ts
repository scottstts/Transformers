import * as THREE from 'three/webgpu';
import { cameraViewMatrix, color, cos, cross, float, instancedBufferAttribute, max, min, mix, normalLocal, positionLocal, select, sin, smoothstep, sqrt, uniform, vec3 } from 'three/tsl';
import { N } from '../../rendering/noise.ts';
import { rockGeometry } from './world.ts';

/**
 * Crust thrown out by a blast: slabs of hardpan and stones (or, off the
 * fortress's paving, broken concrete), flung
 * ballistically, tumbling until they land, then lying where they fell until
 * they settle into the sand. One instanced draw of real (shadow-casting)
 * rock geometry; each chunk is stored once at birth and its flight, spin and
 * rest are evaluated in the vertex stage, so a burst uploads only its slots.
 */
const MAX = 192;
const GRAVITY = 9.81;
/** seconds a chunk lies on the sand before it settles in, and how long settling takes */
const REST = 24;
const SINK = 3;

export class Debris {

	readonly mesh: THREE.Mesh;
	private readonly time = uniform( 0 );
	private clock = 0;
	private cursor = 0;
	private liveUntil = - 1;
	private readonly a0: THREE.InstancedBufferAttribute;
	private readonly a1: THREE.InstancedBufferAttribute;
	private readonly a2: THREE.InstancedBufferAttribute;
	/** per chunk: 1 broken concrete (thrown off paving), 0 the sand's crust */
	private readonly kind: THREE.InstancedBufferAttribute;

	constructor( scene: THREE.Scene ) {

		const rock = rockGeometry( 1, 71, 1 );
		const geometry = new THREE.InstancedBufferGeometry();
		geometry.index = rock.index;
		geometry.setAttribute( 'position', rock.getAttribute( 'position' ) );
		geometry.setAttribute( 'normal', rock.getAttribute( 'normal' ) );
		geometry.instanceCount = MAX;
		const make = () => {

			const a = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 4 ), 4 );
			a.setUsage( THREE.DynamicDrawUsage );
			return a;

		};
		this.a0 = make(); // start position, birth
		this.a1 = make(); // velocity, size
		this.a2 = make(); // spin axis (unit), spin rate (rad/s)
		this.kind = new THREE.InstancedBufferAttribute( new Float32Array( MAX ), 1 );
		this.kind.setUsage( THREE.DynamicDrawUsage );
		for ( let i = 0; i < MAX; i ++ ) this.a0.array[ i * 4 + 3 ] = - 1e9;

		const p0 = instancedBufferAttribute( this.a0, 'vec4' ) as any;
		const v0 = instancedBufferAttribute( this.a1, 'vec4' ) as any;
		const spin = instancedBufferAttribute( this.a2, 'vec4' ) as any;
		const concrete = instancedBufferAttribute( this.kind, 'float' ) as any;
		const size = v0.w;
		const age = this.time.sub( p0.w );
		// lands when its centre comes down to a third of its size above the sand
		const rest = size.mul( 0.25 );
		const b = v0.y;
		const land = b.add( sqrt( max( b.mul( b ).add( float( 2 * GRAVITY ).mul( max( p0.y.sub( rest ), 0 ) ) ), 0 ) ) ).div( GRAVITY );
		const flight = min( age, land );
		const settle = smoothstep( REST, REST + SINK, age );
		const flying = p0.y.add( b.mul( age ) ).sub( age.mul( age ).mul( GRAVITY / 2 ) );
		const height = select( age.lessThan( land ), flying, rest ).sub( settle.mul( size ) ) as any;
		const centre = vec3( p0.x.add( v0.x.mul( flight ) ), height, p0.z.add( v0.z.mul( flight ) ) );
		// Rodrigues rotation about the chunk's spin axis, frozen when it lands
		const angle = spin.w.mul( flight ).add( p0.w.mul( 7.3 ) );
		const c = cos( angle ), sn = sin( angle );
		const rotate = ( v ) => {

			const k = spin.xyz;
			return v.mul( c ).add( cross( k, v ).mul( sn ) ).add( k.mul( k.dot( v ) ).mul( float( 1 ).sub( c ) ) );

		};
		const alive = age.greaterThanEqual( 0 ).and( age.lessThan( REST + SINK ) );
		const m = new THREE.MeshStandardNodeMaterial();
		m.positionNode = select( alive, rotate( positionLocal.mul( size ) ).add( centre ), vec3( 0, - 1000, 0 ) );
		const normal = rotate( normalLocal );
		m.normalNode = normal.transformDirection( cameraViewMatrix );
		// hardpan crust: pale, sun-bleached top and a darker, finer underside; some are stones
		const n = N( positionLocal.xz.mul( 1.7 ).add( p0.w ) );
		const crust = mix( color( 0x9c8266 ), color( 0xc9b090 ), n.r );
		const stone = mix( color( 0x5f4d3e ), color( 0x8b735c ), n.g );
		const sand = mix( crust, stone, smoothstep( 0.6, 0.75, v0.w.mul( 3.7 ).fract() ) );
		// broken concrete: the slab's grey skin on its top, the aggregate showing in its fractures
		const aggregate = mix( color( 0x4d4943 ), color( 0x756f64 ), smoothstep( 0.45, 0.62, N( positionLocal.xz.mul( 6.1 ) ).r ) );
		const slab = mix( aggregate, mix( color( 0x98948b ), color( 0xaaa59b ), n.g ), smoothstep( 0.35, 0.8, normalLocal.y ) );
		m.colorNode = mix( sand, slab, concrete ).mul( mix( float( 0.72 ), float( 1.04 ), smoothstep( - 0.6, 0.6, normalLocal.y ) ) );
		m.roughnessNode = float( 0.93 );
		this.mesh = new THREE.Mesh( geometry, m );
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = true;
		this.mesh.receiveShadow = true;
		this.mesh.visible = false;
		scene.add( this.mesh );

	}

	/**
	 * `count` chunks from `center`, thrown at up to `speed` m/s in a cone
	 * about `dir` (`spread` 0 a jet along it, 1 anywhere above the ground),
	 * `size` their largest (m).
	 */
	burst( center: THREE.Vector3, speed: number, count: number, dir: THREE.Vector3, spread: number, size: number, concrete = false ): void {

		const A0 = this.a0.array as Float32Array, A1 = this.a1.array as Float32Array, A2 = this.a2.array as Float32Array;
		const start = this.cursor;
		for ( let n = 0; n < count; n ++ ) {

			const i = this.cursor;
			this.cursor = ( this.cursor + 1 ) % MAX;
			let x = dir.x * ( 1 - spread ) + ( Math.random() * 2 - 1 ) * spread;
			let y = Math.abs( dir.y * ( 1 - spread ) + Math.random() * spread );
			let z = dir.z * ( 1 - spread ) + ( Math.random() * 2 - 1 ) * spread;
			const l = Math.hypot( x, y, z ) || 1;
			x /= l; y /= l; z /= l;
			// big slabs fly slower than stones
			const s = size * ( 0.18 + 0.82 * Math.pow( Math.random(), 2.2 ) );
			const v = speed * ( 0.35 + 0.65 * Math.random() ) * ( 1.15 - 0.5 * s / size );
			const r = Math.random() * 0.6 * size;
			const a = Math.random() * Math.PI * 2;
			A0.set( [ center.x + Math.cos( a ) * r, 0.15 + Math.random() * 0.3, center.z + Math.sin( a ) * r, this.clock ], i * 4 );
			A1.set( [ x * v, y * v, z * v, s ], i * 4 );
			const ax = Math.random() * 2 - 1, ay = Math.random() * 2 - 1, az = Math.random() * 2 - 1;
			const al = Math.hypot( ax, ay, az ) || 1;
			A2.set( [ ax / al, ay / al, az / al, ( 3 + Math.random() * 9 ) * ( Math.random() < 0.5 ? - 1 : 1 ) ], i * 4 );
			( this.kind.array as Float32Array )[ i ] = concrete ? 1 : 0;

		}
		const n = Math.min( count, MAX );
		for ( const a of [ this.a0, this.a1, this.a2, this.kind ] ) {

			const k = a.itemSize;
			if ( start + n <= MAX ) a.addUpdateRange( start * k, n * k );
			else {

				a.addUpdateRange( start * k, ( MAX - start ) * k );
				a.addUpdateRange( 0, ( start + n - MAX ) * k );

			}
			a.needsUpdate = true;

		}
		this.liveUntil = this.clock + REST + SINK;
		this.mesh.visible = true;

	}

	/** Show every slot for a shader compile (compiling skips invisible objects). */
	warm( on: boolean ): void {

		this.mesh.visible = on || this.clock < this.liveUntil;

	}

	update( dt: number ): void {

		this.clock += dt;
		this.time.value = this.clock;
		this.mesh.visible = this.clock < this.liveUntil;

	}

}
