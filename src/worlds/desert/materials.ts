import * as THREE from 'three/webgpu';
import { color, float, vec2, vec3, mix, smoothstep, positionLocal, positionWorld, normalWorld, abs, fract, fwidth, select, time, cameraViewMatrix } from 'three/tsl';
import { SUN_COLOR, skyRadiance, sunward } from './atmosphere.ts';
import { N } from '../../rendering/noise.ts';
import type { TerrainVertex } from './terrain-mesh.ts';

/**
 * The sky dome: the atmosphere's radiance (atmosphere.ts), the sun's disc and
 * its tight corona, and thin cirrus on a plane overhead, streaked along the
 * wind and drifting slowly, lit from behind near the sun and fading into the
 * horizon haze. Its colours come from the same air that hazes the land, so
 * the horizon meets the ground without a seam.
 */
export function skyMaterial() {

	const m = new THREE.MeshBasicNodeMaterial( { side: THREE.BackSide, depthWrite: false, fog: false } );
	const dir = positionLocal.normalize();
	const h = dir.y;
	const s = sunward( dir );
	const air = skyRadiance( dir );
	const sun = color( SUN_COLOR );

	const plane = dir.xz.div( h.add( 0.12 ) ).mul( vec2( 0.16, 0.05 ) ).add( vec2( time.mul( 0.0006 ), 0 ) );
	const body = N( plane ).r.mul( 0.7 ).add( N( plane.mul( 3.7 ).add( vec2( 0.31, 0.67 ) ) ).a.mul( 0.3 ) );
	const cover = smoothstep( 0.56, 0.86, body ).mul( smoothstep( 0.03, 0.3, h ) );
	// ice crystals scatter the sun forward and the sky's light all round: brighter than the sky behind them
	const cloud = air.mul( 1.25 ).add( sun.mul( s.pow( 6.0 ).mul( 1.4 ).add( 0.08 ) ) );
	const sky = mix( air, cloud, cover.mul( 0.55 ) );

	const disc = sun.mul( s.pow( 256.0 ).mul( 0.8 ).add( smoothstep( 0.9993, 0.9996, s ).mul( 30.0 ) ) );
	m.colorNode = sky.add( disc );
	return m;

}

/** Wind-ripple crest direction on loose sand (unit, world xz) and ripple wavelength (m). */
const WIND = new THREE.Vector2( 0.8, 0.6 );
const RIPPLE_WAVELENGTH = 0.16;
const RIPPLE_AMPLITUDE = 0.008;
/** fraction of a ripple taken by the gentle windward (stoss) face; the rest is the steep lee */
const RIPPLE_STOSS = 0.7;

/** Micro relief of the hardpan (m): two noise octaves. */
const groundHeight = ( xz ) => N( xz.mul( 0.23 ) ).g.mul( 0.06 ).add( N( xz.mul( 1.3 ) ).b.mul( 0.012 ) );

/**
 * The desert floor at a world xz position: hardpan with drifts of looser,
 * paler sand that carry wind ripples. Shared by the ground and by surface
 * imprints (tyre tracks, footprints), which rebuild the bare floor around them.
 *
 * Six texture fetches in all: four for colour, two for the relief (each
 * evaluated three times for forward differences). The ripples are analytic
 * and reuse the relief fetch to wander, so they cost no extra fetch.
 */
