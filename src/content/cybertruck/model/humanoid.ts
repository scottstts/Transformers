import * as THREE from 'three/webgpu';
import { slab, hullBox, hull, cyl, place, merge } from './geometry.ts';

/* =====================================================================
 *  Endoskeleton: a humanoid rig (robot space: y up, z forward, feet on
 *  the ground). Car panels are armour mounted on these bones; the robot's
 *  own mechanical structure below is authored in each bone's local frame.
 * ===================================================================== */

export const HIP = 3.15; // pelvis height, legs straight
export const ROBOT_Z = 0.3; // where the robot stands, in vehicle space

export function boneList() {

	const B: Array<[string, string | null, [number, number, number]]> = [
		[ 'pelvis', null, [ 0, HIP, 0 ] ],
		[ 'spine', 'pelvis', [ 0, 0.28, 0 ] ],
		[ 'chest', 'spine', [ 0, 0.42, 0 ] ],
		[ 'neck', 'chest', [ 0, 1.2, - 0.05 ] ],
		[ 'head', 'neck', [ 0, 0.2, 0.02 ] ]
	];
	for ( const [ S, s ] of [ [ 'R', 1 ], [ 'L', - 1 ] ] as const ) {

		B.push(
			[ 'clav' + S, 'chest', [ s * 0.35, 1.02, - 0.05 ] ],
			[ 'upper' + S, 'clav' + S, [ s * 0.95, 0, 0 ] ],
			[ 'fore' + S, 'upper' + S, [ 0, - 1.12, 0 ] ],
			[ 'hand' + S, 'fore' + S, [ 0, - 1.05, 0 ] ],
			[ 'thigh' + S, 'pelvis', [ s * 0.55, - 0.08, 0 ] ],
			[ 'shin' + S, 'thigh' + S, [ 0, - 1.36, 0 ] ],
			[ 'foot' + S, 'shin' + S, [ 0, - 1.38, 0 ] ],
			[ 'toe' + S, 'foot' + S, [ 0, - 0.22, 0.1 ] ]
		);
		for ( let f = 0; f < 4; f ++ ) {

			const z = - 0.13 + f * 0.087;
			B.push( [ `f${ f }a${ S }`, 'hand' + S, [ 0, - 0.34, z ] ], [ `f${ f }b${ S }`, `f${ f }a${ S }`, [ 0, - 0.13, 0 ] ], [ `f${ f }c${ S }`, `f${ f }b${ S }`, [ 0, - 0.11, 0 ] ] );

		}

		B.push( [ 'thumbA' + S, 'hand' + S, [ - s * 0.02, - 0.12, 0.2 ] ], [ 'thumbB' + S, 'thumbA' + S, [ 0, - 0.14, 0.02 ] ] );

	}

	return B;

}

export const LEG = { thigh: 1.36, shin: 1.38, ankle: 0.33 };

/* ------------------------------------------------------------------ */
/*  Robot structure geometry (bone-local)                               */
/* ------------------------------------------------------------------ */
const hb = ( w, h, d, p, o ) => place( hullBox( w, h, d, o ), { p } );
const cy = ( r, len, axis, p, seg = 14, r2 = r ) => place( cyl( r, len, { seg, axis, r2 } ), { p } );
const ball = ( r, p ) => place( new THREE.IcosahedronGeometry( r, 1 ), { p } );

