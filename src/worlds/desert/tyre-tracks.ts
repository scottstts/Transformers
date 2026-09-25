import * as THREE from 'three/webgpu';
import { attribute, uniform, float, vec3, abs, exp, fract, fwidth, sin, smoothstep, step } from 'three/tsl';
import { sandGrain, sandImprintMaterial } from './sand-imprint.ts';

/**
 * Tyre tracks pressed into the desert: one ribbon per wheel, written into a
 * shared ring of quads as the wheel rolls. The ribbon carries no texture; its
 * shader rebuilds the sand from the ground's own albedo and relief, then adds
 * the rut, the berms of displaced sand and the tread imprint as a height field
 * lit through the normal. Outside the tyre the decal equals the bare ground,
 * so its edge blends away without a seam.
 *
 * A sliding tyre (a drift, wheelspin, a locked wheel) scrapes rather than
 * presses: the trough is shallower, the tread imprint is wiped into fine
 * striations along the travel, and the sand it pushes sideways piles into a
 * taller berm on the side it slides toward (the trailing side keeps less).
 */
const CAPACITY = 4096; // quads shared by all wheels (~1.2 km of ribbon)
const SPACING = 0.3; // m of travel per quad
const LIFT = 0.008; // m above the ground plane, plus a depth bias, against z-fighting
const LIFE = 150; // s until a track has fully faded
const TYRE = 0.74; // fraction of the ribbon's half-width pressed by the tyre
const DEPTH = 0.03; // rut depth (m)
const BERM = 0.012; // height of the displaced sand lip (m)
const TREAD = 0.006; // tread imprint relief (m)
const PITCH = 0.095; // lug pitch along the track (m)
const SCRAPE = 0.35; // share of the rut depth a full slide scrapes away
const STRIATION = 0.004; // relief of the scrape grooves (m)
const GROOVES = 9; // scrape grooves across the ribbon

interface WheelTrack {
	frame: number;
	x: number;
	z: number;
	v: number;
	edge: boolean;
	lx: number;
	lz: number;
	rx: number;
	rz: number;
}

export class TyreTracks {

	readonly mesh: THREE.Mesh;
	private readonly position: THREE.BufferAttribute;
	private readonly track: THREE.BufferAttribute;
	private readonly frameAttr: THREE.BufferAttribute;
	private readonly plowAttr: THREE.BufferAttribute;
	private readonly wheels: WheelTrack[] = [];
	private readonly time = uniform( 0 );
	private readonly serial = uniform( 0 );
	private frame = 0;
	private written = 0;
	private firstDirty = - 1;
	private dirtyCount = 0;

	constructor( scene: THREE.Scene ) {

		const geometry = new THREE.BufferGeometry();
		this.position = new THREE.BufferAttribute( new Float32Array( CAPACITY * 4 * 3 ), 3 );
		this.track = new THREE.BufferAttribute( new Float32Array( CAPACITY * 4 * 4 ), 4 ); // u, v (m), birth (s), serial
		this.frameAttr = new THREE.BufferAttribute( new Float32Array( CAPACITY * 4 * 4 ), 4 ); // travel dir xz, slip, half width
		this.plowAttr = new THREE.BufferAttribute( new Float32Array( CAPACITY * 4 ), 1 ); // side the slide pushes sand to (-1..1 across)
		for ( const a of [ this.position, this.track, this.frameAttr, this.plowAttr ] ) {

			a.setUsage( THREE.DynamicDrawUsage );

		}
		geometry.setAttribute( 'position', this.position );
		geometry.setAttribute( 'track', this.track );
		geometry.setAttribute( 'frame', this.frameAttr );
		geometry.setAttribute( 'plow', this.plowAttr );
		const index = new Uint16Array( CAPACITY * 6 );
		for ( let q = 0; q < CAPACITY; q ++ ) {

			const v = q * 4;
			index.set( [ v, v + 2, v + 1, v + 1, v + 2, v + 3 ], q * 6 );

		}
		geometry.setIndex( new THREE.BufferAttribute( index, 1 ) );

		this.mesh = new THREE.Mesh( geometry, this.material() );
		this.mesh.frustumCulled = false;
		this.mesh.receiveShadow = true;
		this.mesh.renderOrder = 1;
		scene.add( this.mesh );

	}

