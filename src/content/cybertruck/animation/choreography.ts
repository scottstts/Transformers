/* =====================================================================
 *  Choreography
 *
 *  T runs 0 (truck) -> 1 (robot); played backwards for robot -> truck.
 *
 *  Beats
 *   0.00-0.10  wake: lights, mirrors fold, wiper parks, panels unlatch
 *   0.08-0.38  SIT-UP: the rear of the truck rises about the hips like a
 *              torso sitting up; arms press into the ground behind it
 *   0.18-0.56  chest armour reconfigures (tonneau -> pecs & shoulder yoke,
 *              roof -> abs, tailgate opens, rear light bar flips forward)
 *   0.34-0.62  TUCK: knees come up, feet plant, leg armour settles
 *   0.44-0.82  shoulders slide out, arms swing wide, forearm doors lock,
 *              hands deploy; head rises out of the bed
 *   0.55-0.92  STAND: pelvis rises, legs straighten
 *   0.86-1.00  settle, hand-over to locomotion
 *
 *  Tracks: [T, values]; 'STAND' = live locomotion values.
 *  Per-side tracks are authored for R (+x) and mirrored for L.
 * ===================================================================== */

export const DURATION = 8.0;

export const TRACKS = {
	// pelvis world pose in vehicle space: x, y, z, pitch(deg)
	root: [
		[ 0, [ 0, 0.92, - 0.29, - 90 ] ],
		[ 0.08, [ 0, 0.92, - 0.29, - 90 ] ],
		[ 0.24, [ 0, 0.95, - 0.27, - 50 ] ],
		[ 0.38, [ 0, 1.0, - 0.2, - 6 ] ],
		[ 0.48, [ 0, 1.14, - 0.04, 10 ] ],
		[ 0.6, [ 0, 1.62, 0.14, 17 ] ],
		[ 0.78, [ 0, 2.62, 0.27, 6 ] ],
		[ 0.9, [ 0, 3.04, 0.3, - 1 ] ],
		[ 1, 'STAND' ]
	],
	spine: [ [ 0, [ 0, 0, 0 ] ], [ 0.12, [ 0, 0, 0 ] ], [ 0.26, [ 14, 0, 0 ] ], [ 0.4, [ 6, 0, 0 ] ], [ 0.6, [ 16, 0, 0 ] ], [ 0.8, [ 5, 0, 0 ] ], [ 1, 'STAND' ] ],
	chest: [ [ 0, [ 0, 0, 0 ] ], [ 0.22, [ 8, 0, 0 ] ], [ 0.4, [ 0, 0, 0 ] ], [ 0.6, [ 8, 0, 0 ] ], [ 0.85, [ - 3, 0, 0 ] ], [ 1, 'STAND' ] ],
	// neck: rx, ry, rz, slide (retracted into the chest while folded)
	neck: [ [ 0, [ 0, 0, 0, - 0.42 ] ], [ 0.6, [ 0, 0, 0, - 0.42 ] ], [ 0.72, [ - 8, 0, 0, 0.14 ] ], [ 0.8, [ 4, 0, 0, 0.1 ] ], [ 1, 'STAND' ] ],
	head: [ [ 0, [ 25, 0, 0 ] ], [ 0.64, [ 25, 0, 0 ] ], [ 0.76, [ - 12, 0, 0 ] ], [ 0.86, [ 0, - 20, 0 ] ], [ 0.94, [ 0, 8, 0 ] ], [ 1, 'STAND' ] ],
	// clavicle slide (x, y, z): arms tucked inside the body when folded
	clav: [ [ 0, [ - 0.55, 0, 0.25 ] ], [ 0.44, [ - 0.55, 0, 0.25 ] ], [ 0.6, [ 0.02, 0.04, 0 ] ], [ 0.68, [ 0, 0, 0 ] ], [ 1, 'STAND' ] ],
	upper: [ [ 0, [ 0, 0, 0 ] ], [ 0.12, [ 0, 0, 0 ] ], [ 0.26, [ 24, 0, 4 ] ], [ 0.4, [ 14, 0, 6 ] ], [ 0.52, [ 0, 0, 30 ] ], [ 0.64, [ - 8, 0, 70 ] ], [ 0.77, [ - 6, 0, 26 ] ], [ 1, 'STAND' ] ],
	fore: [ [ 0, [ 0 ] ], [ 0.26, [ - 6 ] ], [ 0.5, [ - 40 ] ], [ 0.64, [ - 32 ] ], [ 0.78, [ - 48 ] ], [ 0.9, [ - 26 ] ], [ 1, 'STAND' ] ],
	// hand: rx, ry, rz, slide (retracted into the forearm while folded)
	hand: [ [ 0, [ 0, 0, 0, 0.3 ] ], [ 0.6, [ 0, 0, 0, 0.3 ] ], [ 0.72, [ - 12, 0, 0, 0 ] ], [ 0.85, [ 0, 0, 0, 0 ] ], [ 1, 'STAND' ] ],
	curl: [ [ 0, [ 0 ] ], [ 0.7, [ 0 ] ], [ 0.78, [ - 0.3 ] ], [ 0.9, [ 1.0 ] ], [ 1, 'STAND' ] ],
	// toe: pitch, telescope
	toe: [ [ 0, [ 0, - 0.35 ] ], [ 0.46, [ 0, - 0.35 ] ], [ 0.58, [ 12, 0 ] ], [ 1, 'STAND' ] ],
	// ankle IK target in vehicle space: x, y, z, flat-on-ground weight
	ankle: [
		[ 0, [ 0.55, 0.92, 2.53, 0 ] ],
		[ 0.3, [ 0.55, 0.92, 2.53, 0 ] ],
		[ 0.4, [ 0.64, 0.86, 2.3, 0.1 ] ],
		[ 0.5, [ 0.74, 0.56, 1.35, 0.7 ] ],
		[ 0.6, [ 0.74, 0.33, 0.62, 1 ] ],
		[ 0.8, [ 0.72, 0.33, 0.36, 1 ] ],
		[ 1, 'STAND' ]
	]
};

