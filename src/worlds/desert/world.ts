import * as THREE from 'three/webgpu';
import { fog, densityFogFactor, color, positionWorld, float, mix, smoothstep } from 'three/tsl';
import { skyMaterial, groundMaterial, rockMaterial, hazeColor, viewDirection, SKY } from './materials.ts';
import type { CircleCollider, SegmentCollider } from '../../game/types';
import { Forts } from './fort/index.ts';
import { SHADOW_ONLY_LAYER } from '../../rendering/layers.ts';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

interface RockItem {
	x: number; z: number; r: number;
	q: THREE.Quaternion; s: THREE.Vector3;
	wx?: number; wz?: number; collider?: CircleCollider;
}

interface RockTile {
	mesh: THREE.InstancedMesh;
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

/** Focus height (m) above which the shadow camera rises with it; a standing robot's focus is below it. */
const SHADOW_LIFT_FROM = 6;

export class DesertWorld {
	scene: THREE.Scene;
	colliders: CircleCollider[] = [];
	/** walls and building sides (the forts) */
	segments: SegmentCollider[] = [];
	forts: Forts;
	instanceMatrix: THREE.Matrix4;
	instancePosition: THREE.Vector3;
	sky: THREE.Mesh;
	ground: THREE.Mesh;
	sun: THREE.DirectionalLight;
	far: THREE.Group;
	tiles: RockTile[] = [];

	constructor( scene: THREE.Scene ) {

		this.scene = scene;
		this.colliders = [];
		this.instanceMatrix = new THREE.Matrix4();
		this.instancePosition = new THREE.Vector3();

		// fog: exponential-squared haze in the same view-dependent colour as the sky's horizon
		scene.fogNode = fog( hazeColor( viewDirection() ), densityFogFactor( float( 0.0013 ) ) );

		// sky dome follows the camera
		this.sky = new THREE.Mesh( new THREE.SphereGeometry( 4000, 48, 24 ), skyMaterial() );
		this.sky.frustumCulled = false;
		this.sky.renderOrder = - 1;
		scene.add( this.sky );

		// ground
		const ground = new THREE.Mesh( new THREE.PlaneGeometry( 6000, 6000 ), groundMaterial() );
		ground.rotation.x = - Math.PI / 2;
		ground.receiveShadow = true;
		scene.add( ground );
		this.ground = ground;

		this.buildMountains();
		this.buildRocks();
		this.forts = new Forts( scene );
		this.colliders.push( ...this.forts.circles );
		this.segments.push( ...this.forts.segments );

		// lights
		this.sun = new THREE.DirectionalLight( SKY.sunColor, 3.4 );
		this.sun.castShadow = true;
		const sc = this.sun.shadow;
		sc.mapSize.set( 2048, 2048 );
		const e = 16;
		sc.camera.left = - e; sc.camera.right = e; sc.camera.top = e; sc.camera.bottom = - e;
		sc.camera.near = 1; sc.camera.far = 140;
		sc.bias = - 0.0004;
		sc.normalBias = 0.03;
		sc.radius = 3;
		sc.camera.layers.enable( SHADOW_ONLY_LAYER );
		scene.add( this.sun, this.sun.target );

		const hemi = new THREE.HemisphereLight( 0xcfd8e2, 0x9a7f63, 0.35 );
		scene.add( hemi );

	}

	buildMountains() {

		// distant ridge lines, two layers, parented to a group that follows the camera
		this.far = new THREE.Group();
		const rand = rng( 7 );
		const layers = [
			{ r: 2600, h: 260, col: 0xa9a7a3, seg: 220, seed: 1 },
			{ r: 2100, h: 120, col: 0xb7aa98, seg: 200, seed: 2 }
		];
		for ( const L of layers ) {

			const pos = [];
			const idx = [];
			const ph = [ rand() * 10, rand() * 10, rand() * 10 ];
			for ( let i = 0; i <= L.seg; i ++ ) {

				const a = i / L.seg * Math.PI * 2;
				let h = 0;
				h += Math.max( 0, Math.sin( a * 3 + ph[ 0 ] ) ) * 0.55;
				h += ( Math.sin( a * 7 + ph[ 1 ] ) * 0.5 + 0.5 ) * 0.3;
				h += ( Math.sin( a * 19 + ph[ 2 ] ) * 0.5 + 0.5 ) * 0.12;
				h += Math.abs( Math.sin( a * 41 + ph[ 0 ] * 2 ) ) * 0.05;
				h = Math.pow( h, 1.6 );
				const x = Math.cos( a ) * L.r, z = Math.sin( a ) * L.r;
				pos.push( x, - 20, z, x * 1.001, h * L.h, z * 1.001 );

			}

			for ( let i = 0; i < L.seg; i ++ ) {

				const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
				idx.push( a, c, b, b, c, d );

			}

			const g = new THREE.BufferGeometry();
			g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
			g.setIndex( idx );
			g.computeVertexNormals();
			const m = new THREE.MeshBasicNodeMaterial( { side: THREE.DoubleSide, fog: false } );
			// aerial perspective: blend toward the horizon haze with height
			const t = smoothstep( float( - 20 ), float( L.h ), positionWorld.y );
			m.colorNode = mix( hazeColor( viewDirection() ), color( L.col ), t.mul( 0.5 ).add( 0.35 ) );
			const mesh = new THREE.Mesh( g, m );
			mesh.frustumCulled = false;
			this.far.add( mesh );

		}

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
						item.collider = { x: 0, z: 0, r: Math.max( item.s.x, item.s.z ) * 0.95 };
						this.colliders.push( item.collider );

					}

				}

