import * as THREE from 'three/webgpu';
import { slab, hullBox, cyl, place, merge } from './geometry.ts';

type MaterialSet = Record<string, THREE.Material>;
type Part = [THREE.BufferGeometry, THREE.Material];
interface CarPanelDefinition { name: string; parts: Part[]; s: number; pivot?: THREE.Vector3 }

/* =====================================================================
 *  Cybertruck body, authored in CAR space (+z forward, y up, x side).
 *  Every piece that moves independently during the transformation is a
 *  separate panel. Geometry stays in car coordinates, so a panel's car
 *  pose is simply the identity.
 * ===================================================================== */

export const C = {
	LZ: 2.86, APEX: 0.05, XS: 1.0,
	FA: 1.95, RA: - 1.86, WR: 0.445, WX: 0.86,
	SILL: 0.5, G: 0.006,
	Y_NOSE: 1.06, Y_APEX: 1.8, Y_TAIL: 1.42
};
const { LZ, APEX, XS, FA, RA, SILL, G } = C;

export const yTop = ( z ) => z >= APEX ? C.Y_NOSE + ( LZ - z ) / ( LZ - APEX ) * ( C.Y_APEX - C.Y_NOSE ) : C.Y_APEX - ( APEX - z ) / ( APEX + LZ ) * ( C.Y_APEX - C.Y_TAIL );
export const xTop = ( z ) => z >= APEX ? 0.93 - ( LZ - z ) / ( LZ - APEX ) * 0.265 : 0.665 + ( APEX - z ) / ( APEX + LZ ) * 0.155;
export const yBelt = ( z ) => z > 1.22 ? 1.0 + ( LZ - z ) / ( LZ - 1.22 ) * 0.17 : 1.17 + ( 1.22 - z ) / ( 1.22 + LZ ) * 0.13;

/** is a car-space point inside the body shell (with margin)? */
export function insideShell( x, y, z, m = 0.012 ) {

	if ( z > LZ - m || z < - LZ + m || y < 0.36 + m ) return false;
	const top = yTop( z ) - m;
	if ( y > top ) return false;
	const ax = Math.abs( x );
	if ( ax > XS - m ) return false;
	const belt = yBelt( z );
	if ( y > belt ) {

		const k = ( y - belt ) / ( yTop( z ) - belt );
		if ( ax > XS - k * ( XS - xTop( z ) ) - m ) return false;

	}

	return true;

}

const E1 = ( s, z ) => [ s * XS, yBelt( z ), z ];
const E2 = ( s, z ) => [ s * xTop( z ), yTop( z ), z ];
const TOP = ( x, z ) => [ x, yTop( z ), z ];
const up = ( pts, d ) => pts.map( ( p ) => [ p[ 0 ], p[ 1 ] + d, p[ 2 ] ] );
const side = ( s, zy, dx = 0 ) => zy.map( ( [ z, y ] ) => [ s * ( XS + dx ), y, z ] );
const topHalf = ( s, z0, z1, x0 = 0.006 ) => [ TOP( s * x0, z0 ), TOP( s * xTop( z0 ), z0 ), TOP( s * xTop( z1 ), z1 ), TOP( s * x0, z1 ) ];
const lerp3 = ( a, b, t ) => a.map( ( v, i ) => v + ( b[ i ] - v ) * t );

const arch = ( za ) => [ [ za + 0.64, SILL ], [ za + 0.64, 0.62 ], [ za + 0.4, 0.97 ], [ za - 0.4, 0.97 ], [ za - 0.64, 0.62 ], [ za - 0.64, SILL ] ];
const archOut = ( za ) => [ [ za + 0.74, SILL - 0.08 ], [ za + 0.74, 0.65 ], [ za + 0.455, 1.06 ], [ za - 0.455, 1.06 ], [ za - 0.74, 0.65 ], [ za - 0.74, SILL - 0.08 ] ];

