import * as THREE from 'three/webgpu';
import { abs, atan, attribute, cameraViewMatrix, exp, float, floor, fract, length, max, min, mix, positionWorld, select, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import { N } from '../../rendering/noise.ts';
import { blackbody } from '../../rendering/blackbody.ts';
import { groundSurface } from './materials.ts';

/**
 * Sand fused by a blast of heat. When enough heat lands on quartz sand it melts
 * and sets as a crust of dark olive glass (as at the Trinity site), the
 * sand around it is charred, and the glass cools from white through orange
 * and deep red to black over seconds, its cracks glowing longest because they
 * open onto hotter glass below. Two kinds of mark, each a ring of decal quads
 * drawn in one call, shaded like the other imprints (the bare floor rebuilt
 * from `groundSurface`, relief through the normal) plus emission from the
 * glass's temperature (`blackbody`):
 *
 *   crater  a blast bowl with a raised rim, an ejecta blanket and dark rays,
 *           a glass floor with glowing cracks and radial fissures running out
 *   furrow  a trench of glass left by a white-hot edge dragged through the
 *           sand; it can be reignited later (`reignite`), a heat front running
 *           along it from a point or in from its ends
 *
 * Heat is gone in seconds; the marks themselves fade over LIFE.
 */
const CRATERS = 6;
const FURROWS = 40;
/** m above the ground, over footprints (9 mm) and tracks (8 mm), with a depth bias */
const LIFT = 0.011;
const LIFE = 110;
/** crater bowl depth, rim height and quad reach (shares of the radius) */
const BOWL = 0.07;
const RIM = 0.028;
const REACH = 2.4;
/** furrow trench depth and berm height (shares of its half-width), and how far its soot reaches (half-widths) */
const TRENCH = 0.45;
const BERM = 0.22;
const SOOT = 3.4;
/** cooling times (s) of the surface glass, its cracks and fissures, and a furrow */
const COOL = { glass: 2.6, cracks: 7, fissures: 5, furrow: 1.8, front: 2.2 };
/** HDR level of the glow at unit blackbody level */
const GLOW = 1.7;
const AMBIENT = 300;
/** a reheat time that never comes */
const NEVER = 1e9;

export class ScorchMarks {

	readonly craters: THREE.Mesh;
	readonly furrows: THREE.Mesh;
	private readonly time = uniform( 0 );
	private readonly crater: { position: THREE.BufferAttribute; mark: THREE.BufferAttribute; heat: THREE.BufferAttribute; written: number };
	private readonly furrow: { position: THREE.BufferAttribute; mark: THREE.BufferAttribute; line: THREE.BufferAttribute; reheat: THREE.BufferAttribute; written: number };

	constructor( scene: THREE.Scene ) {

		const quads = ( count: number, attributes: Record<string, number> ) => {

			const geometry = new THREE.BufferGeometry();
			const out: Record<string, THREE.BufferAttribute> = {};
			for ( const [ name, size ] of Object.entries( attributes ) ) {

				const a = new THREE.BufferAttribute( new Float32Array( count * 4 * size ), size );
				a.setUsage( THREE.DynamicDrawUsage );
				geometry.setAttribute( name, a );
				out[ name ] = a;

			}
			const index = new Uint16Array( count * 6 );
			for ( let q = 0; q < count; q ++ ) index.set( [ q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 1, q * 4 + 2, q * 4 + 3 ], q * 6 );
			geometry.setIndex( new THREE.BufferAttribute( index, 1 ) );
			return { geometry, out };

		};

		const c = quads( CRATERS, { position: 3, mark: 4, heat: 2 } );
		this.crater = { position: c.out.position, mark: c.out.mark, heat: c.out.heat, written: 0 };
		this.craters = this.decal( c.geometry, this.craterMaterial() );
		const f = quads( FURROWS, { position: 3, mark: 4, line: 4, reheat: 4 } );
		this.furrow = { position: f.out.position, mark: f.out.mark, line: f.out.line, reheat: f.out.reheat, written: 0 };
		( this.furrow.reheat.array as Float32Array ).fill( NEVER );
		this.furrows = this.decal( f.geometry, this.furrowMaterial() );
		scene.add( this.craters, this.furrows );

	}

	/** A crater of fused glass at `center` (ground), `radius` m, `heat` 0..1+ (1: fused white-hot). */
	addCrater( center: THREE.Vector3, radius: number, heat: number ): void {

		const q = this.crater.written ++ % CRATERS;
		const r = radius * REACH;
		const P = this.crater.position.array as Float32Array, M = this.crater.mark.array as Float32Array, H = this.crater.heat.array as Float32Array;
		const seed = Math.random() * 10;
		const corners = [ [ - r, - r ], [ r, - r ], [ - r, r ], [ r, r ] ];
		for ( let k = 0; k < 4; k ++ ) {

			const [ x, z ] = corners[ k ];
			const i = q * 4 + k;
			P.set( [ center.x + x, LIFT, center.z + z ], i * 3 );
			M.set( [ x, z, radius, this.time.value ], i * 4 );
			H.set( [ heat, seed ], i * 2 );

		}
		for ( const [ a, size ] of [ [ this.crater.position, 3 ], [ this.crater.mark, 4 ], [ this.crater.heat, 2 ] ] as const ) flush( a, q, size );

	}

	/** A glass furrow from `from` to `to` (ground), `width` m across; returns its handle for `reignite`. */
	addFurrow( from: THREE.Vector3, to: THREE.Vector3, width: number, heat: number ): number {

		const handle = this.furrow.written ++;
		const q = handle % FURROWS;
		const dx = to.x - from.x, dz = to.z - from.z;
		const length = Math.max( 0.01, Math.hypot( dx, dz ) );
		const ax = dx / length, az = dz / length;
		const hw = width * 0.5;
		const across = hw * SOOT, margin = hw * 2.5;
		const P = this.furrow.position.array as Float32Array, M = this.furrow.mark.array as Float32Array;
		const L = this.furrow.line.array as Float32Array, R = this.furrow.reheat.array as Float32Array;
		// across = (-az, ax): a left-handed (u, v) frame on the ground, so the corners run the other way round to face up
		const corners = [ [ across, - margin ], [ - across, - margin ], [ across, length + margin ], [ - across, length + margin ] ];
		for ( let k = 0; k < 4; k ++ ) {

			const [ u, v ] = corners[ k ];
			const i = q * 4 + k;
			P.set( [ from.x + ax * v - az * u, LIFT, from.z + az * v + ax * u ], i * 3 );
			M.set( [ u, v, hw, this.time.value ], i * 4 );
			L.set( [ length, heat, ax, az ], i * 4 );
			R.set( [ NEVER, 1, 0, 0 ], i * 4 );

		}
		for ( const [ a, size ] of [ [ this.furrow.position, 3 ], [ this.furrow.mark, 4 ], [ this.furrow.line, 4 ], [ this.furrow.reheat, 4 ] ] as const ) flush( a, q, size );
		return handle;

	}

	/**
	 * The furrow `handle` catches again after `delay` s: a heat front leaves the
	 * point `at` m along it at `speed` m/s both ways, or with a negative speed
	 * starts at its ends and runs in toward `at`.
	 */
	reignite( handle: number, delay: number, at: number, speed: number ): void {

		// overwritten since: nothing to reignite
		if ( handle < this.furrow.written - FURROWS ) return;
		const q = handle % FURROWS;
		const R = this.furrow.reheat.array as Float32Array;
		for ( let k = 0; k < 4; k ++ ) R.set( [ this.time.value + delay, speed, at, 0 ], ( q * 4 + k ) * 4 );
		flush( this.furrow.reheat, q, 4 );

	}

	update( dt: number ): void {

		this.time.value += dt;

	}

	private decal( geometry: THREE.BufferGeometry, material: THREE.Material ): THREE.Mesh {

		const mesh = new THREE.Mesh( geometry, material );
		mesh.frustumCulled = false;
		mesh.receiveShadow = true;
		mesh.renderOrder = 1.2;
		return mesh;

	}

	private craterMaterial(): THREE.MeshStandardNodeMaterial {

		const mark = attribute( 'mark', 'vec4' );
		const heatAttr = attribute( 'heat', 'vec2' );
		const R = mark.z, heat = heatAttr.x, seed = heatAttr.y;
		const age = this.time.sub( mark.w );
		const TAU = 2 * Math.PI;

		// polar coordinates; angular noise wraps seamlessly (an integer number of texture periods round)
		const polar = ( x, y ) => ( { r: length( vec2( x, y ) ).div( R ), a: atan( y, x ).div( TAU ).add( 0.5 ) } );
		const height = ( x, y ) => {

			const { r, a } = polar( x, y );
			const wobble = N( vec2( a.mul( 6 ).add( seed ), r.mul( 0.5 ) ) ).r.sub( 0.5 );
			const rr = r.add( wobble.mul( 0.12 ) );
			const inside = float( 1 ).sub( min( rr, 1 ).mul( min( rr, 1 ) ) );
			const bowl = inside.mul( inside ).mul( - BOWL );
			const lip = rr.sub( 1 ).div( 0.15 );
			const rim = exp( lip.mul( lip ).negate() ).mul( RIM ).mul( wobble.mul( 0.8 ).add( 1 ) );
			const blanket = smoothstep( 0.95, 1.12, rr ).mul( exp( rr.sub( 1.12 ).div( 0.35 ).negate() ) ).mul( RIM * 0.35 );
			return bowl.add( rim ).add( blanket ).mul( R );

		};

		const x = mark.x, y = mark.y;
		const { r, a } = polar( x, y );
		const n = N( positionWorld.xz.mul( 0.35 ) );
		const edge = r.add( n.r.sub( 0.5 ).mul( 0.25 ) );
		const glass = float( 1 ).sub( smoothstep( 0.4, 0.56, edge ) );
		// cracks: contour lines of the relief noise, two scales, in the glass
		const ridge = ( v, w ) => float( 1 ).sub( smoothstep( 0, w, abs( v.sub( 0.5 ) ) ) );
		const cracks = max( ridge( N( positionWorld.xz.mul( 0.8 ) ).g, 0.03 ), ridge( N( positionWorld.xz.mul( 2.1 ).add( 0.37 ) ).b, 0.022 ).mul( 0.7 ) ).mul( glass );
		// radial fissures out through the rim, each its own length
		const K = 11;
		const spoke = a.mul( K ).add( N( vec2( r.mul( 0.6 ), a.mul( 3 ).add( seed ) ) ).a.sub( 0.5 ).mul( 0.35 ) );
		const reach = N( vec2( floor( spoke ).mul( 0.173 ).add( seed ), 0.61 ) ).r.mul( 0.55 ).add( 0.8 );
		const fissures = ridge( fract( spoke ), float( 0.06 ).mul( float( 1.35 ).sub( r ) ) )
			.mul( smoothstep( 0.32, 0.45, r ) ).mul( float( 1 ).sub( smoothstep( reach.sub( 0.2 ), reach, r ) ) );
		// charred ground, and dark rays of soot thrown out over the blanket
		const ray = N( vec2( a.mul( 14 ).add( seed.mul( 2 ) ), r.mul( 0.35 ) ) ).g.mul( 0.7 ).add( N( vec2( a.mul( 29 ).add( seed ), r.mul( 0.8 ) ) ).b.mul( 0.3 ) );
		const rays = smoothstep( 0.5, 0.8, ray ).mul( smoothstep( 0.85, 1.05, r ) ).mul( float( 1 ).sub( smoothstep( 1.15, 1.2, r.add( ray.sub( 0.5 ).mul( 1.6 ) ).mul( 0.55 ) ) ) );
		const char = float( 1 ).sub( smoothstep( 0.8, 1.55, edge ) ).mul( 0.82 ).add( rays.mul( 0.55 ) ).clamp( 0, 0.9 );

		// temperature: white-hot at the heart, the cracks and fissures cooling slower
		const core = exp( r.div( 0.5 ).pow( 2 ).mul( - 1.3 ) );
		const tGlass = float( 2150 ).mul( heat ).mul( core ).mul( exp( age.div( COOL.glass ).negate() ) ).add( AMBIENT );
		const tCrack = float( 1750 ).mul( heat ).mul( exp( r.div( 0.6 ).pow( 2 ).negate() ) ).mul( exp( age.div( COOL.cracks ).negate() ) ).add( AMBIENT );
		const tFissure = float( 1600 ).mul( heat ).mul( float( 1.25 ).sub( r ).clamp( 0, 1 ) ).mul( exp( age.div( COOL.fissures ).negate() ) ).add( AMBIENT );
		const glow = blackbody( tGlass ).mul( glass ).add( blackbody( tCrack ).mul( cracks ) ).add( blackbody( tFissure ).mul( fissures ) ).mul( GLOW );

		return markMaterial( {
			height, x, y, axisX: vec3( 1, 0, 0 ), axisY: vec3( 0, 0, 1 ), glass, char, glow,
			// cracks show dark in the cold glass: the crust split and settled
			glassShade: float( 1 ).sub( cracks.mul( 0.45 ) ),
			opacity: float( 1 ).sub( smoothstep( REACH * 0.8, REACH * 0.98, r ) ).mul( float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) ) ),
		} );

	}

	private furrowMaterial(): THREE.MeshStandardNodeMaterial {

		const mark = attribute( 'mark', 'vec4' );
		const line = attribute( 'line', 'vec4' );
		const reheat = attribute( 'reheat', 'vec4' );
		const hw = mark.z, length_ = line.x, heat = line.y;
		const age = this.time.sub( mark.w );
		const u = mark.x, v = mark.y;
		// the furrow thins out at its ends
		const end = min( v, length_.sub( v ) );
		const taper = smoothstep( hw.mul( - 1 ), hw.mul( 3 ), end );
		const height = ( uu, vv ) => {

			const e = min( vv, length_.sub( vv ) );
			const t = smoothstep( hw.mul( - 1 ), hw.mul( 3 ), e );
			const w = abs( uu ).div( hw ).add( N( vec2( vv.mul( 0.9 ), uu.mul( 0.4 ) ) ).r.sub( 0.5 ).mul( 0.3 ) );
			const trench = float( 1 ).sub( w.mul( w ) ).max( 0 ).mul( - TRENCH );
			const lip = w.sub( 1.3 ).div( 0.35 );
			const berm = exp( lip.mul( lip ).negate() ).mul( BERM );
			return trench.add( berm ).mul( hw ).mul( t );

		};

		const w = abs( u ).div( hw ).add( N( positionWorld.xz.mul( 0.7 ) ).r.sub( 0.5 ).mul( 0.5 ) );
		const glass = float( 1 ).sub( smoothstep( 0.35, 0.65, w ) ).mul( taper );
		const char = float( 1 ).sub( smoothstep( 1.1, SOOT * 0.85, w ) ).mul( 0.85 ).mul( smoothstep( hw.mul( - 2.5 ), hw.mul( 1.5 ), end ) );
		// molten in patches: hot spots along the trench, where the edge bit deeper
		const patches = N( vec2( v.mul( 0.45 ), mark.w.mul( 0.13 ) ) ).r.mul( 0.5 ).add( N( vec2( v.mul( 1.7 ), u.mul( 0.8 ) ) ).g.mul( 0.25 ) ).add( 0.45 );
		const core = exp( w.mul( w ).mul( - 2 ) ).mul( taper ).mul( patches );

		// first heat from the blade, then a front that reignites it (from `at` outward, or in from the ends)
		const speed = reheat.y, at = reheat.z;
		const off = abs( v.sub( at ) );
		const arrival = select( speed.greaterThan( 0 ), off.div( max( speed, 1e-3 ) ), max( at, length_.sub( at ) ).sub( off ).div( max( speed.negate(), 1e-3 ) ) );
		const front = this.time.sub( reheat.x ).sub( arrival );
		const burn = select( front.greaterThanEqual( 0 ), exp( front.div( COOL.front ).negate() ), float( 0 ) );
		const tFirst = float( 2200 ).mul( heat ).mul( exp( age.div( COOL.furrow ).negate() ) );
		const tBurn = float( 2400 ).mul( burn ).mul( smoothstep( 0, 0.05, front ).mul( 0.25 ).add( 0.75 ) );
		const temperature = max( tFirst, tBurn ).mul( core ).add( AMBIENT );
		const glow = blackbody( temperature ).mul( glass.mul( 0.7 ).add( 0.3 ) ).mul( GLOW );

		return markMaterial( {
			height, x: u, y: v, axisX: vec3( line.w.negate(), 0, line.z ), axisY: vec3( line.z, 0, line.w ), glass, char, glow,
			glassShade: float( 1 ),
			opacity: float( 1 ).sub( smoothstep( SOOT * 0.8, SOOT * 0.98, abs( u ).div( hw ) ) )
				.mul( smoothstep( hw.mul( - 2.4 ), hw.mul( - 0.5 ), end ) )
				.mul( float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) ) ),
		} );

	}

}

