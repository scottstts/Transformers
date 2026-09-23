import { Bone } from './bone.ts';
import { evalTrack } from '../animation/track.ts';
import * as THREE from 'three/webgpu';
import { buildCar, wheelGeometry, C } from './vehicle-body.ts';
import { boneList, buildStructure, LEG, HIP, ROBOT_Z } from './humanoid.ts';
import { TRACKS, PANELS } from '../animation/choreography.ts';

const deg = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;

/* =====================================================================
 *  Transformer engine
 *
 *  - Endoskeleton bones are driven by keyframed tracks over T (0 = truck,
 *    1 = robot), with the legs solved by IK towards keyed foot targets.
 *    At T = 1 the tracks hand over to live locomotion.
 *  - Every car panel is mounted on a bone. Its car pose is exact at T = 0;
 *    towards T = 1 it travels through a list of mechanical steps (hinges
 *    and slides in the bone's frame) with their own timing windows.
 *  - The whole assembly rests on the ground: the lowest point touches it.
 * ===================================================================== */

const smooth = ( u ) => u * u * u * ( u * ( u * 6 - 15 ) + 10 );
const lockEase = ( u ) => {

	// travel with a small overshoot, then settle: the "clunk" into place
	const e = smooth( u );
	return e + Math.sin( Math.PI * clamp( ( u - 0.55 ) / 0.45, 0, 1 ) ) * 0.045 * ( 1 - u * 0.3 );

};

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();

const mirrorRot = ( v ) => [ v[ 0 ], - v[ 1 ], - v[ 2 ] ];

export class CybertruckModel {
	M: Record<string, THREE.Material>;
	root: THREE.Group;
	T = 0;
	steer = 0;
	spin = 0;
	suspension: THREE.Matrix4;
	G: THREE.Matrix4;
	lift = 0;
	bones: Record<string, Bone> = {};
	boneOrder: Bone[] = [];
	fold: Record<string, THREE.Matrix4> = {};
	panels: any[] = [];
	wheels: any[] = [];
	_Ginv: THREE.Matrix4;

	constructor( M ) {

		this.M = M;
		this.root = new THREE.Group();
		this.T = 0;
		this.steer = 0;
		this.spin = 0;
		this.suspension = new THREE.Matrix4();
		this.G = new THREE.Matrix4();
		this.lift = 0;

		// bones
		this.bones = {};
		this.boneOrder = [];
		for ( const [ n, p, off ] of boneList() ) {

			const b = new Bone( n, p ? this.bones[ p ] : null, off );
			this.bones[ n ] = b;
			this.boneOrder.push( b );
			this.root.add( b.group );

		}

		// robot structure
		const S = buildStructure( M );
		for ( const bn in S ) for ( const [ g, m ] of S[ bn ] ) this.addMesh( this.bones[ bn ].group, g, m );

		// fold pose (T = 0, no suspension) defines where each bone sits in the truck
		this.poseSkeleton( 0, null );
		this.fold = {};
		for ( const b of this.boneOrder ) this.fold[ b.name ] = b.world.clone();

		// panels
		const car = buildCar( M );
		this.panels = [];
		const names = Object.keys( car );
		for ( const name of names ) if ( ! PANELS[ name ].follow ) this.addPanel( name, car[ name ] );
		for ( const name of names ) if ( PANELS[ name ].follow ) this.addPanel( name, car[ name ] );
		this.buildWheels();
		this.pose( 0, null );

	}

	addMesh( parent, g, m ) {

		const mesh = new THREE.Mesh( g, m );
		g.computeBoundingBox();
		// small parts don't earn a place in the shadow pass
		mesh.castShadow = ! m.userData.emissive && g.boundingBox.getSize( _v ).length() > 0.3;
		mesh.receiveShadow = true;
		mesh.userData.support = support( g );
		parent.add( mesh );
		return mesh;

	}