/** window chamfer between beltline and roof edge, plus a black trim at its base */
function chamferWith( s, z0, z1, M: MaterialSet, glass = true ): Part[] {

	const pane = slab( [ E1( s, z0 ), E1( s, z1 ), E2( s, z1 ), E2( s, z0 ) ], { out: [ s, 0.6, 0 ], t: glass ? 0.025 : 0.035 } );
	const out: Part[] = [ [ pane, glass ? M.glass : M.steel ] ];
	if ( glass ) {

		const a0 = E1( s, z0 ), a1 = E1( s, z1 );
		const b0 = lerp3( a0, E2( s, z0 ), 0.07 ), b1 = lerp3( a1, E2( s, z1 ), 0.07 );
		const n = [ s * 0.0025, 0.0015, 0 ];
		const off = ( p ) => [ p[ 0 ] + n[ 0 ], p[ 1 ] + n[ 1 ], p[ 2 ] ];
		out.push( [ slab( [ a0, a1, b1, b0 ].map( off ), { out: [ s, 0.6, 0 ], t: 0.006, b: 0.0015 } ), M.plastic ] );

	}

	return out;

}

function liner( s, za, M: MaterialSet ): Part {

	const g = [];
	const P = arch( za );
	for ( let i = 1; i < 4; i ++ ) {

		const [ z0, y0 ] = P[ i ], [ z1, y1 ] = P[ i + 1 ];
		g.push( slab( [ [ s * 0.64, y0, z0 ], [ s * 0.985, y0, z0 ], [ s * 0.985, y1, z1 ], [ s * 0.64, y1, z1 ] ], { out: [ 0, - 1, 0 ], t: 0.02 } ) );

	}

	return [ merge( g ), M.interior ];

}

function flare( s, za, M: MaterialSet ): Part {

	const pts = [ ...arch( za ), ...archOut( za ).reverse() ].map( ( [ z, y ] ) => [ s * ( XS + 0.045 ), y, z ] );
	return [ slab( pts, { out: [ s, 0, 0 ], t: 0.085, b: 0.014 } ), M.plastic ];

}

