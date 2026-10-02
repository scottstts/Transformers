import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import { skyMaterial, groundMaterial, rockMaterial } from './materials.ts';
import { SAND_RADIANCE, SUN_COLOR, SUN_DIRECTION, SUN_LUX, aerialFog } from './atmosphere.ts';
import { buildLandforms } from './landforms.ts';
import { DesertWind } from './wind.ts';
import type { CircleCollider, SegmentCollider } from '../../game/types';
import { groundNormal, type Ground } from '../../game/ground.ts';
import { Citadel, type CitadelAsset } from './citadel/index.ts';
import { DesertTerrain } from './terrain.ts';
import { TerrainMesh } from './terrain-mesh.ts';
import { SHADOW_ONLY_LAYER } from '../../rendering/layers.ts';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { SunShadowNode } from '../../rendering/sun-shadow.ts';
import { SHADOW_FAR } from '../../content/soldier/horde-renderer.ts';

interface RockItem {
	x: number; z: number; r: number;
	q: THREE.Quaternion; s: THREE.Vector3;
	wx?: number; wz?: number; collider?: CircleCollider;
}

interface RockTile {
	mesh: THREE.InstancedMesh;
	/** the rock shape's vertices (unit size), for its footprint at the ground */
	shape: ArrayLike<number>;
	items: RockItem[];
	tile: number;
	collide: boolean;
	last: THREE.Vector2;
}

