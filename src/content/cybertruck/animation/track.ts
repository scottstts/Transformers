export function evalTrack( keys, T, standVal ) {

	const n = keys.length;
	const val = ( i ) => ( keys[ i ][ 1 ] === 'STAND' ? standVal : keys[ i ][ 1 ] );
	if ( T <= keys[ 0 ][ 0 ] ) return val( 0 ).slice();
	if ( T >= keys[ n - 1 ][ 0 ] ) return val( n - 1 ).slice();
	let i = 0;
	while ( keys[ i + 1 ][ 0 ] < T ) i ++;
	const t0 = keys[ i ][ 0 ], t1 = keys[ i + 1 ][ 0 ];
	const h = t1 - t0, u = ( T - t0 ) / h;
	const v0 = val( i ), v1 = val( i + 1 );
	const vp = i > 0 ? val( i - 1 ) : v0, vn = i + 2 < n ? val( i + 2 ) : v1;
	const tp = i > 0 ? keys[ i - 1 ][ 0 ] : t0 - h, tn = i + 2 < n ? keys[ i + 2 ][ 0 ] : t1 + h;
	const out = [];
	for ( let k = 0; k < v0.length; k ++ ) {

		const d0 = ( v0[ k ] - vp[ k ] ) / ( t0 - tp ), d1 = ( v1[ k ] - v0[ k ] ) / h, d2 = ( vn[ k ] - v1[ k ] ) / ( tn - t1 );
		// Fritsch–Carlson style limiting keeps motion from overshooting keys
		const m0 = d0 * d1 <= 0 ? 0 : ( 2 * d0 * d1 ) / ( d0 + d1 );
		const m1 = d1 * d2 <= 0 ? 0 : ( 2 * d1 * d2 ) / ( d1 + d2 );
		const u2 = u * u, u3 = u2 * u;
		out.push( ( 2 * u3 - 3 * u2 + 1 ) * v0[ k ] + ( u3 - 2 * u2 + u ) * h * m0 + ( - 2 * u3 + 3 * u2 ) * v1[ k ] + ( u3 - u2 ) * h * m1 );

	}

	return out;

}