export function groundSurface( xz, landSlope: any = null ) {

	const largeSample = N( xz.mul( 0.0021 ) );
	const midSample = N( xz.mul( 0.027 ) );
	const large = largeSample.r;
	const mid = midSample.a;
	const fine = N( xz.mul( 0.19 ) ).g;
	const grit = N( xz.mul( 1.7 ) ).b;
	const relief = N( xz.mul( 0.23 ) );

	// drifts: loose sand where the broad field and the mid field both run high
	const drift = smoothstep( 0.46, 0.66, large.mul( 0.55 ).add( mid.mul( 0.45 ) ) );

	// asymmetric ripple: gentle stoss rise, steep lee fall; crests wander with the relief noise
	const phase = xz.dot( vec2( WIND.x, WIND.y ) ).div( RIPPLE_WAVELENGTH ).add( relief.r.mul( 1.1 ) ).add( midSample.g.mul( 2.5 ) );
	const f = fract( phase );
	const profile = select( f.lessThan( RIPPLE_STOSS ), f.div( RIPPLE_STOSS ), float( 1 ).sub( f ).div( 1 - RIPPLE_STOSS ) );
	const dProfile = select( f.lessThan( RIPPLE_STOSS ), float( 1 / RIPPLE_STOSS ), float( - 1 / ( 1 - RIPPLE_STOSS ) ) );
	// ripples fade out before a pixel spans half a wavelength, so they never alias into moiré
	const resolved = float( 1 ).sub( smoothstep( 0.2, 0.5, fwidth( phase ) ) );
	const ripple = drift.mul( resolved );
	const rippleSlope = vec2( WIND.x, WIND.y ).mul( dProfile.mul( ripple ).mul( - RIPPLE_AMPLITUDE / RIPPLE_WAVELENGTH ) );

	// hardpan base, darker mineral mottling, then the paler drift sand
	let c = mix( color( 0xa98c6e ), color( 0xc4ab8c ), large );
	c = mix( c, color( 0x8a7058 ), smoothstep( 0.55, 0.85, mid ).mul( 0.4 ).mul( float( 1 ).sub( drift ) ) );
	c = mix( c, color( 0xcdb192 ), drift.mul( 0.55 ) );
	// heavier, darker grains settle in the ripple troughs
	c = c.mul( profile.sub( 0.5 ).mul( ripple ).mul( 0.06 ).add( 1 ) );
	const albedo = c.mul( fine.mul( 0.12 ).add( 0.94 ) ).mul( grit.mul( 0.16 ).add( 0.9 ).mul( float( 1 ).sub( drift.mul( 0.5 ) ) ).add( drift.mul( 0.5 ) ) );

	// relief slope (-dh/dx, -dh/dz) by forward differences, plus the analytic ripple slope
	const e = 0.04;
	const h0 = relief.g.mul( 0.06 ).add( N( xz.mul( 1.3 ) ).b.mul( 0.012 ) );
	const slope = vec2(
		h0.sub( groundHeight( xz.add( vec2( e, 0 ) ) ) ).div( e ),
		h0.sub( groundHeight( xz.add( vec2( 0, e ) ) ) ).div( e )
	).mul( float( 1 ).sub( drift.mul( 0.6 ) ) ).add( rippleSlope );
	// the landform's own slope (a varying from the vertex stage): height fields add, so their slopes add
	const total = landSlope ? slope.add( landSlope ) : slope;

	return {
		color: albedo,
		grit,
		slope: total,
		/** the ripple part of `slope`: imprints press it flat */
		rippleSlope,
		roughness: float( 0.93 ).sub( grit.mul( 0.08 ).mul( float( 1 ).sub( drift ) ) )
	};

}

/** The desert floor on the terrain mesh: its vertex (displaced, morphed) and landform slope come from `TerrainMesh`. */
export function groundMaterial( v: TerrainVertex ) {

	const m = new THREE.MeshStandardNodeMaterial();
	m.positionNode = v.position;
	const surface = groundSurface( positionWorld.xz, v.slope );
	m.colorNode = surface.color;
	m.roughnessNode = surface.roughness;
	m.metalnessNode = float( 0.0 );
	const normal = vec3( surface.slope.x, 1.0, surface.slope.y ).normalize();
	m.normalNode = normal.transformDirection( cameraViewMatrix );
	if ( v.occlusion ) m.aoNode = v.occlusion( positionWorld, normal );
	return m;

}

/**
 * Weathered desert stone: layered strata, dark varnish on the steep faces,
 * dust on the tops and wind-blown sand banked around the base.
 */
export function rockMaterial() {

	const m = new THREE.MeshStandardNodeMaterial();
	const p = positionWorld;
	const n = N( p.xz.mul( 0.9 ).add( p.y.mul( 0.5 ) ) ).g;
	const strata = N( vec2( p.y.mul( 1.7 ), p.x.add( p.z ).mul( 0.04 ) ) ).r;
	const up = normalWorld.y;
	let c = mix( color( 0x76604c ), color( 0xa89077 ), n ).mul( strata.mul( 0.22 ).add( 0.89 ) );
	const varnish = float( 1 ).sub( abs( up ) ).mul( smoothstep( 0.35, 0.7, n ) ).mul( 0.55 );
	c = mix( c, color( 0x4b372a ), varnish );
	c = mix( c, color( 0xc0a283 ), smoothstep( 0.6, 0.95, up ).mul( 0.25 ) );
	const banked = float( 1 ).sub( smoothstep( 0.0, n.mul( 0.14 ).add( 0.05 ), p.y ) );
	m.colorNode = mix( c, color( 0xbfa27f ).mul( n.mul( 0.12 ).add( 0.94 ) ), banked.mul( 0.85 ) );
	m.roughnessNode = mix( float( 0.9 ), float( 0.72 ), varnish );
	return m;

}

