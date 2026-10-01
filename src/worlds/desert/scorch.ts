import * as THREE from 'three/webgpu';
import { abs, atan, attribute, cameraViewMatrix, exp, float, floor, fract, length, max, min, mix, positionLocal, positionWorld, select, smoothstep, uniform, varying, vec2, vec3 } from 'three/tsl';
import { N } from '../../rendering/noise.ts';
import { blackbody } from '../../rendering/blackbody.ts';
import { groundSurface } from './materials.ts';
import type { CitadelFloor } from './citadel/floor.ts';
import type { DesertTerrain, GroundDecal } from './terrain.ts';
import { decalRange } from './sand-imprint.ts';

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
 *           along it from a point or in from its ends. A cold edge (heat 0)
 *           leaves the same trench and berms in plain sand
 *
 * Heat is gone in seconds; the marks themselves fade over LIFE.
 *
 * Marks answer the surface they land on (the citadel's floor map,
 * citadel/floor.ts): where the floor is sand the glass marks are drawn; on
 * its ceramic paving and metal deck the sand's mark is cut away and the
 * floor's own mark is drawn over it, at the floor's height (the mark's
 * vertices take it, so a mark runs up a ramp), and only on the level the
 * mark landed on: a fragment over a floor more than 0.25 m off the mark's
 * own (a terrace edge, the yard below) is dropped.
 *
 * Ceramic doesn't fuse: a blast spalls its skin off to the grey substrate in
 * a shallow scar, splits it in radial and ring cracks and chars it with
 * soot; a dragged edge scores a gouge with chipped lips. Deck doesn't spall:
 * a blast leaves a shallow dished dent tinted by the heat (temper rings of
 * straw, blue and grey round a blackened heart), a dragged edge scores a
 * bright gouge with a raised burr and temper colour along it. Both glow a
 * moment where the heat landed.
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
/** a mark's vertices follow the floor within this of its centre's level (a ramp), else they stay on that level (m); fragments over another level are dropped */
const FOLLOW = 2;
const SAME_LEVEL = 0.25;
/** a reheat time that never comes */
const NEVER = 1e9;
/** cells of a mark's grid (its two axes): a mark bends over the landform, a flat quad would cut into a dune */
const CRATER_GRID: [ number, number ] = [ 8, 8 ];
const FURROW_GRID: [ number, number ] = [ 2, 12 ];

/** A ring of marks, each a grid whose attributes are interpolated from its four corners. */
interface MarkRing {
	geometry: THREE.BufferGeometry;
	attributes: Record<string, THREE.BufferAttribute>;
	cells: [ number, number ];
	/** vertices per mark */
	verts: number;
	written: number;
}

function markRing( count: number, attributes: Record<string, number>, cells: [ number, number ] ): MarkRing {

	const [ gi, gj ] = cells;
	const verts = ( gi + 1 ) * ( gj + 1 );
	const geometry = new THREE.BufferGeometry();
	const out: Record<string, THREE.BufferAttribute> = {};
	for ( const [ name, size ] of Object.entries( attributes ) ) {

		const a = new THREE.BufferAttribute( new Float32Array( count * verts * size ), size );
		a.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( name, a );
		out[ name ] = a;

	}
	// (i, j) runs from corner 0 toward corner 1 (i) and toward corner 2 (j), wound as the corner quads were
	const index = new Uint16Array( count * gi * gj * 6 );
	let n = 0;
	for ( let q = 0; q < count; q ++ ) {

		for ( let j = 0; j < gj; j ++ ) for ( let i = 0; i < gi; i ++ ) {

			const a = q * verts + j * ( gi + 1 ) + i, b = a + 1, c = a + gi + 1, d = c + 1;
			index.set( [ a, c, b, b, c, d ], n );
			n += 6;

		}

	}
	geometry.setIndex( new THREE.BufferAttribute( index, 1 ) );
	return { geometry, attributes: out, cells, verts, written: 0 };

}

