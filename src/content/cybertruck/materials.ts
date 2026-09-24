import * as THREE from 'three/webgpu';
import { color, float, vec2, uniform, mix, positionLocal } from 'three/tsl';
import { N } from '../../rendering/noise.ts';

// Global uniforms other modules animate
export const U = {
	frontLight: uniform( 1.0 ),
	rearLight: uniform( 1.0 ),
	visor: uniform( 0.0 ),
	core: uniform( 0.0 )
};

const tag = ( m, hex ) => ( ( m.userData.preview = hex ), m );

/** Brushed stainless: streaks along the panel's long axis, low-frequency smudges. */
function stainless() {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionLocal;
	const streak = N( vec2( p.z.mul( 0.04 ).add( p.y.mul( 0.02 ) ), p.x.add( p.y ).mul( 2.7 ) ) ).b;
	const smudge = N( p.xz.mul( 0.21 ).add( p.y.mul( 0.13 ) ) ).r;
	m.colorNode = mix( color( 0x989da2 ), color( 0xc6cacd ), streak.mul( 0.35 ).add( smudge.mul( 0.65 ) ) );
	m.metalnessNode = float( 1.0 );
	m.roughnessNode = float( 0.19 ).add( streak.mul( 0.1 ) ).add( smudge.mul( 0.12 ) );
	return tag( m, 0xb8bcc0 );

}

function graphite() {

	const n = N( positionLocal.xz.mul( 0.6 ).add( positionLocal.y.mul( 0.37 ) ) ).g;
	const m = new THREE.MeshStandardNodeMaterial();
	m.colorNode = mix( color( 0x1a1c1f ), color( 0x2d3034 ), n );
	m.metalnessNode = float( 0.75 );
	m.roughnessNode = float( 0.36 ).add( n.mul( 0.16 ) );
	return tag( m, 0x34373c );

}

function blackPlastic() {

	const grain = N( positionLocal.xy.mul( 3.1 ).add( positionLocal.z.mul( 2.3 ) ) ).b;
	const m = new THREE.MeshStandardNodeMaterial();
	m.colorNode = color( 0x141516 ).mul( grain.mul( 0.25 ).add( 0.85 ) );
	m.metalnessNode = float( 0.0 );
	m.roughnessNode = float( 0.6 ).add( grain.mul( 0.15 ) );
	return tag( m, 0x1c1d1e );

}

function emissive( hex, intensity, u ) {

	const m = new THREE.MeshBasicNodeMaterial();
	m.colorNode = color( hex ).mul( float( intensity ).mul( u as any ) as any );
	m.userData.emissive = true;
	return tag( m, hex );

}

/** Machined, dark-anodised structural alloy: fine turning marks, satin sheen. */
function machined() {

	const p = positionLocal;
	const turning = N( vec2( p.x.add( p.z ).mul( 9.0 ), p.y.mul( 0.7 ) ) ).g;
	const m = new THREE.MeshStandardNodeMaterial();
	m.colorNode = mix( color( 0x3a3e44 ), color( 0x4a4f56 ), turning );
	m.metalnessNode = float( 0.9 );
	m.roughnessNode = float( 0.28 ).add( turning.mul( 0.08 ) );
	return tag( m, 0x44484e );

}

const std = ( p, hex? ) => tag( new THREE.MeshStandardNodeMaterial( p ), hex ?? p.color );

export function createMaterials() {

	const M: Record<string, THREE.Material> = {};
	M.steel = stainless();
	M.graphite = graphite();
	M.plastic = blackPlastic();
	M.glass = tag( new THREE.MeshPhysicalNodeMaterial( {
		color: 0x07090b, metalness: 0.0, roughness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.03, ior: 1.52
	} ), 0x0d1115 );
	M.tonneau = std( { color: 0x1c1e21, metalness: 0.55, roughness: 0.45 }, 0x25282b );
	M.rubber = std( { color: 0x151515, metalness: 0.0, roughness: 0.92 } );
	M.aero = std( { color: 0x222426, metalness: 0.4, roughness: 0.48 } );
	M.aeroDark = std( { color: 0x0e0f10, metalness: 0.2, roughness: 0.6 } );
	M.darkSteel = std( { color: 0x575b60, metalness: 1.0, roughness: 0.3 }, 0x6a6e73 );
	M.mech = machined();
	M.chrome = std( { color: 0xe4e6e8, metalness: 1.0, roughness: 0.1 } );
	M.interior = std( { color: 0x0b0b0c, metalness: 0.0, roughness: 0.9 } );
	M.lightWhite = emissive( 0xf4f7ff, 14.0, U.frontLight );
	M.lightRed = emissive( 0xff1a12, 10.0, U.rearLight );
	M.lightAmber = emissive( 0xffa028, 6.0, U.frontLight );
	M.visor = emissive( 0xe8f4ff, 18.0, U.visor );
	M.ionBlue = emissive( 0x2caaFF, 7.0, U.visor );
	M.core = emissive( 0xdff0ff, 7.0, U.core );
	M.reflector = std( { color: 0x5a0805, metalness: 0.2, roughness: 0.3, emissive: 0x200000 }, 0x8a1010 );
	return M;

}