	/**
	 * Press the wheel `wheel` into the ground at `p` this frame: a swept
	 * `width`, `slip` 0..1 how far its tread slides, `slide` its tread's
	 * sliding velocity (world, m/s).
	 */
	mark( wheel: number, p: THREE.Vector3, width: number, slip: number, slide: THREE.Vector3 ): void {

		const s = this.wheels[ wheel ] ??= { frame: - 2, x: 0, z: 0, v: 0, edge: false, lx: 0, lz: 0, rx: 0, rz: 0 };
		if ( s.frame < this.frame - 1 ) {

			// wheel (re)touches down: start a new ribbon here
			s.x = p.x; s.z = p.z; s.v = 0; s.edge = false; s.frame = this.frame;
			return;

		}
		s.frame = this.frame;
		const dx = p.x - s.x, dz = p.z - s.z;
		const d = Math.hypot( dx, dz );
		if ( d < SPACING ) return;
		const tx = dx / d, tz = dz / d;
		const w = width * 0.5 / TYRE;
		// across = (-tz, tx): u = +1 on that side
		if ( ! s.edge ) {

			s.lx = s.x - tz * w; s.lz = s.z + tx * w;
			s.rx = s.x + tz * w; s.rz = s.z - tx * w;
			s.edge = true;

		}
		const lx = p.x - tz * w, lz = p.z + tx * w;
		const rx = p.x + tz * w, rz = p.z - tx * w;

		const q = this.written % CAPACITY;
		const P = this.position.array as Float32Array, T = this.track.array as Float32Array, F = this.frameAttr.array as Float32Array;
		const S = this.plowAttr.array as Float32Array;
		// the sideways share of the slide, toward +u (across) or -u
		const plow = ( slide.z * tx - slide.x * tz ) / Math.max( Math.hypot( slide.x, slide.z ), 0.01 );
		const corners = [ [ s.lx, s.lz, 1, s.v ], [ s.rx, s.rz, - 1, s.v ], [ lx, lz, 1, s.v + d ], [ rx, rz, - 1, s.v + d ] ];
		for ( let k = 0; k < 4; k ++ ) {

			const [ x, z, u, v ] = corners[ k ];
			const i = q * 4 + k;
			P.set( [ x, LIFT, z ], i * 3 );
			T.set( [ u, v, this.time.value, this.written ], i * 4 );
			F.set( [ tx, tz, slip, w ], i * 4 );
			S[ i ] = plow;

		}
		if ( q < this.firstDirty ) this.flush(); // ring wrapped: upload the tail first
		if ( this.firstDirty < 0 ) this.firstDirty = q;
		this.dirtyCount = q - this.firstDirty + 1;

		this.written ++;
		s.x = p.x; s.z = p.z; s.v += d;
		s.lx = lx; s.lz = lz; s.rx = rx; s.rz = rz;

	}

	update( dt: number ): void {

		this.flush();
		this.frame ++;
		this.time.value += dt;
		this.serial.value = this.written;

	}

	/** Upload the quads written since the last flush (one contiguous range). */
	private flush(): void {

		if ( this.firstDirty < 0 ) return;
		const q0 = this.firstDirty, n = this.dirtyCount;
		for ( const [ a, size ] of [ [ this.position, 3 ], [ this.track, 4 ], [ this.frameAttr, 4 ], [ this.plowAttr, 1 ] ] as const ) {

			a.addUpdateRange( q0 * 4 * size, n * 4 * size );
			a.needsUpdate = true;

		}
		this.firstDirty = - 1;
		this.dirtyCount = 0;

	}