/** Write mark `q`: each named attribute's value at the four corners, spread bilinearly over its grid. */
function writeMark( ring: MarkRing, q: number, corners: Record<string, number[][]> ): void {

	const [ gi, gj ] = ring.cells;
	for ( const [ name, values ] of Object.entries( corners ) ) {

		const a = ring.attributes[ name ];
		const size = a.itemSize;
		const array = a.array as Float32Array;
		const [ c0, c1, c2, c3 ] = values;
		for ( let j = 0; j <= gj; j ++ ) for ( let i = 0; i <= gi; i ++ ) {

			const s = i / gi, t = j / gj;
			const o = ( q * ring.verts + j * ( gi + 1 ) + i ) * size;
			for ( let k = 0; k < size; k ++ ) array[ o + k ] = ( c0[ k ] * ( 1 - s ) + c1[ k ] * s ) * ( 1 - t ) + ( c2[ k ] * ( 1 - s ) + c3[ k ] * s ) * t;

		}
		a.addUpdateRange( q * ring.verts * size, ring.verts * size );
		a.needsUpdate = true;

	}

}

export class ScorchMarks {

	readonly craters: THREE.Mesh;
	readonly furrows: THREE.Mesh;
	/** the floor's marks (ceramic and deck): a crater mesh and a furrow mesh, drawn over whichever floor they land on */
	readonly paved: THREE.Mesh[] = [];
	private readonly time = uniform( 0 );
	private readonly crater: MarkRing;
	private readonly furrow: MarkRing;
	private readonly floor: CitadelFloor | null;

	constructor( scene: THREE.Scene, floor: CitadelFloor | null, terrain: DesertTerrain ) {

		this.floor = floor;
		this.crater = markRing( CRATERS, { position: 3, mark: 4, heat: 2, level: 1 }, CRATER_GRID );
		this.furrow = markRing( FURROWS, { position: 3, mark: 4, line: 4, reheat: 4, level: 1 }, FURROW_GRID );
		( this.furrow.attributes.reheat.array as Float32Array ).fill( NEVER );
		// the floor under the fragment: sand (or no floor) takes the glass marks
		const under = floor ? floor.node( positionWorld.xz ) : null;
		const bare = under ? select( under.code.lessThan( 0.5 ), float( 1 ), float( 0 ) ) : float( 1 );
		this.craters = this.decal( this.crater.geometry, this.craterMaterial( bare, terrain.decal() ) );
		this.furrows = this.decal( this.furrow.geometry, this.furrowMaterial( bare, terrain.decal() ) );
		scene.add( this.craters, this.furrows );
		if ( floor ) {

			this.paved.push( this.decal( this.crater.geometry, this.floorCrater( floor ) ), this.decal( this.furrow.geometry, this.floorFurrow( floor ) ) );
			scene.add( ...this.paved );

		}

	}

	/** The floor's height under a mark's centre (m; 0 off the floor), for all four corners. */
	private levelValues( x: number, z: number ): { level: number[][] } {

		const h = this.floor ? this.floor.height( x, z ) : 0;
		const v = [ Number.isNaN( h ) ? 0 : h ];
		return { level: [ v, v, v, v ] };

	}