/* ------------------------------------------------------------------ */
/*  Panels: bone + mechanical steps in that bone's frame               */
/*  step: { at:[t0,t1], rot:[axis,deg], pivot } | { move:[x,y,z] } |   */
/*        { pop:[x,y,z] }  (lift off & return: an unlatch)             */
/*  pivot: 'c' (panel centre at that stage) | ['c',dx,dy,dz] | [x,y,z]  */
/* ------------------------------------------------------------------ */
const THIGH_AXIS = [ 0, - 0.7, 0 ];
const R = {
	/* legs: door skin orbits to the thigh front, windshield half orbits to the outside */
	glassWS: { bone: 'thigh', steps: [
		{ at: [ 0.1, 0.2 ], pop: [ 0, 0, 0.05 ] },
		{ at: [ 0.3, 0.4 ], move: [ 0, 0, 0.15 ] },
		{ at: [ 0.34, 0.52 ], rot: [ 'y', 90 ], pivot: THIGH_AXIS, ease: 'lock' },
		{ at: [ 0.46, 0.6 ], move: [ - 0.5, 0.03, 0 ], ease: 'lock' }
	] },
	winF: { bone: 'thigh', steps: [ { at: [ 0.04, 0.16 ], move: [ 0, 0, - 0.46 ] } ], follow: 'door' },
	door: { bone: 'thigh', steps: [
		{ at: [ 0.12, 0.22 ], pop: [ 0.06, 0, 0 ] },
		{ at: [ 0.42, 0.6 ], rot: [ 'y', - 90 ], pivot: THIGH_AXIS, ease: 'lock' },
		{ at: [ 0.48, 0.62 ], move: [ 0, 0.02, - 0.14 ] }
	] },
	mirror: { bone: 'thigh', steps: [ { at: [ 0.02, 0.1 ], rot: [ 'z', 80 ], pivot: [ 0.45, - 1.27, 0.32 ] } ], follow: 'door' },
	rockerF: { bone: 'thigh', follow: 'door' },
	floorT: { bone: 'thigh', steps: [ { at: [ 0.36, 0.56 ], move: [ - 0.02, 0, 0.1 ] } ] },
	hood: { bone: 'shin', steps: [
		{ at: [ 0.14, 0.24 ], pop: [ 0, 0, 0.05 ] },
		{ at: [ 0.38, 0.58 ], rot: [ 'x', - 9 ], pivot: [ 'c', 0, 0.69, 0.17 ], ease: 'lock' },
		{ at: [ 0.38, 0.58 ], move: [ 0, 0, - 0.14 ] },
		{ at: [ 0.44, 0.6 ], rot: [ 'y', - 26 ], pivot: [ 'c', 0.3, 0, 0 ] }
	] },
	fender: { bone: 'shin', steps: [
		{ at: [ 0.16, 0.26 ], pop: [ 0.06, 0, 0 ] },
		{ at: [ 0.4, 0.6 ], move: [ - 0.14, 0, - 0.02 ], ease: 'lock' },
		{ at: [ 0.44, 0.62 ], rot: [ 'y', 8 ], pivot: 'c' }
	] },
	wheelF: { bone: 'shin', follow: 'fender' },
	floorS: { bone: 'shin', steps: [ { at: [ 0.4, 0.58 ], move: [ 0, 0, 0.06 ] } ] },
	nose: { bone: 'foot', steps: [
		{ at: [ 0.4, 0.52 ], pop: [ 0, - 0.04, 0 ] },
		{ at: [ 0.46, 0.6 ], move: [ - 0.05, 0, 0.1 ], ease: 'lock' }
	] },

	/* torso */
	// roof glass halves orbit around the waist to become lower-back plates
	roof: { bone: 'spine', steps: [
		{ at: [ 0.2, 0.3 ], pop: [ 0, 0, 0.06 ] },
		{ at: [ 0.3, 0.56 ], rot: [ 'y', 150 ], pivot: [ 0.3, 0, 0 ], ease: 'lock' },
		{ at: [ 0.46, 0.6 ], move: [ - 0.06, 0.06, 0.02 ] }
	] },
	tonA: { bone: 'chest', steps: [
		{ at: [ 0.18, 0.28 ], pop: [ 0, 0, 0.08 ] },
		{ at: [ 0.28, 0.5 ], move: [ 0.04, 0.26, - 0.14 ], ease: 'lock' },
		{ at: [ 0.34, 0.54 ], rot: [ 'y', - 12 ], pivot: 'c' }
	] },
	tonB: { bone: 'chest', steps: [
		{ at: [ 0.2, 0.3 ], pop: [ 0, 0, 0.08 ] },
		{ at: [ 0.26, 0.4 ], move: [ 0.2, 0, 0 ] },
		{ at: [ 0.3, 0.52 ], rot: [ 'x', - 62 ], pivot: [ 'c', 0, - 0.46, 0.06 ], ease: 'lock' },
		{ at: [ 0.4, 0.56 ], move: [ 0, - 0.05, - 0.05 ] }
	] },
	bumper: { bone: 'chest', steps: [
		{ at: [ 0.3, 0.4 ], pop: [ 0, 0, - 0.05 ] },
		{ at: [ 0.4, 0.62 ], move: [ 0.08, - 1.02, 0 ], ease: 'lock' },
		{ at: [ 0.45, 0.62 ], rot: [ 'x', - 12 ], pivot: 'c' }
	] },

	/* arms: quarter + sail + wheel close around the upper arm */
	quarter: { bone: 'upper', steps: [
		{ at: [ 0.22, 0.32 ], pop: [ 0.05, 0, 0 ] },
		{ at: [ 0.5, 0.7 ], move: [ - 0.1, - 0.42, 0.14 ], ease: 'lock' },
		{ at: [ 0.56, 0.72 ], rot: [ 'z', 4 ], pivot: 'c' }
	] },
	sail: { bone: 'upper', follow: 'quarter' },
	wheelR: { bone: 'upper', follow: 'quarter' },
	rdoor: { bone: 'fore', steps: [
		{ at: [ 0.24, 0.34 ], pop: [ 0.05, 0, 0 ] },
		{ at: [ 0.54, 0.72 ], rot: [ 'y', 16 ], pivot: 'c', ease: 'lock' },
		{ at: [ 0.54, 0.72 ], move: [ - 0.04, 0, 0.16 ] }
	] },
	rockerR: { bone: 'fore', follow: 'rdoor' },
	winR: { bone: 'fore', steps: [ { at: [ 0.06, 0.18 ], move: [ 0, 0, - 0.46 ] } ], follow: 'rdoor' }
};