	addPanel( name: string, def: { parts?: Array<[THREE.BufferGeometry, THREE.Material]> }, extra: { center?: THREE.Vector3; wheel?: { center: THREE.Vector3; front: boolean } } = {} ) {

		const spec = PANELS[ name ];
		if ( ! spec ) throw new Error( 'no choreography for panel ' + name );
		const bone = this.bones[ spec.bone ];
		const group = new THREE.Group();
		group.matrixAutoUpdate = false;
		this.root.add( group );
		const center = new THREE.Vector3();
		const box = new THREE.Box3();
		for ( const [ g, m ] of def.parts || [] ) {

			this.addMesh( group, g, m );
			box.union( g.boundingBox );

		}

		if ( extra.center ) center.copy( extra.center ); else box.getCenter( center );
		const A = this.fold[ spec.bone ].clone().invert();
		const p: any = { name, bone, group, A, steps: [], wheel: extra.wheel || null };

		// resolve steps (own + followed) into bone-space transforms with fixed pivots
		const steps = spec.steps || [];
		const c = center.clone().applyMatrix4( A );
		for ( const st of steps ) {

			const s: any = { a: st.at[ 0 ], b: st.at[ 1 ], ease: st.ease === 'lock' ? lockEase : smooth };
			if ( st.rot ) {

				s.axis = new THREE.Vector3( st.rot[ 0 ] === 'x' ? 1 : 0, st.rot[ 0 ] === 'y' ? 1 : 0, st.rot[ 0 ] === 'z' ? 1 : 0 );
				s.angle = deg( st.rot[ 1 ] );
				const pv = st.pivot || 'c';
				s.pivot = pv === 'c' ? c.clone() : Array.isArray( pv ) && pv[ 0 ] === 'c' ? c.clone().add( new THREE.Vector3( pv[ 1 ], pv[ 2 ], pv[ 3 ] ) ) : new THREE.Vector3( ...pv );
				s.full = new THREE.Matrix4().makeTranslation( s.pivot.x, s.pivot.y, s.pivot.z ).multiply( new THREE.Matrix4().makeRotationAxis( s.axis, s.angle ) ).multiply( new THREE.Matrix4().makeTranslation( - s.pivot.x, - s.pivot.y, - s.pivot.z ) );

			} else if ( st.move ) {

				s.move = new THREE.Vector3( ...st.move );
				s.full = new THREE.Matrix4().makeTranslation( s.move.x, s.move.y, s.move.z );

			} else if ( st.pop ) {

				s.pop = new THREE.Vector3( ...st.pop );
				s.full = new THREE.Matrix4();

			}

			c.applyMatrix4( s.full );
			p.steps.push( s );

		}

		if ( spec.follow ) {

			const host = this.panels.find( ( q ) => q.name === spec.follow );
			if ( ! host ) throw new Error( spec.follow + ' must be built before ' + name );
			p.steps.push( ...host.steps );

		}

		this.panels.push( p );
		return p;

	}

	buildWheels() {

		const wg = wheelGeometry( this.M );
		this.wheels = [];
		for ( const [ S, s ] of [ [ 'R', 1 ], [ 'L', - 1 ] ] as const ) {

			for ( const [ front, z ] of [ [ true, C.FA ], [ false, C.RA ] ] as const ) {

				const name = ( front ? 'wheelF' : 'wheelR' ) + S;
				const def = { parts: wg.map( ( [ g, m ] ): [THREE.BufferGeometry, THREE.Material] => {

					const gg = g.clone();
					if ( s < 0 ) gg.rotateY( Math.PI );
					return [ gg, m ];

				} ) };
				const center = new THREE.Vector3( s * C.WX, C.WR, z );
				const p = this.addPanel( name, def, { wheel: { center, front }, center: new THREE.Vector3() } );
				// geometry sits at the origin: A maps wheel-local -> bone, rebuilt each frame in car mode
				p.carPose = new THREE.Matrix4();
				this.wheels.push( p );

			}

		}

	}