	/** A crater of fused glass at `center` (ground), `radius` m, `heat` 0..1+ (1: fused white-hot). */
	addCrater( center: THREE.Vector3, radius: number, heat: number ): void {

		const q = this.crater.written ++ % CRATERS;
		const r = radius * REACH;
		const seed = Math.random() * 10;
		const corners = [ [ - r, - r ], [ r, - r ], [ - r, r ], [ r, r ] ];
		writeMark( this.crater, q, {
			position: corners.map( ( [ x, z ] ) => [ center.x + x, LIFT, center.z + z ] ),
			mark: corners.map( ( [ x, z ] ) => [ x, z, radius, this.time.value ] ),
			heat: corners.map( () => [ heat, seed ] ),
			...this.levelValues( center.x, center.z ),
		} );

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
		// across = (-az, ax): a left-handed (u, v) frame on the ground, so the corners run the other way round to face up
		const corners = [ [ across, - margin ], [ - across, - margin ], [ across, length + margin ], [ - across, length + margin ] ];
		writeMark( this.furrow, q, {
			position: corners.map( ( [ u, v ] ) => [ from.x + ax * v - az * u, LIFT, from.z + az * v + ax * u ] ),
			mark: corners.map( ( [ u, v ] ) => [ u, v, hw, this.time.value ] ),
			line: corners.map( () => [ length, heat, ax, az ] ),
			reheat: corners.map( () => [ NEVER, 1, 0, 0 ] ),
			...this.levelValues( ( from.x + to.x ) / 2, ( from.z + to.z ) / 2 ),
		} );
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
		const v = [ this.time.value + delay, speed, at, 0 ];
		writeMark( this.furrow, handle % FURROWS, { reheat: [ v, v, v, v ] } );

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

	private craterMaterial( bare, land: GroundDecal ): THREE.MeshStandardNodeMaterial {

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
			height, x, y, axisX: vec3( 1, 0, 0 ), axisY: vec3( 0, 0, 1 ), glass, char, glow, land,
			// cracks show dark in the cold glass: the crust split and settled
			glassShade: float( 1 ).sub( cracks.mul( 0.45 ) ),
			opacity: float( 1 ).sub( smoothstep( REACH * 0.8, REACH * 0.98, r ) ).mul( float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) ) ).mul( bare ),
		} );

	}

	private furrowMaterial( bare, land: GroundDecal ): THREE.MeshStandardNodeMaterial {

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
		// a cold edge (heat 0) only cuts the sand: no glass, no soot
		const fused = smoothstep( 0.02, 0.2, heat );
		const glass = float( 1 ).sub( smoothstep( 0.35, 0.65, w ) ).mul( taper ).mul( fused );
		const char = float( 1 ).sub( smoothstep( 1.1, SOOT * 0.85, w ) ).mul( 0.85 ).mul( smoothstep( hw.mul( - 2.5 ), hw.mul( 1.5 ), end ) ).mul( fused );
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
			height, x: u, y: v, axisX: vec3( line.w.negate(), 0, line.z ), axisY: vec3( line.z, 0, line.w ), glass, char, glow, land,
			glassShade: float( 1 ),
			opacity: float( 1 ).sub( smoothstep( SOOT * 0.8, SOOT * 0.98, abs( u ).div( hw ) ) )
				.mul( smoothstep( hw.mul( - 2.4 ), hw.mul( - 0.5 ), end ) )
				.mul( float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) ) ).mul( bare ),
		} );

	}

	/**
	 * A blast on the floor. On ceramic: the skin spalled off to the grey
	 * substrate in a shallow ragged scar at the heart, radial cracks running
	 * out through the slab with a broken ring or two, soot charred over it all
	 * and thrown out in rays; the scar and cracks glow a moment. On deck: a
	 * shallow dished dent, blackened at the heart and ringed with temper
	 * colours (straw, then blue, then grey) where the heat spread through the
	 * plate, glowing a moment; soot, no cracks.
	 */
	private floorCrater( map: CitadelFloor ): THREE.MeshStandardNodeMaterial {

		const mark = attribute( 'mark', 'vec4' );
		const heatAttr = attribute( 'heat', 'vec2' );
		const R = mark.z, heat = heatAttr.x, seed = heatAttr.y;
		const age = this.time.sub( mark.w );
		const TAU = 2 * Math.PI;
		const polar = ( x, y ) => ( { r: length( vec2( x, y ) ).div( R ), a: atan( y, x ).div( TAU ).add( 0.5 ) } );
		const ridge = ( v, w ) => float( 1 ).sub( smoothstep( 0, w, abs( v.sub( 0.5 ) ) ) );
		// the scar's ragged edge (it follows the slab's weak substrate), and its floor of broken pits
		const scar = ( x, y ) => {

			const { r, a } = polar( x, y );
			const ragged = r.add( N( vec2( a.mul( 9 ).add( seed ), r.mul( 1.3 ) ) ).r.sub( 0.5 ).mul( 0.22 ) );
			return float( 1 ).sub( smoothstep( 0.3, 0.36, ragged ) );

		};
		const ceramicHeight = ( x, y ) => {

			// broken, not patterned: two broad octaves of pitting (a fine one aliased into a grid)
			const pits = N( vec2( x, y ).mul( 0.45 ).add( seed ) ).g.sub( 0.5 ).mul( 0.03 ).add( N( vec2( y, x ).mul( 1.1 ).add( seed.mul( 1.7 ) ) ).r.sub( 0.5 ).mul( 0.012 ) );
			return scar( x, y ).mul( float( - 0.035 ).add( pits ) );

		};
		// the plate gives as a smooth dish under the heart of the blast
		const deckHeight = ( x, y ) => {

			const { r } = polar( x, y );
			const t = float( 1 ).sub( min( r.div( 0.75 ), 1 ).pow( 2 ) );
			return t.mul( t ).mul( - 0.04 ).mul( R );

		};
		const x = mark.x, y = mark.y;
		const { r, a } = polar( x, y );
		const spall = scar( x, y );
		const K = 9;
		const spoke = a.mul( K ).add( N( vec2( r.mul( 0.5 ), a.mul( 3 ).add( seed ) ) ).a.sub( 0.5 ).mul( 0.3 ) );
		const reach = N( vec2( floor( spoke ).mul( 0.173 ).add( seed ), 0.61 ) ).r.mul( 0.8 ).add( 0.7 );
		const radial = ridge( fract( spoke ), float( 0.035 ).mul( float( 1.3 ).sub( r ) ).max( 0.004 ) )
			.mul( smoothstep( 0.26, 0.34, r ) ).mul( float( 1 ).sub( smoothstep( reach.sub( 0.25 ), reach, r ) ) );
		const ring = ridge( fract( r.mul( 1.6 ).add( N( vec2( a.mul( 5 ).add( seed ), 0.3 ) ).r.mul( 0.3 ) ) ), 0.018 )
			.mul( smoothstep( 0.4, 0.55, N( vec2( a.mul( 7 ), seed ) ).b ) ).mul( smoothstep( 0.35, 0.45, r ) ).mul( float( 1 ).sub( smoothstep( 1.0, 1.2, r ) ) );
		const cracks = max( radial, ring );
		const ray = N( vec2( a.mul( 14 ).add( seed.mul( 2 ) ), r.mul( 0.35 ) ) ).g.mul( 0.7 ).add( N( vec2( a.mul( 29 ).add( seed ), r.mul( 0.8 ) ) ).b.mul( 0.3 ) );
		const edge = r.add( N( positionWorld.xz.mul( 0.35 ) ).r.sub( 0.5 ).mul( 0.25 ) );
		const soot = float( 1 ).sub( smoothstep( 0.55, 1.35, edge ) ).mul( 0.8 )
			.add( smoothstep( 0.55, 0.8, ray ).mul( smoothstep( 0.7, 0.95, r ) ).mul( float( 1 ).sub( smoothstep( 1.2, 1.9, r ) ) ).mul( 0.5 ) ).clamp( 0, 0.88 );
		const core = exp( r.div( 0.4 ).pow( 2 ).negate() );
		const tScar = float( 1500 ).mul( heat ).mul( core ).mul( exp( age.div( 1.4 ).negate() ) ).add( AMBIENT );
		const tCrack = float( 1300 ).mul( heat ).mul( exp( r.div( 0.7 ).pow( 2 ).negate() ) ).mul( exp( age.div( 3.5 ).negate() ) ).add( AMBIENT );
		const glow = blackbody( tScar ).mul( spall ).add( blackbody( tCrack ).mul( cracks ) ).mul( GLOW );
		// deck: the dent's glow at its heart; the temper rings where the plate reached a few hundred degrees
		const dent = float( 1 ).sub( smoothstep( 0.55, 0.8, edge ) );
		const tDent = float( 1700 ).mul( heat ).mul( exp( r.div( 0.45 ).pow( 2 ).negate() ) ).mul( exp( age.div( 2.2 ).negate() ) ).add( AMBIENT );
		const temper = smoothstep( 0.3, 0.45, edge ).mul( float( 1 ).sub( smoothstep( 1.1, 1.45, edge ) ) ).mul( smoothstep( 0.05, 0.3, heat ) );
		return floorMaterial( {
			floor: map, height: ceramicHeight, deckHeight, x, y, axisX: vec3( 1, 0, 0 ), axisY: vec3( 0, 0, 1 ), spall, cracks, soot, glow,
			opacity: max( max( spall, cracks ), soot ).mul( float( 1 ).sub( smoothstep( REACH * 0.8, REACH * 0.98, r ) ) ).mul( float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) ) ),
			deck: {
				gouge: float( 0 ), burr: float( 0 ), soot: soot.mul( dent.mul( 0.4 ).add( 0.6 ) ), temper, temperAt: edge.sub( 0.3 ).div( 1.15 ),
				glow: blackbody( tDent ).mul( dent ).mul( GLOW ),
				opacity: max( max( dent, temper ), soot ).mul( float( 1 ).sub( smoothstep( REACH * 0.8, REACH * 0.98, r ) ) ).mul( float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) ) ),
			},
		} );

	}

	/**
	 * An edge dragged over the floor. On ceramic: a scored gouge down to the
	 * substrate, striated along the drag, with chipped lips and, for a hot
	 * edge, a halo of soot. On deck: a bright scored gouge with a raised burr
	 * along its lips and temper colour beside it. Both glow where the edge was
	 * hot (and again when a front reignites it).
	 */
	private floorFurrow( map: CitadelFloor ): THREE.MeshStandardNodeMaterial {

		const mark = attribute( 'mark', 'vec4' );
		const line = attribute( 'line', 'vec4' );
		const reheat = attribute( 'reheat', 'vec4' );
		const hw = mark.z, length_ = line.x, heat = line.y;
		const age = this.time.sub( mark.w );
		const u = mark.x, v = mark.y;
		const end = min( v, length_.sub( v ) );
		const taper = smoothstep( hw.mul( - 1 ), hw.mul( 3 ), end );
		// the gouge is narrower than the sand's trench: the floor gives way only where the edge bites
		const gougeW = ( uu, vv ) => abs( uu ).div( hw.mul( 0.55 ) ).add( N( vec2( vv.mul( 1.1 ), uu.mul( 0.5 ) ) ).r.sub( 0.5 ).mul( 0.35 ) );
		const ceramicHeight = ( uu, vv ) => {

			const e = min( vv, length_.sub( vv ) );
			const t = smoothstep( hw.mul( - 1 ), hw.mul( 3 ), e );
			const w = gougeW( uu, vv );
			const striae = N( vec2( uu.mul( 9 ), vv.mul( 0.4 ) ) ).g.sub( 0.5 ).mul( 0.2 );
			return float( 1 ).sub( w.mul( w ) ).max( 0 ).mul( float( - 0.05 ).add( striae.mul( 0.02 ) ) ).mul( t );

		};
		// deck: a shallower score, the metal it ploughed out standing as a burr along both lips
		const deckHeight = ( uu, vv ) => {

			const e = min( vv, length_.sub( vv ) );
			const t = smoothstep( hw.mul( - 1 ), hw.mul( 3 ), e );
			const w = gougeW( uu, vv );
			const lip = w.sub( 1.1 ).div( 0.25 );
			return float( 1 ).sub( w.mul( w ) ).max( 0 ).mul( - 0.018 ).add( exp( lip.mul( lip ).negate() ).mul( 0.006 ) ).mul( t );

		};
		const w = gougeW( u, v );
		const gouge = float( 1 ).sub( smoothstep( 0.8, 1.0, w ) ).mul( taper );
		const lips = smoothstep( 0.85, 1.05, w ).mul( float( 1 ).sub( smoothstep( 1.1, 1.7, w ) ) ).mul( smoothstep( 0.45, 0.6, N( vec2( v.mul( 2.3 ), u.mul( 3.1 ) ) ).b ) ).mul( taper );
		const fused = smoothstep( 0.02, 0.2, heat );
		const soot = float( 1 ).sub( smoothstep( 0.9, SOOT * 0.8, abs( u ).div( hw ).add( N( positionWorld.xz.mul( 0.7 ) ).r.sub( 0.5 ).mul( 0.5 ) ) ) ).mul( 0.8 ).mul( smoothstep( hw.mul( - 2.5 ), hw.mul( 1.5 ), end ) ).mul( fused );
		const speed = reheat.y, at = reheat.z;
		const off = abs( v.sub( at ) );
		const arrival = select( speed.greaterThan( 0 ), off.div( max( speed, 1e-3 ) ), max( at, length_.sub( at ) ).sub( off ).div( max( speed.negate(), 1e-3 ) ) );
		const front = this.time.sub( reheat.x ).sub( arrival );
		const burn = select( front.greaterThanEqual( 0 ), exp( front.div( COOL.front ).negate() ), float( 0 ) );
		const tFirst = float( 1700 ).mul( heat ).mul( exp( age.div( COOL.furrow ).negate() ) );
		const tBurn = float( 2000 ).mul( burn );
		const temperature = max( tFirst, tBurn ).mul( exp( w.mul( w ).mul( - 1.5 ) ) ).mul( taper ).add( AMBIENT );
		const glow = blackbody( temperature ).mul( gouge ).mul( GLOW );
		const fade = smoothstep( hw.mul( - 2.4 ), hw.mul( - 0.5 ), end ).mul( float( 1 ).sub( smoothstep( LIFE * 0.6, LIFE, age ) ) );
		const burr = smoothstep( 0.9, 1.1, w ).mul( float( 1 ).sub( smoothstep( 1.25, 1.5, w ) ) ).mul( taper );
		const temperBand = smoothstep( 1.2, 1.6, w ).mul( float( 1 ).sub( smoothstep( 2.2, 3.2, w ) ) ).mul( taper ).mul( fused );
		return floorMaterial( {
			floor: map, height: ceramicHeight, deckHeight, x: u, y: v, axisX: vec3( line.w.negate(), 0, line.z ), axisY: vec3( line.z, 0, line.w ),
			spall: gouge, cracks: lips.mul( 0.5 ), soot, glow,
			opacity: max( max( gouge, lips.mul( 0.8 ) ), soot ).mul( fade ),
			deck: {
				gouge, burr, soot: soot.mul( 0.6 ), temper: temperBand, temperAt: w.sub( 1.2 ).div( 2 ), glow,
				opacity: max( max( gouge, burr ), max( temperBand, soot.mul( 0.6 ) ) ).mul( fade ),
			},
		} );

	}

}

