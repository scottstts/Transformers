import * as THREE from 'three/webgpu';
import { float, vec3, mix, positionWorld, cameraViewMatrix, cameraPosition, distance, smoothstep } from 'three/tsl';
import { N } from '../../rendering/noise.ts';
import { groundSurface } from './materials.ts';
import type { GroundDecal } from './terrain.ts';

/**
 * Past this range (m) a decal fades: the terrain there is drawn with coarser
 * patches than the exact landform the decal is laid on, and the marks are
 * sub-pixel anyway.
 */
export const DECAL_FAR: [ number, number ] = [ 140, 220 ];

/** 1 near the camera, fading to 0 over `DECAL_FAR`. */
export const decalRange = () => float( 1 ).sub( smoothstep( DECAL_FAR[ 0 ], DECAL_FAR[ 1 ], distance( positionWorld.xz, cameraPosition.xz ) ) );

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
	/** the decal's vertex on the landform and the land's slope under it */
	land: GroundDecal;
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
	m.positionNode = i.land.position;
	const ground = groundSurface( positionWorld.xz, i.land.slope );
	// the load presses the wind ripples flat
	const slope = ground.slope.sub( ground.rippleSlope.mul( i.pressed ) );
	const n = vec3( slope.x, 1, slope.y ).sub( i.axisX.mul( gx ) ).sub( i.axisY.mul( gy ) ).normalize();
	m.normalNode = n.transformDirection( cameraViewMatrix );
	if ( i.land.occlusion ) m.aoNode = i.land.occlusion( positionWorld, n );

	const wander = sandGrain().r.sub( 0.5 );
	const deep = h0.negate().div( i.depth ).clamp( 0, 1 );
	// turned-over sand is a little darker (finer, shaded grains) and smoother where compacted
	m.colorNode = ground.color.mul( mix( float( 1 ), wander.mul( 0.08 ).add( 0.85 ), i.pressed ) ).mul( float( 1 ).sub( deep.mul( 0.08 ) ) );
	m.roughnessNode = mix( ground.roughness, float( 0.86 ), i.pressed );
	m.metalnessNode = float( 0 );
	m.opacityNode = i.opacity.mul( decalRange() );
	return m;

}