interface Mark {
	/** relief (m) at local coordinates (m) */
	height: ( x, y ) => any;
	x: any;
	y: any;
	/** world directions of the local +x and +y on the ground */
	axisX: any;
	axisY: any;
	/** 0..1 fused into glass; 0..1 charred */
	glass: any;
	char: any;
	/** emission (linear HDR) */
	glow: any;
	/** shade of the cold glass (its dark cracks) */
	glassShade: any;
	opacity: any;
}

/** Fused-sand shading: the bare floor rebuilt around it, charred, set to dark olive glass where fused. */
function markMaterial( m: Mark ): THREE.MeshStandardNodeMaterial {

	const material = new THREE.MeshStandardNodeMaterial( { transparent: true, depthWrite: false } );
	material.polygonOffset = true;
	material.polygonOffsetFactor = - 3;
	material.polygonOffsetUnits = - 3;
	const e = 0.03;
	const h0 = m.height( m.x, m.y );
	const gx = m.height( m.x.add( e ), m.y ).sub( h0 ).div( e );
	const gy = m.height( m.x, m.y.add( e ) ).sub( h0 ).div( e );
	const ground = groundSurface( positionWorld.xz );
	// glass sets smooth: the wind ripples are gone under it
	const slope = ground.slope.mul( float( 1 ).sub( m.glass ) );
	const normal = vec3( slope.x, 1, slope.y ).sub( m.axisX.mul( gx ) ).sub( m.axisY.mul( gy ) ).normalize();
	material.normalNode = normal.transformDirection( cameraViewMatrix );
	const grain = N( positionWorld.xz.mul( 1.9 ) );
	// trinitite: an olive-black glass, a little bubbled
	const glassColor = mix( vec3( 0.022, 0.024, 0.016 ), vec3( 0.055, 0.058, 0.036 ), grain.g ).mul( m.glassShade );
	const charred = ground.color.mul( float( 1 ).sub( m.char.mul( 0.78 ) ) );
	material.colorNode = mix( charred, glassColor, m.glass );
	material.roughnessNode = mix( mix( ground.roughness, float( 0.97 ), m.char ), grain.b.mul( 0.12 ).add( 0.1 ), m.glass );
	material.metalnessNode = float( 0 );
	material.emissiveNode = m.glow;
	material.opacityNode = m.opacity;
	return material;

}

function flush( a: THREE.BufferAttribute, quad: number, size: number ): void {

	a.addUpdateRange( quad * 4 * size, 4 * size );
	a.needsUpdate = true;

}
