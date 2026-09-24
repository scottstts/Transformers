import * as THREE from 'three/webgpu';
import { float, vec3, mix, positionWorld, cameraViewMatrix } from 'three/tsl';
import { N } from '../../rendering/noise.ts';
import { groundSurface } from './materials.ts';

/**
 * Shading shared by imprints pressed into the sand (tyre tracks, footprints).
 * An imprint is a height field over two local coordinates on a decal; the
 * decal rebuilds the bare hardpan (albedo and relief shared with the ground)
 * and lights the imprint through its normal, so where the height is zero and
 * the decal fades out it is indistinguishable from the ground.
 */
export interface Imprint {
	/** sand height (m) at local coordinates (x, y) */
	height: ( x, y ) => any;
	x: any;
	y: any;
	/** finite-difference steps, in local units */
	dx: number;
	dy: number;
	/** metres per local unit along x and y */
	metresX: any;
	metresY: any;
	/** world directions of +x and +y on the ground */
	axisX: any;
	axisY: any;
	/** 0..1: sand compacted by the load */
	pressed: any;
	/** depth (m) at which the sand reads fully "deep" for darkening */
	depth: number;
	opacity: any;
}

/** Low-frequency sand variation for imprints: r = depth wander, g = held detail, b = crumble. */
export const sandGrain = () => N( positionWorld.xz.mul( 0.9 ) );

export function sandImprintMaterial( i: Imprint ): THREE.MeshStandardNodeMaterial {

	const m = new THREE.MeshStandardNodeMaterial( { transparent: true, depthWrite: false } );
	m.polygonOffset = true;
	m.polygonOffsetFactor = - 2;
	m.polygonOffsetUnits = - 2;

	const h0 = i.height( i.x, i.y );
	const gx = i.height( i.x.add( i.dx ), i.y ).sub( h0 ).div( float( i.metresX ).mul( i.dx ) );
	const gy = i.height( i.x, i.y.add( i.dy ) ).sub( h0 ).div( float( i.metresY ).mul( i.dy ) );
	const ground = groundSurface( positionWorld.xz );
	// the load presses the wind ripples flat
	const slope = ground.slope.sub( ground.rippleSlope.mul( i.pressed ) );
	const n = vec3( slope.x, 1, slope.y ).sub( i.axisX.mul( gx ) ).sub( i.axisY.mul( gy ) ).normalize();
	m.normalNode = n.transformDirection( cameraViewMatrix );

	const wander = sandGrain().r.sub( 0.5 );
	const deep = h0.negate().div( i.depth ).clamp( 0, 1 );
	// turned-over sand is a little darker (finer, shaded grains) and smoother where compacted
	m.colorNode = ground.color.mul( mix( float( 1 ), wander.mul( 0.08 ).add( 0.85 ), i.pressed ) ).mul( float( 1 ).sub( deep.mul( 0.08 ) ) );
	m.roughnessNode = mix( ground.roughness, float( 0.86 ), i.pressed );
	m.metalnessNode = float( 0 );
	m.opacityNode = i.opacity;
	return m;

}
