import * as THREE from 'three/webgpu';

export class Bone {
	name: string;
	parent: Bone | null;
	offset: THREE.Vector3;
	euler: THREE.Euler;
	quat: THREE.Quaternion;
	useQuat: boolean;
	move: THREE.Vector3;
	local: THREE.Matrix4;
	world: THREE.Matrix4;
	group: THREE.Group;

	constructor( name: string, parent: Bone | null, offset: [number, number, number] ) {

		this.name = name;
		this.parent = parent;
		this.offset = new THREE.Vector3( ...offset );
		this.euler = new THREE.Euler( 0, 0, 0, 'XYZ' );
		this.quat = new THREE.Quaternion();
		this.useQuat = false;
		this.move = new THREE.Vector3();
		this.local = new THREE.Matrix4();
		this.world = new THREE.Matrix4();
		this.group = new THREE.Group();
		this.group.matrixAutoUpdate = false;

	}

	update() {

		const q = this.useQuat ? this.quat : _q.setFromEuler( this.euler );
		_v.copy( this.offset ).add( this.move );
		this.local.compose( _v, q, _one );
		if ( this.parent ) this.world.multiplyMatrices( this.parent.world, this.local );

	}

}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _one = new THREE.Vector3( 1, 1, 1 );