export function buildStructure( M ) {

	const S = {}; // bone -> [ [geo, mat], ... ]
	const add = ( bone, geo, mat ) => ( S[ bone ] = S[ bone ] || [] ).push( [ geo, mat ] );

	/* pelvis */
	add( 'pelvis', hull( [
		[ - 0.34, 0.14, - 0.24 ], [ 0.34, 0.14, - 0.24 ], [ - 0.34, 0.14, 0.22 ], [ 0.34, 0.14, 0.22 ],
		[ - 0.52, - 0.1, - 0.28 ], [ 0.52, - 0.1, - 0.28 ], [ - 0.5, - 0.1, 0.3 ], [ 0.5, - 0.1, 0.3 ],
		[ - 0.16, - 0.4, - 0.1 ], [ 0.16, - 0.4, - 0.1 ], [ - 0.14, - 0.38, 0.24 ], [ 0.14, - 0.38, 0.24 ]
	] ), M.graphite );
	add( 'pelvis', merge( [ - 1, 1 ].map( ( s ) => cy( 0.18, 0.24, 'x', [ s * 0.52, - 0.08, 0 ] ) ) ), M.darkSteel );
	add( 'pelvis', hb( 0.36, 0.035, 0.02, [ 0, - 0.02, 0.305 ], { c: 0.008 } ), M.core );

	/* spine: abdominal stack around a column, side pistons */
	add( 'spine', cy( 0.14, 0.5, 'y', [ 0, 0.2, - 0.05 ], 10 ), M.darkSteel );
	add( 'spine', merge( [ 0.04, 0.17, 0.3 ].map( ( y, i ) => hb( 0.74 + i * 0.08, 0.1, 0.5, [ 0, y, 0 ], { c: 0.03, top: [ 0.95, 0.95 ] } ) ) ), M.graphite );
	add( 'spine', merge( [ - 1, 1 ].map( ( s ) => cy( 0.035, 0.5, 'y', [ s * 0.3, 0.2, - 0.12 ], 8 ) ) ), M.chrome );

	/* chest cage */
	add( 'chest', hull( [
		[ - 0.46, 0, - 0.26 ], [ 0.46, 0, - 0.26 ], [ - 0.46, 0, 0.28 ], [ 0.46, 0, 0.28 ],
		[ - 0.64, 0.55, - 0.4 ], [ 0.64, 0.55, - 0.4 ], [ - 0.84, 0.55, 0.38 ], [ 0.84, 0.55, 0.38 ],
		[ - 0.64, 1.0, - 0.36 ], [ 0.64, 1.0, - 0.36 ], [ - 0.8, 1.0, 0.3 ], [ 0.8, 1.0, 0.3 ],
		[ - 0.46, 1.18, - 0.28 ], [ 0.46, 1.18, - 0.28 ], [ - 0.46, 1.18, 0.16 ], [ 0.46, 1.18, 0.16 ]
	] ), M.graphite );
	add( 'chest', hb( 0.46, 0.62, 0.05, [ 0, 0.55, 0.39 ], { c: 0.02 } ), M.darkSteel );
	add( 'chest', merge( [ 0, 1, 2, 3, 4 ].map( ( i ) => hb( 0.34, 0.045, 0.02, [ 0, 0.33 + i * 0.11, 0.42 ], { c: 0.008 } ) ) ), M.core );
	add( 'chest', merge( [ - 1, 1 ].map( ( s ) => cy( 0.2, 0.26, 'x', [ s * 0.72, 1.02, - 0.05 ] ) ) ), M.darkSteel );
	add( 'chest', hb( 0.3, 0.9, 0.08, [ 0, 0.55, - 0.4 ], { c: 0.02 } ), M.darkSteel );
	add( 'chest', hb( 0.04, 0.7, 0.02, [ 0, 0.55, - 0.445 ], { c: 0.006 } ), M.core );

	/* neck */
	add( 'neck', cy( 0.12, 0.34, 'y', [ 0, 0.05, 0 ], 10 ), M.darkSteel );
	add( 'neck', merge( [ - 1, 1 ].map( ( s ) => cy( 0.025, 0.3, 'y', [ s * 0.1, 0.02, - 0.08 ], 8 ) ) ), M.chrome );

	/* head: faceted helmet, recessed face, light-bar visor, crest and fins */
	const HS = 1.25;
	const H = ( pts ) => hull( pts.map( ( p ) => p.map( ( v ) => v * HS ) ) );
	add( 'head', H( [
		[ - 0.27, 0.02, - 0.24 ], [ 0.27, 0.02, - 0.24 ], [ - 0.3, 0.3, - 0.24 ], [ 0.3, 0.3, - 0.24 ],
		[ - 0.2, 0.58, - 0.16 ], [ 0.2, 0.58, - 0.16 ], [ - 0.16, 0.6, 0.12 ], [ 0.16, 0.6, 0.12 ],
		[ - 0.28, 0.44, 0.24 ], [ 0.28, 0.44, 0.24 ], [ - 0.22, 0.12, 0.2 ], [ 0.22, 0.12, 0.2 ]
	] ), M.steel );
	add( 'head', H( [
		[ - 0.21, 0.02, 0.17 ], [ 0.21, 0.02, 0.17 ], [ - 0.24, 0.34, 0.25 ], [ 0.24, 0.34, 0.25 ],
		[ - 0.1, - 0.06, 0.25 ], [ 0.1, - 0.06, 0.25 ], [ 0, 0.2, 0.31 ], [ - 0.2, 0.34, 0.08 ], [ 0.2, 0.34, 0.08 ], [ - 0.18, - 0.04, 0.04 ], [ 0.18, - 0.04, 0.04 ]
	] ), M.graphite );
	add( 'head', slab( [ [ - 0.235, 0.3, 0.262 ], [ 0.235, 0.3, 0.262 ], [ 0.225, 0.335, 0.256 ], [ - 0.225, 0.335, 0.256 ] ].map( ( p ) => p.map( ( v ) => v * HS ) ), { out: [ 0, 0, 1 ], t: 0.02, b: 0.004 } ), M.visor );
	add( 'head', merge( [
		H( [ [ - 0.022, 0.56, - 0.12 ], [ 0.022, 0.56, - 0.12 ], [ - 0.022, 0.66, 0.06 ], [ 0.022, 0.66, 0.06 ], [ - 0.012, 0.61, 0.18 ], [ 0.012, 0.61, 0.18 ] ] ),
		...[ - 1, 1 ].map( ( s ) => H( [ [ s * 0.29, 0.18, - 0.06 ], [ s * 0.33, 0.2, - 0.04 ], [ s * 0.31, 0.5, - 0.2 ], [ s * 0.35, 0.64, - 0.28 ], [ s * 0.29, 0.36, 0.08 ], [ s * 0.33, 0.34, 0.08 ] ] ) )
	] ), M.steel );
	add( 'head', H( [ [ - 0.16, - 0.1, - 0.1 ], [ 0.16, - 0.1, - 0.1 ], [ - 0.12, - 0.08, 0.2 ], [ 0.12, - 0.08, 0.2 ], [ - 0.18, 0.08, - 0.14 ], [ 0.18, 0.08, - 0.14 ], [ - 0.18, 0.08, 0.18 ], [ 0.18, 0.08, 0.18 ] ] ), M.darkSteel );

	for ( const [ Sd, s ] of [ [ 'R', 1 ], [ 'L', - 1 ] ] as const ) {

		/* clavicle: telescoping shoulder rail + shoulder housing */
		add( 'clav' + Sd, hb( 0.8, 0.14, 0.24, [ s * 0.3, 0, 0 ], { c: 0.03 } ), M.darkSteel );
		add( 'clav' + Sd, hb( 0.32, 0.36, 0.42, [ s * 0.78, 0.02, 0 ], { c: 0.05 } ), M.graphite );

		/* upper arm */
		add( 'upper' + Sd, ball( 0.2, [ 0, 0, 0 ] ), M.darkSteel );
		add( 'upper' + Sd, hull( [
			[ - 0.19, - 0.14, - 0.2 ], [ 0.19, - 0.14, - 0.2 ], [ - 0.19, - 0.14, 0.2 ], [ 0.19, - 0.14, 0.2 ],
			[ - 0.16, - 0.98, - 0.17 ], [ 0.16, - 0.98, - 0.17 ], [ - 0.16, - 0.98, 0.15 ], [ 0.16, - 0.98, 0.15 ]
		] ), M.graphite );
		add( 'upper' + Sd, cy( 0.04, 0.72, 'y', [ 0, - 0.56, 0.21 ], 8 ), M.chrome );
		add( 'upper' + Sd, cy( 0.17, 0.36, 'x', [ 0, - 1.12, 0 ] ), M.darkSteel );

		/* forearm */
		add( 'fore' + Sd, hull( [
			[ - 0.2, - 0.06, - 0.24 ], [ 0.2, - 0.06, - 0.24 ], [ - 0.16, - 0.06, 0.16 ], [ 0.16, - 0.06, 0.16 ],
			[ - 0.16, - 0.92, - 0.2 ], [ 0.16, - 0.92, - 0.2 ], [ - 0.16, - 0.92, 0.16 ], [ 0.16, - 0.92, 0.16 ]
		] ), M.graphite );
		add( 'fore' + Sd, cy( 0.15, 0.1, 'y', [ 0, - 0.99, 0 ], 12 ), M.darkSteel );
		add( 'fore' + Sd, hb( 0.02, 0.5, 0.03, [ - s * 0.2, - 0.45, 0.12 ], { c: 0.006 } ), M.core );

		/* hand: palm faces inward (-s x) */
		add( 'hand' + Sd, hb( 0.18, 0.32, 0.36, [ 0, - 0.18, 0 ], { c: 0.03, bottom: [ 0.95, 1.05 ] } ), M.graphite );
		add( 'hand' + Sd, hb( 0.04, 0.26, 0.32, [ s * 0.1, - 0.18, 0 ], { c: 0.012 } ), M.steel );
		const lens = [ 0.13, 0.11, 0.09 ];
		for ( let f = 0; f < 4; f ++ ) [ 'a', 'b', 'c' ].forEach( ( k, i ) => add( `f${ f }${ k }${ Sd }`, hb( 0.085, lens[ i ], 0.075, [ 0, - lens[ i ] / 2, 0 ], { c: 0.014, bottom: [ 0.9, 0.9 ] } ), i ? M.graphite : M.darkSteel ) );
		add( 'thumbA' + Sd, hb( 0.09, 0.15, 0.09, [ 0, - 0.07, 0 ], { c: 0.015 } ), M.darkSteel );
		add( 'thumbB' + Sd, hb( 0.08, 0.12, 0.08, [ 0, - 0.06, 0 ], { c: 0.015 } ), M.graphite );

		/* thigh */
		add( 'thigh' + Sd, ball( 0.2, [ 0, 0, 0 ] ), M.darkSteel );
		add( 'thigh' + Sd, hull( [
			[ - 0.27, - 0.14, - 0.27 ], [ 0.27, - 0.14, - 0.27 ], [ - 0.27, - 0.14, 0.27 ], [ 0.27, - 0.14, 0.27 ],
			[ - 0.22, - 1.2, - 0.23 ], [ 0.22, - 1.2, - 0.23 ], [ - 0.22, - 1.2, 0.22 ], [ 0.22, - 1.2, 0.22 ]
		] ), M.graphite );
		add( 'thigh' + Sd, cy( 0.045, 0.9, 'y', [ s * 0.12, - 0.66, 0.29 ], 8 ), M.chrome );
		add( 'thigh' + Sd, cy( 0.21, 0.44, 'x', [ 0, - 1.36, 0 ] ), M.darkSteel );

		/* shin */
		add( 'shin' + Sd, hull( [
			[ - 0.22, - 0.1, - 0.25 ], [ 0.22, - 0.1, - 0.25 ], [ - 0.22, - 0.1, 0.22 ], [ 0.22, - 0.1, 0.22 ],
			[ - 0.17, - 1.26, - 0.21 ], [ 0.17, - 1.26, - 0.21 ], [ - 0.17, - 1.26, 0.13 ], [ 0.17, - 1.26, 0.13 ]
		] ), M.graphite );
		add( 'shin' + Sd, hull( [ // knee guard
			[ - 0.2, 0.12, 0.12 ], [ 0.2, 0.12, 0.12 ], [ - 0.17, 0.12, 0.3 ], [ 0.17, 0.12, 0.3 ],
			[ - 0.22, - 0.3, 0.12 ], [ 0.22, - 0.3, 0.12 ], [ - 0.16, - 0.26, 0.32 ], [ 0.16, - 0.26, 0.32 ]
		] ), M.steel );
		add( 'shin' + Sd, merge( [ - 1, 1 ].map( ( k ) => cy( 0.04, 0.9, 'y', [ k * 0.1, - 0.7, - 0.26 ], 8 ) ) ), M.chrome );
		add( 'shin' + Sd, cy( 0.14, 0.4, 'x', [ 0, - 1.38, 0 ] ), M.darkSteel );

		/* foot + toe (toe telescopes out of the foot) */
		add( 'foot' + Sd, hull( [
			[ - 0.26, - 0.1, - 0.34 ], [ 0.26, - 0.1, - 0.34 ], [ - 0.24, - 0.1, 0.06 ], [ 0.24, - 0.1, 0.06 ],
			[ - 0.28, - 0.26, - 0.36 ], [ 0.28, - 0.26, - 0.36 ], [ - 0.28, - 0.26, 0.1 ], [ 0.28, - 0.26, 0.1 ]
		] ), M.graphite );
		add( 'foot' + Sd, ball( 0.13, [ 0, 0, 0 ] ), M.darkSteel );
		add( 'toe' + Sd, hull( [
			[ - 0.25, 0.0, 0.0 ], [ 0.25, 0.0, 0.0 ], [ - 0.25, - 0.04, 0.0 ], [ 0.25, - 0.04, 0.0 ],
			[ - 0.21, - 0.0, 0.32 ], [ 0.21, - 0.0, 0.32 ], [ - 0.23, - 0.04, 0.35 ], [ 0.23, - 0.04, 0.35 ]
		] ), M.darkSteel );

	}

	return S;

}
