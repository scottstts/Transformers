import { abs, float, max, select, uniformArray, vec2 } from 'three/tsl';
import { Vector4 } from 'three/webgpu';

/**
 * Where the desert floor is paved (the fortress's aprons, roads, gate
 * passages, garage and hangar floors, helipads) and how high the paving's
 * top stands: what a mark left on the ground should look like depends on
 * what it lands on. Fused glass and a sand crater belong to sand; concrete
 * spalls, cracks and chars.
 *
 * Shapes are oriented rectangles or discs in world space, a few dozen, held
 * in a uniform array. A mark lists the (at most NEAR) shapes near it when it
 * is laid (`near`), and its fragment stage tests only those (`topNode`): a
 * crater's quad can cover a quarter of the screen, and testing every shape
 * there cost far more than the mark. Marks are drawn only over the ground
 * where they sit: the sand's under the paving, the paving's on each of its
 * levels (`levels`).
 */
export interface PavedShape {
	x: number;
	z: number;
	/** world yaw (three's Y rotation) of the shape's frame */
	yaw: number;
	/** half extents (m) across its frame's x and z; a disc's radius is `hx` */
	hx: number;
	hz: number;
	/** height of the paving's top (m) */
	top: number;
	round: boolean;
}

/** Room for this many shapes in the shaders' uniform array; a mark tests at most NEAR of them. */
const CAPACITY = 64;
export const NEAR = 8;

export class PavedGround {

	readonly shapes: PavedShape[] = [];
	/** the distinct heights paving stands at (a mark is drawn once per level) */
	readonly levels: number[] = [];
	private readonly data = Array.from( { length: CAPACITY * 2 }, () => new Vector4() );
	private readonly array = uniformArray( this.data );

	add( shape: PavedShape ): void {

		if ( this.shapes.length >= CAPACITY ) throw new Error( `PavedGround holds at most ${ CAPACITY } shapes` );
		const i = this.shapes.length;
		this.shapes.push( shape );
		this.data[ i * 2 ].set( shape.x, shape.z, Math.cos( shape.yaw ), Math.sin( shape.yaw ) );
		this.data[ i * 2 + 1 ].set( shape.hx, shape.hz, shape.top, shape.round ? 1 : 0 );
		if ( ! this.levels.some( ( l ) => Math.abs( l - shape.top ) < 1e-3 ) ) this.levels.push( shape.top );

	}

	/** The paving's top at world (x, z), or -1 on bare ground. */
	top( x: number, z: number ): number {

		let top = - 1;
		for ( const s of this.shapes ) {

			const dx = x - s.x, dz = z - s.z;
			const c = Math.cos( s.yaw ), sn = Math.sin( s.yaw );
			const inside = s.round
				? Math.hypot( dx, dz ) <= s.hx
				: Math.abs( dx * c - dz * sn ) <= s.hx && Math.abs( dx * sn + dz * c ) <= s.hz;
			if ( inside ) top = Math.max( top, s.top );

		}
		return top;

	}

	/**
	 * Up to NEAR shapes whose bounds come within `radius` of world (x, z),
	 * nearest first, into `out` (-1 for none): a mark tests only the shapes
	 * under it.
	 */
	near( x: number, z: number, radius: number, out: Float32Array ): void {

		const found: Array<{ i: number; d: number }> = [];
		this.shapes.forEach( ( s, i ) => {

			const d = Math.hypot( x - s.x, z - s.z ) - Math.hypot( s.hx, s.hz );
			if ( d < radius ) found.push( { i, d } );

		} );
		found.sort( ( a, b ) => a.d - b.d );
		for ( let k = 0; k < NEAR; k ++ ) out[ k ] = k < found.length ? found[ k ].i : - 1;

	}

	/**
	 * The paving's top under a world (x, z) node, or -1 on bare ground: the
	 * shapes listed (by `near`) in the two index nodes are tested, the rest
	 * are too far to matter.
	 */
	topNode( xz, near0, near1 ): any {

		let top: any = float( - 1 );
		for ( const [ node, comps ] of [ [ near0, [ 'x', 'y', 'z', 'w' ] ], [ near1, [ 'x', 'y', 'z', 'w' ] ] ] as const ) {

			for ( const c of comps ) {

				const index = node[ c ];
				const i = max( index, 0 ).toInt();
				const a = this.array.element( i.mul( 2 ) ) as any;
				const b = this.array.element( i.mul( 2 ).add( 1 ) ) as any;
				const d = xz.sub( a.xy );
				const local = vec2( d.x.mul( a.z ).sub( d.y.mul( a.w ) ), d.x.mul( a.w ).add( d.y.mul( a.z ) ) );
				const inRect = abs( local.x ).lessThanEqual( b.x ).and( abs( local.y ).lessThanEqual( b.y ) );
				const inDisc = d.length().lessThanEqual( b.x );
				const inside = select( b.w.greaterThan( 0.5 ), inDisc, inRect ).and( index.greaterThanEqual( 0 ) );
				top = select( inside, max( top, b.z ), top );

			}

		}
		return top;

	}

}