interface FloorMark {
	floor: CitadelFloor;
	/** relief (m) at local coordinates on ceramic and on deck */
	height: ( x, y ) => any;
	deckHeight: ( x, y ) => any;
	x: any;
	y: any;
	axisX: any;
	axisY: any;
	/** ceramic: 0..1 skin gone to the substrate; 0..1 a crack; 0..1 soot */
	spall: any;
	cracks: any;
	soot: any;
	glow: any;
	opacity: any;
	/** deck: 0..1 bright scored metal, burr, soot, temper tint and where across it the tint is (0 hottest .. 1 coolest) */
	deck: { gouge: any; burr: any; soot: any; temper: any; temperAt: any; glow: any; opacity: any };
}

/** Temper colours of steel by how hot it got, from the hottest band out: straw, bronze, purple-blue, then the plate's grey. */
function temperColor( t ) {

	const straw = vec3( 0.62, 0.48, 0.22 ), bronze = vec3( 0.42, 0.26, 0.12 ), blue = vec3( 0.14, 0.17, 0.36 ), grey = vec3( 0.2, 0.21, 0.22 );
	const k = t.clamp( 0, 1 );
	return mix( mix( straw, bronze, smoothstep( 0, 0.35, k ) ), mix( blue, grey, smoothstep( 0.7, 1, k ) ), smoothstep( 0.3, 0.6, k ) );

}