	/* ------------------------------------------------------------------ */
	/*  Skeleton pose from tracks (+ locomotion at T = 1)                  */
	/* ------------------------------------------------------------------ */
	poseSkeleton( T, gait ) {

		const B = this.bones;
		const st = standValues( gait );
		const tr = ( name, key = name ) => evalTrack( TRACKS[ name ], T, st[ key ] );

		// root
		const r = tr( 'root' );
		const rootM = _m.makeRotationX( deg( r[ 3 ] ) );
		if ( r.length > 4 ) rootM.premultiply( _m2.makeRotationZ( deg( r[ 4 ] ) ) );
		rootM.setPosition( r[ 0 ], r[ 1 ], r[ 2 ] );
		B.pelvis.world.copy( rootM );

		const setRot = ( b, v ) => b.euler.set( deg( v[ 0 ] ), deg( v[ 1 ] || 0 ), deg( v[ 2 ] || 0 ) );
		setRot( B.spine, tr( 'spine' ) );
		setRot( B.chest, tr( 'chest' ) );
		const nk = tr( 'neck' );
		setRot( B.neck, nk );
		B.neck.move.set( 0, nk[ 3 ], 0 );
		setRot( B.head, tr( 'head' ) );

		for ( const [ S, s ] of [ [ 'R', 1 ], [ 'L', - 1 ] ] as const ) {

			const mir = ( v ) => ( s > 0 ? v : mirrorRot( v ) );
			const cl = tr( 'clav', 'clav' + S );
			B[ 'clav' + S ].move.set( s * cl[ 0 ], cl[ 1 ], cl[ 2 ] );
			setRot( B[ 'upper' + S ], mir( tr( 'upper', 'upper' + S ) ) );
			B[ 'fore' + S ].euler.set( deg( tr( 'fore', 'fore' + S )[ 0 ] ), 0, 0 );
			const h = tr( 'hand', 'hand' + S );
			setRot( B[ 'hand' + S ], mir( h ) );
			B[ 'hand' + S ].move.set( 0, h[ 3 ], 0 );
			const c = tr( 'curl', 'curl' + S )[ 0 ];
			for ( let f = 0; f < 4; f ++ ) {

				const k = c * ( 0.85 + f * 0.08 );
				B[ `f${ f }a${ S }` ].euler.set( 0, 0, - s * ( 0.35 * k + 0.08 * Math.max( 0, - c ) * ( f - 1.5 ) ) );
				B[ `f${ f }b${ S }` ].euler.set( 0, 0, - s * 1.0 * k );
				B[ `f${ f }c${ S }` ].euler.set( 0, 0, - s * 0.8 * k );

			}

			B[ 'thumbA' + S ].euler.set( 0.5 * c, 0, - s * 0.3 * Math.max( c, 0 ) );
			B[ 'thumbB' + S ].euler.set( 0.45 * c, 0, 0 );
			const toe = tr( 'toe', 'toe' + S );
			B[ 'toe' + S ].euler.set( deg( toe[ 0 ] ), 0, 0 );
			B[ 'toe' + S ].move.set( 0, 0, toe[ 1 ] );

		}

		// upper body first (legs need the pelvis only)
		for ( const b of this.boneOrder ) if ( b !== B.pelvis && ! /^(thigh|shin|foot|toe)/.test( b.name ) ) b.update();

		// legs: IK to keyed / gait foot targets
		for ( const [ S, s ] of [ [ 'R', 1 ], [ 'L', - 1 ] ] as const ) {

			const a = tr( 'ankle', 'ankle' + S );
			const target = new THREE.Vector3( s * a[ 0 ], a[ 1 ], a[ 2 ] );
			this.legIK( S, target, a[ 3 ], st[ 'footPitch' + S ] || 0 );

		}

	}

