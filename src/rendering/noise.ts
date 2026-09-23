import * as THREE from 'three/webgpu';
import { texture } from 'three/tsl';

function bakeNoise( size = 256 ) {

	const data = new Uint8Array( size * size * 4 );
	let seed = 1337;
	const rnd = () => ( ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647 );
	const lattice = ( n ) => {

		const g = new Float32Array( n * n );
		for ( let i = 0; i < g.length; i ++ ) g[ i ] = rnd();
		return g;

	};

	const sample = ( g, n, x, y ) => {

		const xi = Math.floor( x ), yi = Math.floor( y );
		const fx = x - xi, fy = y - yi;
		const sx = fx * fx * ( 3 - 2 * fx ), sy = fy * fy * ( 3 - 2 * fy );
		const a = g[ ( yi % n ) * n + ( xi % n ) ], b = g[ ( yi % n ) * n + ( ( xi + 1 ) % n ) ];
		const c = g[ ( ( yi + 1 ) % n ) * n + ( xi % n ) ], d = g[ ( ( yi + 1 ) % n ) * n + ( ( xi + 1 ) % n ) ];
		return a + ( b - a ) * sx + ( c - a ) * sy + ( a - b - c + d ) * sx * sy;

	};

	const fbm = ( base, oct ) => {

		const grids = [];
		for ( let o = 0; o < oct; o ++ ) grids.push( lattice( base << o ) );
		return ( u, v ) => {

			let s = 0, amp = 0.5, tot = 0;
			for ( let o = 0; o < oct; o ++ ) {

				const n = base << o;
				s += sample( grids[ o ], n, u * n, v * n ) * amp;
				tot += amp;
				amp *= 0.5;

			}

			return s / tot;

		};

	};

	const ch = [ fbm( 4, 5 ), fbm( 16, 4 ), fbm( 64, 2 ), fbm( 8, 4 ) ];
	for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {

		const u = x / size, v = y / size, i = ( y * size + x ) * 4;
		for ( let c = 0; c < 4; c ++ ) {

			const n = ( ch[ c ]( u, v ) - 0.5 ) * 1.9 + 0.5;
			data[ i + c ] = Math.max( 0, Math.min( 255, n * 255 ) );

		}

	}

	const tex = new THREE.DataTexture( data, size, size, THREE.RGBAFormat );
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.magFilter = THREE.LinearFilter;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 8;
	tex.needsUpdate = true;
	return tex;

}

export const NOISE = bakeNoise();
export const N = ( uvNode ) => texture( NOISE, uvNode );