export function buildCar( M: MaterialSet ) {

	const P: Record<string, CarPanelDefinition> = {};
	const add = ( name: string, parts: Part[], s = 0 ) => ( P[ name ] = { name, parts, s } );

	for ( const [ S, s ] of [ [ 'R', 1 ], [ 'L', - 1 ] ] as const ) {

		/* ---------------- front half (legs) ---------------- */
		const K = 1.22, A = 2.6;

		// windshield half + cowl band
		add( 'glassWS' + S, [
			[ slab( topHalf( s, K - G, APEX + G ), { out: [ 0, 1, 0 ], t: 0.03, b: 0.006 } ), M.glass ],
			[ slab( up( topHalf( s, K - G, K - 0.1, 0.006 ), 0.004 ), { out: [ 0, 1, 0 ], t: 0.01, b: 0.002 } ), M.plastic ]
		], s );

		// front door: lower skin, window, trim
		add( 'door' + S, [
			[ slab( side( s, [ [ K - G, SILL ], [ G, SILL ], [ G, yBelt( G ) ], [ K - G, yBelt( K - G ) ] ] ), { out: [ s, 0, 0 ], t: 0.035 } ), M.steel ]
		], s );
		add( 'winF' + S, chamferWith( s, K - G, G, M ), s );

		add( 'mirror' + S, [ [ merge( [
			place( hullBox( 0.055, 0.1, 0.2, { c: 0.022, top: [ 0.6, 0.7 ] } ), { p: [ s * ( XS + 0.075 ), yBelt( 1.05 ) + 0.12, 1.02 ], r: [ 0, s * 0.18, 0 ] } ),
			place( hullBox( 0.1, 0.03, 0.06, { c: 0.01 } ), { p: [ s * ( XS + 0.03 ), yBelt( 1.05 ) + 0.07, 1.06 ] } )
		] ), M.plastic ] ], s );

		add( 'rockerF' + S, [ [ slab( [ [ s * ( XS + 0.025 ), 0.38, K - 0.02 ], [ s * ( XS + 0.025 ), 0.38, 0.02 ], [ s * ( XS + 0.005 ), SILL + 0.035, 0.02 ], [ s * ( XS + 0.005 ), SILL + 0.035, K - 0.02 ] ], { out: [ s, - 0.2, 0 ], t: 0.09, b: 0.012 } ), M.plastic ] ], s );

		add( 'floorT' + S, [ [ place( hullBox( 0.72, 0.08, 1.0, { c: 0.025 } ), { p: [ s * 0.44, 0.41, 0.6 ] } ), M.graphite ] ], s );

		// hood half with frunk seam
		add( 'hood' + S, [
			[ slab( topHalf( s, A - G, K + G ), { out: [ 0, 1, 0 ], t: 0.05, b: 0.01 } ), M.steel ],
			[ slab( up( [ TOP( s * 0.03, 1.46 ), TOP( s * 0.62, 1.46 ), TOP( s * 0.62, 1.45 ), TOP( s * 0.03, 1.45 ) ], 0.0015 ), { out: [ 0, 1, 0 ], t: 0.003, b: 0.0006 } ), M.plastic ]
		], s );

		// front fender: skin (with arch), chamfer, flare, well, marker
		add( 'fender' + S, [
			[ slab( side( s, [
				[ K + G, yBelt( K + G ) ], [ K + G, SILL ], [ FA - 0.64, SILL ], [ FA - 0.64, 0.62 ], [ FA - 0.4, 0.97 ], [ FA + 0.4, 0.97 ],
				[ FA + 0.64, 0.62 ], [ A - G, 0.62 ], [ A - G, yBelt( A - G ) ]
			] ), { out: [ s, 0, 0 ], t: 0.035 } ), M.steel ],
			...chamferWith( s, A - G, K + G, M, false ),
			flare( s, FA, M ),
			liner( s, FA, M ),
			[ slab( side( s, [ [ A - 0.04, 0.88 ], [ A - 0.18, 0.88 ], [ A - 0.18, 0.905 ], [ A - 0.04, 0.905 ] ], 0.003 ), { out: [ s, 0, 0 ], t: 0.01, b: 0.002 } ), M.lightAmber ]
		], s );

		add( 'floorS' + S, [ [ place( hullBox( 0.46, 0.08, 1.1, { c: 0.025 } ), { p: [ s * 0.26, 0.41, 1.95 ] } ), M.graphite ] ], s );

		// nose: hood tip, chamfer tip, fender tip, raked fascia with light bar, bumper
		const fz = ( y ) => LZ - 0.045 + ( y - 0.62 ) / 0.44 * 0.045;
		const nose: Part[] = [
			[ slab( topHalf( s, LZ - 0.002, A + G ), { out: [ 0, 1, 0 ], t: 0.05, b: 0.01 } ), M.steel ],
			[ slab( [ E1( s, LZ ), E1( s, A + G ), E2( s, A + G ), E2( s, LZ ) ], { out: [ s, 0.6, 0 ], t: 0.035 } ), M.steel ],
			[ slab( side( s, [ [ A + G, 0.62 ], [ fz( 0.62 ), 0.62 ], [ LZ, yBelt( LZ ) ], [ A + G, yBelt( A + G ) ] ] ), { out: [ s, 0, 0 ], t: 0.035 } ), M.steel ],
			[ slab( [ [ s * 0.006, 0.625, fz( 0.625 ) ], [ s * XS, 0.625, fz( 0.625 ) ], [ s * XS, 1.01, fz( 1.01 ) ], [ s * 0.006, 1.01, fz( 1.01 ) ] ], { out: [ 0, 0.1, 1 ], t: 0.05 } ), M.steel ],
			// light bar in a black channel, full width
			[ place( hullBox( 0.994, 0.05, 0.05, { c: 0.008 } ), { p: [ s * 0.503, 1.035, LZ - 0.022 ] } ), M.plastic ],
			[ place( hullBox( 0.985, 0.018, 0.04, { c: 0.004 } ), { p: [ s * 0.5, 1.036, LZ - 0.012 ] } ), M.lightWhite ],
			// bumper: stepped black block, fog lamp, tow point
			[ merge( [
				place( hullBox( 0.98, 0.2, 0.3, { c: 0.035, top: [ 1, 0.9 ] } ), { p: [ s * 0.495, 0.52, LZ - 0.19 ] } ),
				place( hullBox( 0.96, 0.1, 0.22, { c: 0.03 } ), { p: [ s * 0.49, 0.39, LZ - 0.2 ] } )
			] ), M.plastic ],
			[ place( hullBox( 0.2, 0.03, 0.02, { c: 0.008 } ), { p: [ s * 0.76, 0.56, LZ - 0.036 ] } ), M.lightWhite ],
			[ place( hullBox( 0.12, 0.05, 0.03, { c: 0.01 } ), { p: [ s * 0.36, 0.44, LZ - 0.08 ] } ), M.graphite ]
		];
		add( 'nose' + S, nose, s );

		/* ---------------- rear half (torso + arms) ---------------- */
		add( 'roof' + S, [ [ slab( [ TOP( s * 0.006, APEX - G ), TOP( s * xTop( APEX - G ), APEX - G ), TOP( s * xTop( - 1.0 + G ), - 1.0 + G ), TOP( s * 0.006, - 1.0 + G ) ], { out: [ 0, 1, 0 ], t: 0.03, b: 0.006 } ), M.glass ] ], s );

		const slats = ( z0, z1 ) => {

			const g = [];
			for ( let i = 1; i < 6; i ++ ) {

				const z = z0 - ( z0 - z1 ) * ( i / 6 );
				g.push( slab( up( [ TOP( s * 0.03, z ), TOP( s * ( xTop( z ) - 0.03 ), z ), TOP( s * ( xTop( z ) - 0.03 ), z - 0.008 ), TOP( s * 0.03, z - 0.008 ) ], 0.002 ), { out: [ 0, 1, 0 ], t: 0.004, b: 0.001 } ) );

			}

			return merge( g );

		};

		add( 'tonA' + S, [ [ slab( topHalf( s, - 1.0 - G, - 1.93 + G ), { out: [ 0, 1, 0 ], t: 0.04 } ), M.tonneau ], [ slats( - 1.0 - G, - 1.93 + G ), M.plastic ] ], s );
		add( 'tonB' + S, [ [ slab( topHalf( s, - 1.93 - G, - LZ + 0.003 ), { out: [ 0, 1, 0 ], t: 0.04 } ), M.tonneau ], [ slats( - 1.93 - G, - LZ + 0.003 ), M.plastic ] ], s );

		// sail + black bed rail along the roof edge
		add( 'sail' + S, [
			...chamferWith( s, - 1.0 - G, - LZ, M, false ),
			[ slab( up( [ E2( s, - 1.0 - G ), lerp3( E2( s, - 1.0 - G ), E1( s, - 1.0 - G ), 0.06 ), lerp3( E2( s, - LZ ), E1( s, - LZ ), 0.06 ), E2( s, - LZ ) ], 0.003 ), { out: [ s, 0.6, 0 ], t: 0.01, b: 0.002 } ), M.plastic ]
		], s );

		add( 'quarter' + S, [
			[ slab( side( s, [
				[ - 1.0 - G, yBelt( - 1.0 - G ) ], [ - 1.0 - G, SILL ], [ RA + 0.64, SILL ], [ RA + 0.64, 0.62 ], [ RA + 0.4, 0.97 ], [ RA - 0.4, 0.97 ], [ RA - 0.64, 0.62 ],
				[ - LZ, 0.62 ], [ - LZ, yBelt( - LZ ) ]
			] ), { out: [ s, 0, 0 ], t: 0.035 } ), M.steel ],
			flare( s, RA, M ),
			liner( s, RA, M ),
			[ slab( side( s, [ [ - LZ + 0.04, 0.88 ], [ - LZ + 0.18, 0.88 ], [ - LZ + 0.18, 0.905 ], [ - LZ + 0.04, 0.905 ] ], 0.003 ), { out: [ s, 0, 0 ], t: 0.01, b: 0.002 } ), M.lightRed ]
		], s );

		add( 'rdoor' + S, [
			[ slab( side( s, [ [ - G, SILL ], [ - 1.0 + G, SILL ], [ - 1.0 + G, yBelt( - 1.0 + G ) ], [ - G, yBelt( - G ) ] ] ), { out: [ s, 0, 0 ], t: 0.035 } ), M.steel ]
		], s );
		add( 'winR' + S, chamferWith( s, - G, - 1.0 + G, M ), s );

		add( 'rockerR' + S, [ [ slab( [ [ s * ( XS + 0.025 ), 0.38, - 0.02 ], [ s * ( XS + 0.025 ), 0.38, - 0.98 ], [ s * ( XS + 0.005 ), SILL + 0.035, - 0.98 ], [ s * ( XS + 0.005 ), SILL + 0.035, - 0.02 ] ], { out: [ s, - 0.2, 0 ], t: 0.09, b: 0.012 } ), M.plastic ] ], s );

		add( 'bumper' + S, [
			[ merge( [
				place( hullBox( 0.98, 0.2, 0.3, { c: 0.035, top: [ 1, 0.9 ] } ), { p: [ s * 0.495, 0.52, - LZ + 0.18 ] } ),
				place( hullBox( 0.96, 0.1, 0.24, { c: 0.03 } ), { p: [ s * 0.49, 0.39, - LZ + 0.2 ] } )
			] ), M.plastic ],
			[ place( hullBox( 0.14, 0.035, 0.02, { c: 0.006 } ), { p: [ s * 0.84, 0.54, - LZ + 0.024 ] } ), M.reflector ]
		], s );

	}

	// tailgate with ribbed graphite inner face (it becomes the collar behind the head)
	{

		const z = - LZ;
		const ribs = [];
		for ( let i = 0; i < 7; i ++ ) ribs.push( place( hullBox( 0.05, 0.36, 0.03, { c: 0.01 } ), { p: [ - 0.75 + i * 0.25, 0.9, z + 0.07 ] } ) );
		add( 'tailgate', [
			[ slab( [ [ - XS, 0.63, z ], [ XS, 0.63, z ], [ XS, 1.168, z ], [ - XS, 1.168, z ] ], { out: [ 0, 0, - 1 ], t: 0.05 } ), M.steel ],
			[ merge( [ place( hullBox( 1.84, 0.46, 0.02, { c: 0.008 } ), { p: [ 0, 0.9, z + 0.056 ] } ), ...ribs ] ), M.graphite ]
		] );

		add( 'taillight', [
			[ slab( [ [ - 0.985, 1.185, z - 0.004 ], [ 0.985, 1.185, z - 0.004 ], [ 0.985, 1.235, z - 0.004 ], [ - 0.985, 1.235, z - 0.004 ] ], { out: [ 0, 0, - 1 ], t: 0.02, b: 0.003 } ), M.lightRed ],
			[ slab( [ [ - XS, 1.172, z ], [ XS, 1.172, z ], [ XS, 1.247, z ], [ - XS, 1.247, z ] ], { out: [ 0, 0, - 1 ], t: 0.03, b: 0.003 } ), M.plastic ],
			[ slab( [ [ - 0.99, 1.253, z ], [ 0.99, 1.253, z ], [ xTop( z ), yTop( z ) - 0.004, z ], [ - xTop( z ), yTop( z ) - 0.004, z ] ], { out: [ 0, 0, - 1 ], t: 0.04 } ), M.steel ]
		] );

	}

	// underbody: three armoured plates (they become the robot's back)
	const ribs = ( z0, n, w ) => merge( Array.from( { length: n }, ( _, i ) => place( hullBox( w, 0.025, 0.06, { c: 0.01 } ), { p: [ 0, 0.355, z0 - i * 0.2 ] } ) ) );
	add( 'floorP', [ [ place( hullBox( 1.8, 0.09, 0.6, { c: 0.03 } ), { p: [ 0, 0.41, - 0.31 ] } ), M.darkSteel ], [ ribs( - 0.1, 3, 1.5 ), M.graphite ] ] );
	add( 'floorW', [ [ place( hullBox( 1.4, 0.09, 0.6, { c: 0.03 } ), { p: [ 0, 0.41, - 0.93 ] } ), M.darkSteel ], [ ribs( - 0.72, 3, 1.1 ), M.graphite ] ] );
	add( 'floorC', [ [ place( hullBox( 1.2, 0.09, 1.4, { c: 0.03 } ), { p: [ 0, 0.41, - 1.95 ] } ), M.darkSteel ], [ ribs( - 1.4, 6, 0.9 ), M.graphite ] ] );

	// single wiper blade resting on the windshield base
	{

		const a = [ - 0.66, yTop( 1.11 ) + 0.012, 1.11 ], b = [ 0.52, yTop( 1.02 ) + 0.012, 1.02 ];
		const dir = new THREE.Vector3( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] );
		const len = dir.length();
		const blade = hullBox( len, 0.018, 0.022, { c: 0.006 } );
		blade.rotateY( - Math.atan2( dir.z, dir.x ) );
		blade.translate( ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 );
		const hub = place( cyl( 0.035, 0.03, { seg: 10 } ), { p: [ a[ 0 ], a[ 1 ], a[ 2 ] + 0.02 ] } );
		add( 'wiper', [ [ merge( [ blade, hub ] ), M.plastic ] ], - 1 );
		P.wiper.pivot = new THREE.Vector3( a[ 0 ], a[ 1 ], a[ 2 ] + 0.02 );

	}

	return P;

}