	legIK( S, target, flat, footPitch ) {

		const B = this.bones;
		const thigh = B[ 'thigh' + S ], shin = B[ 'shin' + S ], foot = B[ 'foot' + S ], toe = B[ 'toe' + S ];
		const inv = _m.copy( B.pelvis.world ).invert();
		const d = target.clone().applyMatrix4( inv ).sub( thigh.offset );
		const L1 = LEG.thigh, L2 = LEG.shin;
		const roll = Math.atan2( d.x, - d.y );
		const dp = d.clone().applyAxisAngle( new THREE.Vector3( 0, 0, 1 ), - roll );
		const D = clamp( dp.length(), 0.3, L1 + L2 - 1e-4 );
		const phi = Math.atan2( - dp.z, - dp.y );
		const alpha = Math.acos( clamp( ( L1 * L1 + D * D - L2 * L2 ) / ( 2 * L1 * D ), - 1, 1 ) );
		const knee = Math.PI - Math.acos( clamp( ( L1 * L1 + L2 * L2 - D * D ) / ( 2 * L1 * L2 ), - 1, 1 ) );
		thigh.euler.set( phi - alpha, 0, roll, 'ZXY' );
		shin.euler.set( knee, 0, 0 );
		thigh.update();
		shin.update();

		// foot: blend from its folded (relative) pose to lying flat on the ground
		foot.useQuat = true;
		foot.quat.identity();
		if ( flat > 0 ) {

			const shinQ = new THREE.Quaternion().setFromRotationMatrix( shin.world );
			const want = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 1, 0, 0 ), footPitch );
			const flatQ = shinQ.invert().multiply( want );
			foot.quat.slerp( flatQ, flat );

		}

		foot.update();
		toe.update();

	}

	/* ------------------------------------------------------------------ */
	/*  Full pose                                                          */
	/* ------------------------------------------------------------------ */
	pose( T, gait ) {

		this.T = T;
		this.poseSkeleton( T, gait );
		for ( const b of this.boneOrder ) b.group.matrix.copy( b.world );

		// panels
		const carW = 1 - smooth( clamp( T / 0.06, 0, 1 ) );
		const Ginv = ( this._Ginv ||= new THREE.Matrix4() ).copy( this.suspension ).invert();
		for ( const p of this.panels ) {

			const M = p.group.matrix;
			if ( p.wheel ) {

				// live car pose of the wheel (steer, spin, suspension-compensated), expressed in fold-bone space
				const w = p.wheel;
				// unsprung: wheel centres follow the body in x/z but stay at tyre radius
				const c = w.center.clone();
				if ( carW > 0 ) {

					c.applyMatrix4( this.suspension );
					c.y = C.WR;

				}

				p.carPose.makeRotationY( w.front ? this.steer * carW : 0 )
					.multiply( _m.makeRotationX( this.spin ) )
					.setPosition( c );
				if ( carW > 0 ) p.carPose.premultiply( Ginv );
				M.multiplyMatrices( p.A, p.carPose );

			} else M.copy( p.A );

			for ( const s of p.steps ) {

				const u = clamp( ( T - s.a ) / ( s.b - s.a ), 0, 1 );
				if ( u <= 0 ) continue;
				if ( u >= 1 && ! s.pop ) {

					M.premultiply( s.full );
					continue;

				}

				const e = s.ease( u );
				if ( s.axis ) {

					_m.makeTranslation( s.pivot.x, s.pivot.y, s.pivot.z )
						.multiply( _m2.makeRotationAxis( s.axis, s.angle * e ) )
						.multiply( _m3.makeTranslation( - s.pivot.x, - s.pivot.y, - s.pivot.z ) );
					M.premultiply( _m );

				} else if ( s.move ) {

					M.premultiply( _m.makeTranslation( s.move.x * e, s.move.y * e, s.move.z * e ) );

				} else if ( s.pop ) {

					const k = Math.sin( Math.PI * u );
					M.premultiply( _m.makeTranslation( s.pop.x * k, s.pop.y * k, s.pop.z * k ) );

				}

			}

			M.premultiply( p.bone.world );

		}

		// ground: suspension in car mode, contact solve otherwise
		this.G.copy( this.suspension );
		if ( T > 0 ) {

			const lowest = this.lowest( T >= 1 );
			this.lift = - lowest;
			this.G.makeTranslation( 0, this.lift, 0 );
			if ( carW > 0 ) this.G.multiply( this.suspension );

		} else this.lift = 0;

		for ( const b of this.boneOrder ) b.group.matrix.premultiply( this.G );
		for ( const p of this.panels ) p.group.matrix.premultiply( this.G );
		this.root.updateMatrixWorld( true );

	}

	/** lowest point of the assembly (support vertices), before the ground offset */
	lowest( feetOnly ) {

		let m = Infinity;
		const v = _v;
		const scan = ( group ) => {

			for ( const mesh of group.children ) for ( const s of mesh.userData.support ) {

				v.copy( s ).applyMatrix4( group.matrix );
				if ( v.y < m ) m = v.y;

			}

		};

		if ( feetOnly ) {

			for ( const S of [ 'R', 'L' ] ) {

				scan( this.bones[ 'foot' + S ].group );
				scan( this.bones[ 'toe' + S ].group );
				const n = this.panels.find( ( p ) => p.name === 'nose' + S );
				scan( n.group );

			}

			return m;

		}

		for ( const b of this.boneOrder ) scan( b.group );
		for ( const p of this.panels ) {

			if ( p.wheel ) {

				v.setFromMatrixPosition( p.group.matrix );
				if ( v.y - C.WR < m ) m = v.y - C.WR;

			} else scan( p.group );

		}

		return m;

	}

	/** world-space points for effects */
	contacts() {

		const out = { wheels: [], feet: {} };
		for ( const w of this.wheels ) {

			const p = new THREE.Vector3().setFromMatrixPosition( w.group.matrixWorld );
			p.y -= C.WR;
			out.wheels.push( { p, front: w.wheel.front } );

		}

		for ( const S of [ 'R', 'L' ] ) out.feet[ S ] = new THREE.Vector3( 0, - 0.3, 0 ).applyMatrix4( this.bones[ 'foot' + S ].group.matrixWorld );
		return out;

	}

}

