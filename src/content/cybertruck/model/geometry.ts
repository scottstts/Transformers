import * as THREE from 'three/webgpu';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = ( p ) => ( p.isVector3 ? p.clone() : new THREE.Vector3( p[ 0 ], p[ 1 ], p[ 2 ] ) );

/**
 * A panel "slab": takes a (roughly planar) outline in 3D, gives it thickness
 * along the inward normal and a small chamfer on the outer edge so every panel
 * catches a crisp highlight line — the same way a real stamped panel does.
 *
 * points : outline (any winding), may be concave
 * out    : hint for the outward normal
 * t      : thickness, b : chamfer size
 */
export function slab( points, { out = null, t = 0.035, b = 0.007 } = {} ) {

	let P = points.map( V3 );
	const N = P.length;

	const n = new THREE.Vector3();
	for ( let i = 0; i < N; i ++ ) {

		const a = P[ i ], c = P[ ( i + 1 ) % N ];
		n.x += ( a.y - c.y ) * ( a.z + c.z );
		n.y += ( a.z - c.z ) * ( a.x + c.x );
		n.z += ( a.x - c.x ) * ( a.y + c.y );

	}

	n.normalize();
	if ( out && n.dot( V3( out ) ) < 0 ) {

		P = P.reverse();
		n.negate();

	}

	const o = new THREE.Vector3();
	P.forEach( ( p ) => o.add( p ) );
	o.divideScalar( N );

	// in-plane basis
	let U = null;
	for ( let i = 0; i < N && ! U; i ++ ) {

		const e = P[ ( i + 1 ) % N ].clone().sub( P[ i ] );
		e.addScaledVector( n, - e.dot( n ) );
		if ( e.lengthSq() > 1e-8 ) U = e.normalize();

	}

	const Vb = n.clone().cross( U );
	const tmp = new THREE.Vector3();
	const p2 = P.map( ( p ) => {

		tmp.subVectors( p, o );
		return new THREE.Vector2( tmp.dot( U ), tmp.dot( Vb ) );

	} );
	const d = P.map( ( p ) => tmp.subVectors( p, o ).dot( n ) );

	// inset outline for the top face (miter offset)
	const q2 = p2.map( ( cur, i ) => {

		const prev = p2[ ( i - 1 + N ) % N ], next = p2[ ( i + 1 ) % N ];
		const e1 = cur.clone().sub( prev ).normalize();
		const e2 = next.clone().sub( cur ).normalize();
		const n1 = new THREE.Vector2( - e1.y, e1.x );
		const n2 = new THREE.Vector2( - e2.y, e2.x );
		const k = b / Math.max( 1 + n1.dot( n2 ), 0.3 );
		return cur.clone().add( n1.add( n2 ).multiplyScalar( k ) );

	} );

	const to3 = ( v2, h ) => o.clone().addScaledVector( U, v2.x ).addScaledVector( Vb, v2.y ).addScaledVector( n, h );

	const T = q2.map( ( v, i ) => to3( v, d[ i ] ) );
	const O = p2.map( ( v, i ) => to3( v, d[ i ] - b ) );
	const B = p2.map( ( v, i ) => to3( v, d[ i ] - t ) );

	const pos = [];
	const push = ( ...vs ) => vs.forEach( ( v ) => pos.push( v.x, v.y, v.z ) );

	const tris = THREE.ShapeUtils.triangulateShape( q2, [] );
	for ( const [ a0, b0, c0 ] of tris ) {

		const a = a0;
		let bb = b0, c = c0;
		const area = ( q2[ bb ].x - q2[ a ].x ) * ( q2[ c ].y - q2[ a ].y ) - ( q2[ c ].x - q2[ a ].x ) * ( q2[ bb ].y - q2[ a ].y );
		if ( area < 0 ) [ bb, c ] = [ c, bb ];
		push( T[ a ], T[ bb ], T[ c ] );
		push( B[ a ], B[ c ], B[ bb ] );

	}

	for ( let i = 0; i < N; i ++ ) {

		const j = ( i + 1 ) % N;
		push( T[ i ], O[ i ], O[ j ] );
		push( T[ i ], O[ j ], T[ j ] );
		push( O[ i ], B[ i ], B[ j ] );
		push( O[ i ], B[ j ], O[ j ] );

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.computeVertexNormals();
	return g;

}

/**
 * Faceted, chamfered, optionally tapered box built as a convex hull.
 * top / bottom : [scaleX, scaleZ] of the cross-section at that end
 * shift        : [x, z] offset of the top section (for raked shapes)
 */
export function hullBox( w, h, d, { c = 0.03, top = [ 1, 1 ], bottom = [ 1, 1 ], shift = [ 0, 0 ] } = {} ) {

	const pts = [];
	const ring = ( y, s, inset, ox, oz ) => {

		const hw = Math.max( ( w * s[ 0 ] ) / 2 - inset, 0.002 );
		const hd = Math.max( ( d * s[ 1 ] ) / 2 - inset, 0.002 );
		const cc = Math.min( c, hw * 0.45, hd * 0.45 );
		for ( const [ x, z ] of [
			[ hw - cc, hd ], [ hw, hd - cc ], [ hw, - hd + cc ], [ hw - cc, - hd ],
			[ - hw + cc, - hd ], [ - hw, - hd + cc ], [ - hw, hd - cc ], [ - hw + cc, hd ]
		] ) pts.push( new THREE.Vector3( x + ox, y, z + oz ) );

	};

	const lerp = ( a, b, t ) => [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t ];
	const k = c / h;
	ring( - h / 2, bottom, c, 0, 0 );
	ring( - h / 2 + c, lerp( bottom, top, k ), 0, shift[ 0 ] * k, shift[ 1 ] * k );
	ring( h / 2 - c, lerp( bottom, top, 1 - k ), 0, shift[ 0 ] * ( 1 - k ), shift[ 1 ] * ( 1 - k ) );
	ring( h / 2, top, c, shift[ 0 ], shift[ 1 ] );

	return new ConvexGeometry( pts );

}

/** Convex hull of arbitrary points (arrays or vectors). */
export function hull( points ) {

	return new ConvexGeometry( points.map( V3 ) );

}

/** Prism: 2D outline in the XY plane extruded along Z (centered), chamfered. */
export function prism( outline2D, depth, { b = 0.01 } = {} ) {

	const pts = outline2D.map( ( [ x, y ] ) => [ x, y, depth / 2 ] );
	return slab( pts, { out: [ 0, 0, 1 ], t: depth, b } );

}

/** Faceted cylinder along the given axis ('x' | 'y' | 'z'). */
export function cyl( r, len, { seg = 12, axis = 'y', r2 = r } = {} ) {

	const g = new THREE.CylinderGeometry( r2, r, len, seg, 1 );
	if ( axis === 'x' ) g.rotateZ( - Math.PI / 2 );
	if ( axis === 'z' ) g.rotateX( Math.PI / 2 );
	return g;

}

export function place( g, { p = [ 0, 0, 0 ], r = [ 0, 0, 0 ], s = null } = {} ) {

	const m = new THREE.Matrix4().compose(
		new THREE.Vector3( ...p ),
		new THREE.Quaternion().setFromEuler( new THREE.Euler( ...r ) ),
		s ? new THREE.Vector3( ...( Array.isArray( s ) ? s : [ s, s, s ] ) ) : new THREE.Vector3( 1, 1, 1 )
	);
	g.applyMatrix4( m );
	return g;

}

/** Merge geometries after reducing them to position+normal, non-indexed. */
export function merge( list ) {

	const clean = list.map( ( g ) => {

		const h = g.index ? g.toNonIndexed() : g;
		for ( const k of Object.keys( h.attributes ) ) if ( k !== 'position' && k !== 'normal' ) h.deleteAttribute( k );
		if ( ! h.attributes.normal ) h.computeVertexNormals();
		return h;

	} );
	return mergeGeometries( clean, false );

}