	private material(): THREE.MeshStandardNodeMaterial {

		const tr = attribute( 'track', 'vec4' );
		const fr = attribute( 'frame', 'vec4' );
		const u = tr.x, v = tr.y;
		const slip = fr.z, halfWidth = fr.w;
		const plow = attribute( 'plow', 'float' );

		// sand does not hold a crisp stamp: depth wanders along the track, the walls
		// crumble unevenly and part of the tread imprint has collapsed back in
		const grain = sandGrain();
		const depthScale = grain.r.sub( 0.5 ).mul( 0.7 ).add( 1 );
		const crumble = grain.b.sub( 0.5 ).mul( 0.09 );
		const treadHeld = smoothstep( 0.28, 0.62, grain.g ).mul( float( 1 ).sub( smoothstep( 0.25, 0.7, fwidth( v ).div( PITCH ) ) ) );
		// scrape grooves: irregular in spacing, faded once a groove is under a pixel
		const groovePhase = u.mul( Math.PI * GROOVES ).add( grain.r.mul( 7 ) );
		const groovesHeld = float( 1 ).sub( smoothstep( 0.3, 0.8, fwidth( groovePhase ).div( Math.PI ) ) ).mul( slip );
		// sand pushed sideways piles up on the side the tyre slides toward
		const plowed = abs( plow ).mul( slip );

		// sand height (m) across (u, -1..1) and along (v, m) the ribbon
		const height = ( uu, vv ) => {

			const au = abs( uu ).add( crumble );
			const rut = float( 1 ).sub( smoothstep( TYRE - 0.2, TYRE + 0.04, au ) );
			const lip = au.sub( TYRE + 0.12 ).div( 0.13 );
			const berm = exp( lip.mul( lip ).negate() ).mul( float( 1 ).add( plowed.mul( smoothstep( - 0.3, 0.3, uu.mul( plow ) ).mul( 2.6 ).sub( 0.6 ) ) ) );
			// staggered chevron lugs; the tyre's grooves leave raised ridges in the sand
			const phase = fract( vv.div( PITCH ).add( step( 0, uu ).mul( 0.5 ) ).add( au.mul( 0.9 ) ) );
			const ridge = smoothstep( 0.04, 0.16, phase ).mul( float( 1 ).sub( smoothstep( 0.44, 0.58, phase ) ) );
			const rib = exp( au.div( 0.05 ).pow( 2 ).negate() );
			const inside = float( 1 ).sub( smoothstep( TYRE - 0.2, TYRE - 0.06, au ) );
			const tread = ridge.mul( 0.7 ).add( rib.mul( 0.4 ) ).mul( inside ).mul( float( 1 ).sub( slip ) ).mul( treadHeld );
			const grooves = sin( uu.mul( Math.PI * GROOVES ).add( grain.r.mul( 7 ) ) ).mul( inside ).mul( groovesHeld ).mul( STRIATION );
			const depth = float( DEPTH ).mul( float( 1 ).sub( slip.mul( SCRAPE ) ) );
			return rut.mul( tread.mul( TREAD ).add( grooves ).sub( depth ) ).mul( depthScale ).add( berm.mul( BERM ).mul( depthScale ) );

		};

		const au = abs( u ).add( crumble );
		const age = this.time.sub( tr.z );
		const fade = float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) )
			.mul( float( 1 ).sub( smoothstep( CAPACITY * 0.75, CAPACITY, this.serial.sub( tr.w ) ) ) );
		return sandImprintMaterial( {
			height, x: u, y: v, dx: 0.02, dy: 0.006, metresX: halfWidth, metresY: 1,
			axisX: vec3( fr.y.negate(), 0, fr.x ), axisY: vec3( fr.x, 0, fr.y ),
			pressed: float( 1 ).sub( smoothstep( TYRE - 0.16, TYRE + 0.03, au ) ),
			depth: DEPTH,
			opacity: float( 1 ).sub( smoothstep( 0.86, 1.0, abs( u ) ) ).mul( fade ),
		} );

	}

}