/** 26-direction support vertices of a geometry (for cheap ground contact) */
function support( g ) {

	const pos = g.attributes.position;
	const dirs = [];
	for ( let x = - 1; x <= 1; x ++ ) for ( let y = - 1; y <= 1; y ++ ) for ( let z = - 1; z <= 1; z ++ ) if ( x || y || z ) dirs.push( new THREE.Vector3( x, y, z ).normalize() );
	const best = dirs.map( () => [ - Infinity, null ] );
	const v = new THREE.Vector3();
	for ( let i = 0; i < pos.count; i ++ ) {

		v.fromBufferAttribute( pos, i );
		for ( let d = 0; d < dirs.length; d ++ ) {

			const k = v.dot( dirs[ d ] );
			if ( k > best[ d ][ 0 ] ) best[ d ] = [ k, i ];

		}

	}

	const uniq = [ ...new Set( best.map( ( b ) => b[ 1 ] ) ) ];
	return uniq.map( ( i ) => new THREE.Vector3().fromBufferAttribute( pos, i ) );

}

/** values the tracks blend into at T = 1: the live, walking robot */
function standValues( g ) {

	const gg = g || { legs: { R: { step: 0, up: 0, pitch: 0 }, L: { step: 0, up: 0, pitch: 0 } }, crouch: 0.1, sway: 0, bob: 0, lean: 0, twist: 0, arms: { R: 0, L: 0 }, elbow: { R: 0, L: 0 }, headYaw: 0, headPitch: 0, curl: 0.45, breath: 0 };
	const v = {
		root: [ gg.sway, HIP - gg.crouch, ROBOT_Z, gg.lean * 0.5, gg.roll || 0 ],
		spine: [ 4 + gg.lean * 0.4 + gg.breath, gg.twist, 0 ],
		chest: [ gg.lean * 0.3 - gg.breath, gg.twist * 0.6, 0 ],
		neck: [ - gg.lean * 0.4, gg.headYaw * 0.4, 0, 0.1 ],
		head: [ 4 + gg.headPitch, gg.headYaw * 0.6, 0 ]
	};
	for ( const [ S ] of [ [ 'R', 1 ], [ 'L', - 1 ] ] ) {

		v[ 'clav' + S ] = [ 0, 0, 0 ];
		v[ 'upper' + S ] = [ 4 + gg.arms[ S ], 0, 9 ];
		v[ 'fore' + S ] = [ - 22 + gg.elbow[ S ] ];
		v[ 'hand' + S ] = [ - 4, 0, 0, 0 ];
		v[ 'curl' + S ] = [ gg.curl ];
		v[ 'toe' + S ] = [ 12 + ( gg.legs[ S ].toe || 0 ), 0 ];
		const L = gg.legs[ S ];
		v[ 'ankle' + S ] = [ 0.72, LEG.ankle + L.up, ROBOT_Z + L.step, 1 ];
		v[ 'footPitch' + S ] = L.pitch;

	}

	return v;

}