/**
 * The floor's marks, drawn over whichever floor they land on: each vertex at
 * the floor's height there (a ramp's included; a vertex over another level
 * stays on the mark's own), each fragment only over the floor of the level
 * the vertex stage put it on, and not on sand (the glass marks take that).
 * Ceramic: soot a dark translucent film, spalled scars showing the grey
 * substrate and dark cracks, both opaque. Deck: soot, temper tints, and the
 * bright metal of a gouge and its burr. Relief through the normal.
 */
function floorMaterial( m: FloorMark ): THREE.MeshStandardNodeMaterial {

	const material = new THREE.MeshStandardNodeMaterial( { transparent: true, depthWrite: false } );
	material.polygonOffset = true;
	material.polygonOffsetFactor = - 2;
	material.polygonOffsetUnits = - 2;
	const level = attribute( 'level', 'float' );
	const under = m.floor.node( positionLocal.xz ).height;
	const y = select( abs( under.sub( level ) ).lessThan( FOLLOW ), under, level );
	const vFloor = varying( y );
	material.positionNode = vec3( positionLocal.x, y.add( 0.004 ), positionLocal.z );
	const here = m.floor.node( positionWorld.xz );
	const deck = select( here.code.greaterThan( 1.5 ), float( 1 ), float( 0 ) );
	const on = select( here.code.greaterThan( 0.5 ).and( abs( here.height.sub( vFloor ) ).lessThan( SAME_LEVEL ) ), float( 1 ), float( 0 ) );
	const e = 0.03;
	const relief = ( height ) => {

		const h0 = height( m.x, m.y );
		const gx = height( m.x.add( e ), m.y ).sub( h0 ).div( e );
		const gy = height( m.x, m.y.add( e ) ).sub( h0 ).div( e );
		return vec3( 0, 1, 0 ).sub( m.axisX.mul( gx ) ).sub( m.axisY.mul( gy ) );

	};
	material.normalNode = mix( relief( m.height ), relief( m.deckHeight ), deck ).normalize().transformDirection( cameraViewMatrix );
	// ceramic: the substrate under the satin skin, a little pitted
	const grain = N( positionWorld.xz.mul( 1.3 ).add( N( positionWorld.xz.mul( 0.21 ) ).rg.mul( 2 ) ) );
	const substrate = mix( vec3( 0.2, 0.195, 0.185 ), vec3( 0.29, 0.28, 0.265 ), smoothstep( 0.35, 0.7, grain.r ) ).mul( grain.g.mul( 0.15 ).add( 0.88 ) );
	const soot = mix( vec3( 0.025, 0.024, 0.022 ), vec3( 0.06, 0.055, 0.05 ), grain.b );
	const scarred = mix( substrate.mul( float( 1 ).sub( m.soot.mul( 0.6 ) ) ), vec3( 0.03, 0.028, 0.026 ), m.cracks );
	const ceramicColor = mix( soot, scarred, max( m.spall, m.cracks ) );
	// deck: soot and temper over the plate, the gouge and burr bright where the edge cut fresh metal
	const d = m.deck;
	const plate = mix( soot, temperColor( d.temperAt ), d.temper.mul( float( 1 ).sub( d.soot.mul( 0.7 ) ) ) );
	const bright = max( d.gouge, d.burr.mul( 0.7 ) );
	const deckColor = mix( plate, vec3( 0.55, 0.55, 0.56 ), bright );
	material.colorNode = mix( ceramicColor, deckColor, deck );
	material.roughnessNode = mix( mix( float( 0.96 ), float( 0.9 ), m.spall ), mix( float( 0.6 ), float( 0.22 ), bright ), deck );
	material.metalnessNode = mix( float( 0 ), mix( float( 0.4 ), float( 1 ), max( bright, d.temper ) ), deck );
	material.emissiveNode = mix( m.glow, d.glow, deck );
	material.opacityNode = mix( m.opacity, d.opacity, deck ).mul( on );
	return material;

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
	/** the mark's vertex on the landform and the land's slope under it */
	land: GroundDecal;
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
	material.positionNode = m.land.position;
	const ground = groundSurface( positionWorld.xz, m.land.slope );
	// glass sets smooth: the wind ripples are gone under it (the land's own slope stays)
	const slope = ground.slope.sub( m.land.slope ).mul( float( 1 ).sub( m.glass ) ).add( m.land.slope );
	const normal = vec3( slope.x, 1, slope.y ).sub( m.axisX.mul( gx ) ).sub( m.axisY.mul( gy ) ).normalize();
	material.normalNode = normal.transformDirection( cameraViewMatrix );
	if ( m.land.occlusion ) material.aoNode = m.land.occlusion( positionWorld, normal );
	const grain = N( positionWorld.xz.mul( 1.9 ) );
	// trinitite: an olive-black glass, a little bubbled
	const glassColor = mix( vec3( 0.022, 0.024, 0.016 ), vec3( 0.055, 0.058, 0.036 ), grain.g ).mul( m.glassShade );
	const charred = ground.color.mul( float( 1 ).sub( m.char.mul( 0.78 ) ) );
	material.colorNode = mix( charred, glassColor, m.glass );
	material.roughnessNode = mix( mix( ground.roughness, float( 0.97 ), m.char ), grain.b.mul( 0.12 ).add( 0.1 ), m.glass );
	material.metalnessNode = float( 0 );
	material.emissiveNode = m.glow;
	material.opacityNode = m.opacity.mul( decalRange() );
	return material;

}