// singles (not mirrored)
const SINGLE = {
	// the whole rear face (tailgate + light bar) flips up and slides down to become the chest plate
	tailgate: { bone: 'chest', steps: [
		{ at: [ 0.2, 0.38 ], rot: [ 'x', 90 ], pivot: [ 0, 1.87, 0.5 ], ease: 'lock' },
		{ at: [ 0.46, 0.66 ], move: [ 0, - 1.4, 0.17 ], ease: 'lock' }
	] },
	taillight: { bone: 'chest', follow: 'tailgate' },
	floorP: { bone: 'pelvis', steps: [ { at: [ 0.3, 0.5 ], move: [ 0, 0, 0.04 ] } ] },
	floorW: { bone: 'spine', steps: [ { at: [ 0.3, 0.5 ], move: [ 0, 0, 0.05 ] } ] },
	floorC: { bone: 'chest', steps: [ { at: [ 0.3, 0.52 ], move: [ 0, - 0.3, 0.05 ] } ] },
	wiper: { bone: 'thighL', steps: [ { at: [ 0.03, 0.12 ], rot: [ 'z', 75 ], pivot: [ - 0.11, - 1.34, 0.58 ] } ], follow: 'glassWSL' }
};

function mirrorStep( st ) {

	const o = { ...st };
	if ( st.rot ) o.rot = [ st.rot[ 0 ], st.rot[ 0 ] === 'x' ? st.rot[ 1 ] : - st.rot[ 1 ] ];
	if ( st.move ) o.move = [ - st.move[ 0 ], st.move[ 1 ], st.move[ 2 ] ];
	if ( st.pop ) o.pop = [ - st.pop[ 0 ], st.pop[ 1 ], st.pop[ 2 ] ];
	if ( Array.isArray( st.pivot ) ) o.pivot = st.pivot[ 0 ] === 'c' ? [ 'c', - st.pivot[ 1 ], st.pivot[ 2 ], st.pivot[ 3 ] ] : [ - st.pivot[ 0 ], st.pivot[ 1 ], st.pivot[ 2 ] ];
	return o;

}