/* ------------------------------------------------------------------ */
/*  Wheels (authored at the origin, axle along x, outer face +x)       */
/* ------------------------------------------------------------------ */
export function wheelGeometry( M: MaterialSet ): Part[] {

	const prof = [
		[ 0.29, - 0.12 ], [ 0.33, - 0.15 ], [ 0.39, - 0.158 ], [ 0.425, - 0.15 ], [ 0.438, - 0.13 ], [ 0.442, - 0.1 ],
		[ 0.442, 0.1 ], [ 0.438, 0.13 ], [ 0.425, 0.15 ], [ 0.39, 0.158 ], [ 0.33, 0.15 ], [ 0.29, 0.12 ]
	].map( ( [ r, y ] ) => new THREE.Vector2( r, y ) );
	const tyre = new THREE.LatheGeometry( prof, 64 );
	tyre.rotateZ( - Math.PI / 2 );

	const blocks = [];
	const N = 32;
	const blk = hullBox( 0.1, 0.024, 0.09, { c: 0.012, top: [ 0.85, 0.85 ] } );
	const lug = hullBox( 0.034, 0.055, 0.06, { c: 0.01 } );
	for ( let i = 0; i < N; i ++ ) {

		for ( const row of [ - 1, 1 ] ) {

			const g = blk.clone();
			g.translate( row * 0.066, 0.451, 0 );
			g.rotateX( ( i + ( row > 0 ? 0.5 : 0 ) ) / N * Math.PI * 2 );
			blocks.push( g );

		}

		for ( const sd of [ - 1, 1 ] ) {

			const g = lug.clone();
			g.translate( sd * 0.146, 0.405, 0 );
			g.rotateX( ( i + 0.25 ) / N * Math.PI * 2 );
			blocks.push( g );

		}

	}

	const disc = cyl( 0.3, 0.03, { seg: 48, axis: 'x' } );
	disc.translate( 0.13, 0, 0 );
	const back = cyl( 0.29, 0.02, { seg: 32, axis: 'x' } );
	back.translate( - 0.1, 0, 0 );
	const lip = new THREE.TorusGeometry( 0.298, 0.013, 6, 48 );
	lip.rotateY( Math.PI / 2 );
	lip.translate( 0.145, 0, 0 );
	const spokes = [];
	for ( let i = 0; i < 6; i ++ ) {

		const g = slab( [ [ 0.16, - 0.028, 0.075 ], [ 0.16, 0.028, 0.075 ], [ 0.152, 0.055, 0.28 ], [ 0.152, - 0.018, 0.28 ] ], { out: [ 1, 0, 0 ], t: 0.02, b: 0.006 } );
		g.rotateX( i / 6 * Math.PI * 2 );
		spokes.push( g );

	}

	const hub = cyl( 0.075, 0.03, { seg: 6, axis: 'x' } );
	hub.translate( 0.165, 0, 0 );
	const cap = cyl( 0.04, 0.012, { seg: 6, axis: 'x' } );
	cap.translate( 0.183, 0, 0 );

	return [
		[ merge( [ tyre, ...blocks ] ), M.rubber ],
		[ merge( [ disc, back ] ), M.aeroDark ],
		[ merge( [ lip, ...spokes ] ), M.aero ],
		[ merge( [ hub ] ), M.graphite ],
		[ cap, M.darkSteel ]
	];

}
