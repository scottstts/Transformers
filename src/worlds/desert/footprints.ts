import * as THREE from 'three/webgpu';
import { attribute, uniform, float, vec2, vec3, abs, exp, fract, fwidth, length, max, min, smoothstep } from 'three/tsl';
import { sandGrain, sandImprintMaterial } from './sand-imprint.ts';

/**
 * Footprints pressed into the sand by a heavy walker: one decal per footfall
 * in a ring. The print is a rounded sole-shaped depression with a lip of
 * displaced sand and a transverse-bar tread, shaped from the sole's measured
 * outline (centre, heading, length, width) and shaded like the tyre tracks.
 */
const CAPACITY = 240; // > LIFE of running footfalls, so prints fade before the ring reuses them
const RIM = 0.14; // m of decal beyond the sole for the displaced lip
const LIFT = 0.009; // m above the ground (tracks sit at 0.008)
const LIFE = 90; // s
const DEPTH = 0.045; // m, a multi-tonne foot
const LIP = 0.014; // m
const TREAD = 0.008; // m
const BAR_PITCH = 0.11; // m between tread bars
const CORNER = 0.09; // m sole corner radius

export class Footprints {

	readonly mesh: THREE.Mesh;
	private readonly position: THREE.BufferAttribute;
	private readonly print: THREE.BufferAttribute;
	private readonly frame: THREE.BufferAttribute;
	private readonly time = uniform( 0 );
	private written = 0;

	constructor( scene: THREE.Scene ) {

		const geometry = new THREE.BufferGeometry();
		this.position = new THREE.BufferAttribute( new Float32Array( CAPACITY * 4 * 3 ), 3 );
		this.print = new THREE.BufferAttribute( new Float32Array( CAPACITY * 4 * 4 ), 4 ); // along (m), across (m), birth, depth scale
		this.frame = new THREE.BufferAttribute( new Float32Array( CAPACITY * 4 * 4 ), 4 ); // heading xz, half length, half width
		for ( const a of [ this.position, this.print, this.frame ] ) a.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( 'position', this.position );
		geometry.setAttribute( 'print', this.print );
		geometry.setAttribute( 'frame', this.frame );
		const index = new Uint16Array( CAPACITY * 6 );
		for ( let q = 0; q < CAPACITY; q ++ ) index.set( [ q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 1, q * 4 + 2, q * 4 + 3 ], q * 6 );
		geometry.setIndex( new THREE.BufferAttribute( index, 1 ) );
		this.mesh = new THREE.Mesh( geometry, this.material() );
		this.mesh.frustumCulled = false;
		this.mesh.receiveShadow = true;
		this.mesh.renderOrder = 1;
		scene.add( this.mesh );

	}

	/** Stamp a sole centred at `center` (ground), heading `forward` (unit, xz), with its length and width (m). */
	stamp( center: THREE.Vector3, forward: THREE.Vector3, length: number, width: number, strength: number ): void {

		const q = this.written % CAPACITY;
		const fx = forward.x, fz = forward.z;
		const hl = length * 0.5, hw = width * 0.5;
		const el = hl + RIM, ew = hw + RIM;
		const P = this.position.array as Float32Array, T = this.print.array as Float32Array, F = this.frame.array as Float32Array;
		// corners: (along, across) in metres; across = (-fz, fx)
		const corners = [ [ - el, ew ], [ - el, - ew ], [ el, ew ], [ el, - ew ] ];
		for ( let k = 0; k < 4; k ++ ) {

			const [ a, c ] = corners[ k ];
			const i = q * 4 + k;
			P.set( [ center.x + fx * a - fz * c, LIFT, center.z + fz * a + fx * c ], i * 3 );
			T.set( [ a, c, this.time.value, strength ], i * 4 );
			F.set( [ fx, fz, hl, hw ], i * 4 );

		}
		for ( const [ attr, size ] of [ [ this.position, 3 ], [ this.print, 4 ], [ this.frame, 4 ] ] as const ) {

			attr.addUpdateRange( q * 4 * size, 4 * size );
			attr.needsUpdate = true;

		}
		this.written ++;

	}

	update( dt: number ): void {

		this.time.value += dt;

	}

	private material(): THREE.MeshStandardNodeMaterial {

		const pr = attribute( 'print', 'vec4' );
		const fr = attribute( 'frame', 'vec4' );
		const half = vec2( fr.z, fr.w );
		const grain = sandGrain();
		const crumble = grain.b.sub( 0.5 ).mul( 0.035 );
		const depthScale = grain.r.sub( 0.5 ).mul( 0.5 ).add( 1 ).mul( pr.w );
		const treadHeld = smoothstep( 0.25, 0.6, grain.g ).mul( float( 1 ).sub( smoothstep( 0.25, 0.7, fwidth( pr.x ).div( BAR_PITCH ) ) ) );

		// signed distance to the rounded sole outline (m): negative inside
		const outline = ( a, c ) => {

			const q = abs( vec2( a, c ) ).sub( half ).add( CORNER );
			return length( max( q, 0 ) ).add( min( max( q.x, q.y ), 0 ) ).sub( CORNER ).add( crumble );

		};
		const height = ( a, c ) => {

			const d = outline( a, c );
			const sole = float( 1 ).sub( smoothstep( - 0.05, 0.015, d ) );
			const lip = d.sub( 0.05 ).div( 0.05 );
			const rim = exp( lip.mul( lip ).negate() );
			// transverse bars: the sole's grooves leave ridges standing in the print
			const phase = fract( a.div( BAR_PITCH ) );
			const bar = smoothstep( 0.1, 0.22, phase ).mul( float( 1 ).sub( smoothstep( 0.5, 0.62, phase ) ) );
			const tread = bar.mul( float( 1 ).sub( smoothstep( - 0.08, - 0.03, d ) ) ).mul( treadHeld );
			return sole.mul( tread.mul( TREAD ).sub( DEPTH ) ).add( rim.mul( LIP ) ).mul( depthScale );

		};

		const d = outline( pr.x, pr.y );
		const age = this.time.sub( pr.z );
		return sandImprintMaterial( {
			height, x: pr.x, y: pr.y, dx: 0.006, dy: 0.006, metresX: 1, metresY: 1,
			axisX: vec3( fr.x, 0, fr.y ), axisY: vec3( fr.y.negate(), 0, fr.x ),
			pressed: float( 1 ).sub( smoothstep( - 0.04, 0.02, d ) ),
			depth: DEPTH,
			opacity: float( 1 ).sub( smoothstep( RIM * 0.55, RIM * 0.95, d ) ).mul( float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) ) ),
		} );

	}

}