				this.scene.add( mesh );
				this.tiles.push( { mesh, items, tile, collide, last: new THREE.Vector2( 1e9, 1e9 ) } );

			}

		};

		make( 2400, 160, 0.03, 0.22, 0, 11, false );
		make( 240, 420, 0.25, 1.1, 2, 21, false );
		make( 36, 900, 2.5, 7.5, 3, 41, true );

	}

	private cleared( x: number, z: number, r: number ): boolean {

		for ( const e of this.forts.exclusions ) {

			const dx = x - e.x, dz = z - e.z;
			if ( dx * dx + dz * dz < ( e.r + r ) * ( e.r + r ) ) return true;

		}

		return false;

	}

	/** Recentre tiled scatter + far scenery around the focus point. */
	update( camera, focus ) {

		this.sky.position.copy( camera.position );
		this.far.position.set( camera.position.x, 0, camera.position.z );

		const m = this.instanceMatrix;
		const p = this.instancePosition;
		for ( const t of this.tiles ) {

			const moved = Math.abs( focus.x - t.last.x ) + Math.abs( focus.z - t.last.y ) > t.tile * 0.05;
			if ( moved ) {

				t.last.set( focus.x, focus.z );
				t.items.forEach( ( it, i ) => {

					const x = it.x + t.tile * Math.round( ( focus.x - it.x ) / t.tile );
					const z = it.z + t.tile * Math.round( ( focus.z - it.z ) / t.tile );
					it.wx = x; it.wz = z;
					// nothing of the scatter lies inside a fort's grounds (its boulders would stand in the walls)
					const cleared = this.cleared( x, z, it.r );
					if ( it.collider ) { it.collider.x = x; it.collider.z = z; it.collider.r = cleared ? 0 : Math.max( it.s.x, it.s.z ) * 0.95; }
					p.set( x, cleared ? - 50 : - it.s.y * 0.25, z );
					m.compose( p, it.q, cleared ? ZERO : it.s );
					t.mesh.setMatrixAt( i, m );

				} );
				t.mesh.instanceMatrix.needsUpdate = true;

			}


		}

		// shadow camera follows the focus, snapped to texels to avoid shimmer; a subject high in
		// the air (a special's leap) takes it up with it, or it would leave the shadow frustum
		const sc = this.sun.shadow.camera;
		const texel = ( sc.right - sc.left ) / this.sun.shadow.mapSize.x;
		const fx = Math.round( focus.x / texel ) * texel, fz = Math.round( focus.z / texel ) * texel;
		const fy = Math.round( Math.max( 0, focus.y - SHADOW_LIFT_FROM ) / texel ) * texel;
		this.sun.target.position.set( fx, fy, fz );
		this.sun.position.set( fx, fy, fz ).addScaledVector( SKY.sunDir, 80 );

	}

}

/** A tiny scene used only to bake the image-based lighting. */
export function createDesertEnvironmentScene() {

	const s = new THREE.Scene();
	const sky = new THREE.Mesh( new THREE.SphereGeometry( 100, 64, 32 ), skyMaterial() );
	s.add( sky );
	const gm = new THREE.MeshBasicNodeMaterial();
	gm.colorNode = color( SKY.ground ).mul( 0.55 );
	const g = new THREE.Mesh( new THREE.CircleGeometry( 90, 64 ), gm );
	g.rotation.x = - Math.PI / 2;
	g.position.y = - 1.5;
	s.add( g );
	return s;

}