export const PANELS = { ...SINGLE };
for ( const [ S, s ] of [ [ 'R', 1 ], [ 'L', - 1 ] ] as const ) {

	for ( const k in R ) {

		const d = R[ k ];
		PANELS[ k + S ] = {
			bone: [ 'spine', 'chest', 'pelvis' ].includes( d.bone ) ? d.bone : d.bone + S,
			steps: ( d.steps || [] ).map( ( st ) => ( s > 0 ? st : mirrorStep( st ) ) ),
			follow: d.follow ? d.follow + S : null
		};

	}

}

/* ------------------------------------------------------------------ */
/*  Mechanical events for sound design: [id, t0, t1, kind]             */
/* ------------------------------------------------------------------ */
export const EVENTS = [
	[ 'mirrors', 0.02, 0.1, 'servo-s' ],
	[ 'unlatch', 0.1, 0.3, 'latches' ],
	[ 'situp', 0.1, 0.38, 'heavy' ],
	[ 'tailgate', 0.18, 0.34, 'servo' ],
	[ 'chest', 0.28, 0.54, 'hydraulic' ],
	[ 'legs', 0.34, 0.6, 'hydraulic' ],
	[ 'feet', 0.46, 0.6, 'servo' ],
	[ 'shoulders', 0.44, 0.68, 'hydraulic' ],
	[ 'forearms', 0.54, 0.72, 'servo' ],
	[ 'rise', 0.55, 0.9, 'heavy-rise' ],
	[ 'neck', 0.6, 0.8, 'hydraulic' ],
	[ 'hands', 0.66, 0.8, 'servo-s' ],
	[ 'fists', 0.78, 0.9, 'servo-s' ],
	[ 'settle', 0.88, 1.0, 'settle' ]
];