/** Seeded RNG so the landscape is identical on every load. */
function rng( seed ) {

	let s = seed >>> 0;
	return () => {

		s = ( s + 0x6d2b79f5 ) >>> 0;
		let t = s;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

/**
 * A weathered stone: a lumpy ellipsoid (two octaves of per-direction
 * displacement, so shared vertices stay welded) broken by a few fracture
 * planes that flatten it into the broad facets of split rock.
 */
export function rockGeometry( r, seed, detail = 1 ) {

	const g = new THREE.IcosahedronGeometry( 1, detail );
	const rand = rng( seed );
	const pos = g.attributes.position;
	const v = new THREE.Vector3();
	const k = [ rand() * 10, rand() * 10, rand() * 10, rand() * 10 ];
	const cuts: { n: THREE.Vector3; d: number }[] = [];
	for ( let c = 0; c < 5; c ++ ) {

		const n = new THREE.Vector3( rand() - 0.5, ( rand() - 0.3 ) * 0.8, rand() - 0.5 ).normalize();
		cuts.push( { n, d: 0.62 + rand() * 0.22 } );

	}

	for ( let i = 0; i < pos.count; i ++ ) {

		v.fromBufferAttribute( pos, i );
		const n = Math.sin( v.x * 3.1 + k[ 0 ] ) * Math.sin( v.y * 2.7 + k[ 1 ] ) * Math.sin( v.z * 3.3 + k[ 2 ] );
		const n2 = Math.sin( v.x * 7.3 + k[ 3 ] ) * Math.sin( v.y * 8.1 + k[ 0 ] ) * Math.sin( v.z * 6.7 + k[ 1 ] );
		v.multiplyScalar( 1 + n * 0.26 + n2 * 0.07 );
		for ( const cut of cuts ) {

			const over = v.dot( cut.n ) - cut.d;
			if ( over > 0 ) v.addScaledVector( cut.n, - over );

		}

		v.y *= 0.62;
		pos.setXYZ( i, v.x * r, v.y * r, v.z * r );

	}

	g.deleteAttribute( 'uv' );
	// hard edges where fracture faces meet, smooth shading across the lumpy weathered parts
	return toCreasedNormals( g, THREE.MathUtils.degToRad( 38 ) );

}

const ZERO = new THREE.Vector3( 0, 0, 0 );

/**
 * A rock's collision radius: how far its sides reach round its axis where it
 * stands above the ground (bedded `sink` m), from its own shape and scale.
 * Its scaled size alone overstated it by the fracture cuts and the bedding:
 * cars struck rocks they were well clear of. A little inside the farthest
 * point, as a circle stands for a lumpy outline.
 */
function footprint( shape: ArrayLike<number>, s: THREE.Vector3, sink: number ): number {

	let reach = 0;
	for ( let i = 0; i < shape.length; i += 3 ) {

		if ( shape[ i + 1 ] * s.y < sink ) continue;
		reach = Math.max( reach, Math.hypot( shape[ i ] * s.x, shape[ i + 2 ] * s.z ) );

	}
	return reach * 0.92;

}
/** The level pad round the citadel: exactly flat to its car ring + [0], the land fully in by + [1] (m). */
const PAD_MARGIN = [ 10, 95 ];
const _normal = new THREE.Vector3();

/**
 * The sun's shadows: cascades over the view out to SHADOW_FAR (the soldiers'
 * shadow range is the same), each a 2048 map, blended across their seams. A
 * single 32 m box round the focus left everything beyond it unshadowed:
 * soldiers' and buildings' shadows popped in as they came near.
 */
const SHADOW_CASCADES = 3;
/**
 * The citadel's cached shadow levels (half-width across the sun, texels):
 * as fine near the camera as the cascades were; 5 cm texels to ~90 m, so a
 * bracket or a bollard still shadows the paving across a yard; the last
 * covering the whole citadel (about 1.1 km across) from outside its walls.
 * At 3 bytes a texel (sun-shadow.ts) they take about 115 MiB.
 */
const STATIC_SHADOW_LEVELS = [
	{ halfWidth: 24, mapSize: 2048 },
	{ halfWidth: 110, mapSize: 4096 },
	{ halfWidth: 190, mapSize: 4096 },
	{ halfWidth: 900, mapSize: 2048 },
];
/** The tallest static caster: the spire (140 m), with room for its finial. */
const CASTER_HEIGHT = 150;

export class DesertWorld {
	scene: THREE.Scene;
	colliders: CircleCollider[] = [];
	/** walls and building sides (the citadel's) */
	segments: SegmentCollider[] = [];
	citadel: Citadel;
	instanceMatrix: THREE.Matrix4;
	instancePosition: THREE.Vector3;
	sky: THREE.Mesh;
	/** the landform: flat under the citadel, swells, dune fields and whoops beyond */
	terrain: DesertTerrain;
	terrainMesh: TerrainMesh;
	/**
	 * What everything stands on: the citadel's floor inside it (its tiers and
	 * ramps), the terrain everywhere else (the car, the robot, the camera and
	 * every effect that meets the ground ask it).
	 */
	ground: Ground;
	/** sand streamers and dust devils */
	wind: DesertWind;
	sun: THREE.DirectionalLight;
	/** the sun's cascaded shadows of moving things; their splits follow the view camera's lens */
	csm: CSMShadowNode;
	/** the cascades with the citadel's cached shadow levels */
	shadows: SunShadowNode;
	private lens = { fov: 0, aspect: 0 };
	far: THREE.Group;
	tiles: RockTile[] = [];
	readonly cameraObstacles: THREE.Object3D[] = [];

	constructor( scene: THREE.Scene, citadel: CitadelAsset ) {

		this.scene = scene;
		this.colliders = [];
		this.instanceMatrix = new THREE.Matrix4();
		this.instancePosition = new THREE.Vector3();

		// the air between the camera and every surface: the same scattering model as the sky (atmosphere.ts)
		scene.fogNode = aerialFog();

		// sky dome follows the camera
		this.sky = new THREE.Mesh( new THREE.SphereGeometry( 4000, 48, 24 ), skyMaterial() );
		this.sky.frustumCulled = false;
		this.sky.renderOrder = - 1;
		scene.add( this.sky );

		// the citadel first: its grounds (and car ring) are where the land is levelled
		this.citadel = new Citadel( scene, citadel );
		const site = this.citadel.plan.site, barrier = this.citadel.plan.barrier;
		this.terrain = new DesertTerrain( [ { x: site.x, z: site.z, r0: barrier + PAD_MARGIN[ 0 ], r1: barrier + PAD_MARGIN[ 1 ] } ] );
		const sky = this.citadel.skyVisibility;
		this.terrain.occlusion = ( position, normal ) => sky.node( position, normal );
		this.terrainMesh = new TerrainMesh( scene, this.terrain, groundMaterial );
		const floor = this.citadel.floor, terrain = this.terrain;
		this.ground = {
			height: ( x, z ) => {

				const h = floor.height( x, z );
				return Number.isNaN( h ) ? terrain.height( x, z ) : h;

			},
		};
		this.wind = new DesertWind( scene, this.terrain );

		this.buildMountains();
		this.buildRocks();
		this.cameraObstacles.push( ...this.citadel.cameraMeshes, ...this.tiles.filter( ( tile ) => tile.collide ).map( ( tile ) => tile.mesh ) );
		this.colliders.push( ...this.citadel.circles );
		this.segments.push( ...this.citadel.segments );

		// lights
		this.sun = new THREE.DirectionalLight( SUN_COLOR, SUN_LUX );
		this.sun.castShadow = true;
		const sc = this.sun.shadow;
		sc.mapSize.set( 2048, 2048 );
		sc.camera.near = 1; sc.camera.far = 420;
		sc.bias = - 0.0004;
		sc.normalBias = 0.03;
		sc.radius = 3;
		// cloned into every cascade: the soldiers' shadow proxies live on this layer
		sc.camera.layers.enable( SHADOW_ONLY_LAYER );
		this.sun.position.copy( SUN_DIRECTION ).multiplyScalar( 100 );
		this.sun.target.position.set( 0, 0, 0 );
		this.csm = new CSMShadowNode( this.sun, { cascades: SHADOW_CASCADES, maxFar: SHADOW_FAR, mode: 'practical', lightMargin: 120 } );
		this.csm.fade = true;
		this.shadows = new SunShadowNode( this.sun, this.csm, this.citadel.staticCasters, { levels: STATIC_SHADOW_LEVELS, margin: 160, casterHeight: CASTER_HEIGHT } );
		sc.shadowNode = this.shadows;
		scene.add( this.sun, this.sun.target );
		// the fill is the environment alone (the sky and the sunlit sand, baked): a separate hemisphere light counted it twice

	}

	buildMountains() {

		// the horizon's mesas and escarpment follow the camera: a traveller never reaches them
		this.far = buildLandforms();
		this.scene.add( this.far );

	}

	buildRocks() {

		// pebbles + small stones, tiled around the camera so the field never ends
		this.tiles = [];
		const mat = rockMaterial();
		const make = ( count, tile, minR, maxR, detail, seed, collide ) => {

			const geos = [ rockGeometry( 1, seed, detail ), rockGeometry( 1, seed + 1, detail ), rockGeometry( 1, seed + 2, detail ) ];
			const rand = rng( seed * 31 );
			for ( let gi = 0; gi < geos.length; gi ++ ) {

				const n = Math.floor( count / geos.length );
				const mesh = new THREE.InstancedMesh( geos[ gi ], mat, n );
				mesh.castShadow = maxR > 0.2;
				mesh.receiveShadow = true;
				mesh.frustumCulled = false;
				const items: RockItem[] = [];
				for ( let i = 0; i < n; i ++ ) {

					const r = minR + Math.pow( rand(), 3 ) * ( maxR - minR );
					items.push( {
						x: rand() * tile, z: rand() * tile, r,
						q: new THREE.Quaternion().setFromEuler( new THREE.Euler( ( rand() - 0.5 ) * 0.4, rand() * 6.28, ( rand() - 0.5 ) * 0.4 ) ),
						s: new THREE.Vector3( r * ( 0.8 + rand() * 0.5 ), r * ( 0.7 + rand() * 0.5 ), r * ( 0.8 + rand() * 0.5 ) )
					} );
					if ( collide ) {

						const item = items[ items.length - 1 ];
						item.collider = { x: 0, z: 0, r: 0 };
						this.colliders.push( item.collider );

					}

				}

				this.scene.add( mesh );
				this.tiles.push( { mesh, shape: geos[ gi ].getAttribute( 'position' ).array, items, tile, collide, last: new THREE.Vector2( 1e9, 1e9 ) } );

			}

		};

		make( 2400, 160, 0.03, 0.22, 0, 11, false );
		make( 240, 420, 0.25, 1.1, 2, 21, false );
		make( 36, 900, 2.5, 7.5, 3, 41, true );

	}

	private cleared( x: number, z: number, r: number ): boolean {

		for ( const e of this.citadel.exclusions ) {

			const dx = x - e.x, dz = z - e.z;
			if ( dx * dx + dz * dz < ( e.r + r ) * ( e.r + r ) ) return true;

		}

		return false;

	}

	/**
	 * For the start's shader warm-up: everything the world can show drawn at
	 * once (the citadel's distance-hidden classes, both terrain patch draws).
	 * Returns the restore.
	 */
	reveal(): () => void {

		const detail = this.citadel.showAllDetail();
		const terrain = this.terrainMesh.reveal();
		return () => {

			detail();
			terrain();

		};

	}

	/** GPU work done once at start, after the renderer is up (the citadel's ambient occlusion). */
	prepare( renderer: THREE.WebGPURenderer ) {

		this.citadel.bake( renderer );

	}

	/** Recentre tiled scatter + far scenery around the focus point. */
	update( camera, focus, dt = 1 / 60 ) {

		this.shadows.follow( camera );

		this.sky.position.copy( camera.position );
		this.terrainMesh.update( camera );
		this.wind.update( camera, dt );
		this.citadel.update( camera, dt );
		this.far.position.set( camera.position.x, 0, camera.position.z );

		const m = this.instanceMatrix;
		const p = this.instancePosition;
		for ( const t of this.tiles ) {

			const moved = Math.abs( focus.x - t.last.x ) + Math.abs( focus.z - t.last.y ) > t.tile * 0.05;
			if ( moved ) {

				t.last.set( focus.x, focus.z );
				let first = - 1, last = - 1;
				for ( let i = 0; i < t.items.length; i ++ ) {

					const it = t.items[ i ];
					const x = it.x + t.tile * Math.round( ( focus.x - it.x ) / t.tile );
					const z = it.z + t.tile * Math.round( ( focus.z - it.z ) / t.tile );
					if ( it.wx === x && it.wz === z ) continue;
					if ( first < 0 ) first = i;
					last = i;
					it.wx = x; it.wz = z;
					// nothing of the scatter lies inside the citadel's grounds (its boulders would stand in the walls)
					const cleared = this.cleared( x, z, it.r );
					// bedded a quarter of its height, deeper on a slope so its downhill side does not stand proud
					const h = cleared ? - 50 : this.terrain.height( x, z );
					const tilt = cleared ? 0 : Math.sqrt( Math.max( 0, 1 / ( groundNormal( this.terrain, x, z, _normal ).y ** 2 ) - 1 ) );
					const sink = it.s.y * 0.25 + Math.max( it.s.x, it.s.z ) * tilt;
					p.set( x, h - sink, z );
					if ( it.collider ) {

						it.collider.x = x;
						it.collider.z = z;
						it.collider.r = cleared ? 0 : footprint( t.shape, it.s, sink );

					}
					m.compose( p, it.q, cleared ? ZERO : it.s );
					t.mesh.setMatrixAt( i, m );

				}

				if ( first >= 0 ) {

					// upload only the span of instances that wrapped
					t.mesh.instanceMatrix.addUpdateRange( first * 16, ( last - first + 1 ) * 16 );
					t.mesh.instanceMatrix.needsUpdate = true;
					t.mesh.boundingSphere = null;

				}

			}


		}

		// the cascades follow the view camera by themselves (snapped to their texels); their splits
		// are measured from its lens, which the follow camera, the lens kicks and the director change
		if ( this.csm.camera && ( camera.fov !== this.lens.fov || camera.aspect !== this.lens.aspect ) ) {

			this.lens.fov = camera.fov;
			this.lens.aspect = camera.aspect;
			this.csm.updateFrustums();

		}

	}

}

/** A tiny scene used only to bake the image-based lighting. */
export function createDesertEnvironmentScene() {

	const s = new THREE.Scene();
	const sky = new THREE.Mesh( new THREE.SphereGeometry( 100, 64, 32 ), skyMaterial() );
	s.add( sky );
	// the sunlit sand below the horizon: the warm bounce that fills shadows from beneath
	const gm = new THREE.MeshBasicNodeMaterial();
	gm.colorNode = color( SAND_RADIANCE );
	const g = new THREE.Mesh( new THREE.CircleGeometry( 90, 64 ), gm );
	g.rotation.x = - Math.PI / 2;
	g.position.y = - 1.5;
	s.add( g );
	return s;

}
