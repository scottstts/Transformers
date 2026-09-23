import * as THREE from 'three/webgpu';
import { color, float, vec2, vec3, uniform, mix, smoothstep, positionLocal, positionWorld, normalWorld, abs, max, cameraViewMatrix } from 'three/tsl';
import { N } from '../../rendering/noise.ts';

export const SKY = {
	horizon: new THREE.Color( 0xd9cdbd ),
	zenith: new THREE.Color( 0x8fa3b8 ),
	ground: new THREE.Color( 0xb49a7d ),
	sunDir: new THREE.Vector3( - 0.55, 0.42, - 0.72 ).normalize(),
	sunColor: new THREE.Color( 0xfff1de )
};

export function skyMaterial() {

	const m = new THREE.MeshBasicNodeMaterial( { side: THREE.BackSide, depthWrite: false, fog: false } );
	const dir = positionLocal.normalize();
	const h = dir.y;
	const up = max( h, 0.0 );
	const base = mix( color( SKY.horizon ), color( SKY.zenith ), up.pow( 0.55 ) );
	const below = mix( color( SKY.horizon ), color( SKY.ground ).mul( 0.9 ), smoothstep( 0.0, - 0.25, h ) );
	const sky = mix( below, base, smoothstep( - 0.02, 0.02, h ) );
	const s = max( dir.dot( uniform( SKY.sunDir ) ), 0.0 );
	const glow = color( SKY.sunColor ).mul( s.pow( 6.0 ).mul( 0.28 ).add( s.pow( 64.0 ).mul( 0.5 ) ).add( smoothstep( 0.9993, 0.9996, s ).mul( 30.0 ) ) );
	m.colorNode = sky.add( glow );
	return m;

}

/** Hardpan albedo at a world xz position (shared by the ground and surface decals). */
export function groundAlbedo( xz ) {

	const large = N( xz.mul( 0.0021 ) ).r;
	const mid = N( xz.mul( 0.027 ) ).a;
	const fine = N( xz.mul( 0.19 ) ).g;
	const grit = N( xz.mul( 1.7 ) ).b;
	let c = mix( color( 0xa98c6e ), color( 0xc4ab8c ), large );
	c = mix( c, color( 0x8a7058 ), smoothstep( 0.55, 0.85, mid ).mul( 0.4 ) );
	return { color: c.mul( fine.mul( 0.12 ).add( 0.94 ) ).mul( grit.mul( 0.16 ).add( 0.9 ) ), grit };

}

/** Micro relief of the hardpan (m). */
export const groundHeight = ( xz ) => N( xz.mul( 0.23 ) ).g.mul( 0.06 ).add( N( xz.mul( 1.3 ) ).b.mul( 0.012 ) );

/** World-space slope of the relief: (-dh/dx, -dh/dz) by forward differences. */
export function groundSlope( xz ) {

	const e = 0.04;
	const h0 = groundHeight( xz );
	return vec2( h0.sub( groundHeight( xz.add( vec2( e, 0 ) ) ) ).div( e ), h0.sub( groundHeight( xz.add( vec2( 0, e ) ) ) ).div( e ) );

}

/** Desert hardpan: four texture fetches for colour, three for the bump. */
export function groundMaterial() {

	const m = new THREE.MeshStandardNodeMaterial();
	const xz = positionWorld.xz;
	const albedo = groundAlbedo( xz );
	m.colorNode = albedo.color;
	m.roughnessNode = float( 0.93 ).sub( albedo.grit.mul( 0.08 ) );
	m.metalnessNode = float( 0.0 );

	const slope = groundSlope( xz );
	m.normalNode = vec3( slope.x, 1.0, slope.y ).normalize().transformDirection( cameraViewMatrix );
	return m;

}

export function rockMaterial() {

	const m = new THREE.MeshStandardNodeMaterial( { flatShading: true } );
	const n = N( positionWorld.xz.mul( 0.9 ).add( positionWorld.y.mul( 0.5 ) ) ).g;
	m.colorNode = mix( color( 0x7d6752 ), color( 0xa89077 ), n ).mul( abs( normalWorld.y ).mul( 0.2 ).add( 0.85 ) );
	m.roughnessNode = float( 0.88 );
	return m;

}
