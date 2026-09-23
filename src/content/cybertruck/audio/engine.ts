/**
 * Procedural sound design, all synthesized with Web Audio:
 *
 *   servo      geared electric actuator: detuned saw pair through a resonant
 *              band-pass that tracks motor RPM, plus gear-mesh chatter
 *              (noise amplitude-modulated at the tooth frequency)
 *   hydraulic  pump drone + pressurised fluid hiss, pressure-release at the end
 *   lock       modal metal synthesis (inharmonic partials of a steel plate)
 *              + a hard transient + low body thump -> the "clunk" of a joint
 *              locking into place
 *   latch      two-stage mechanical click
 *   footfall   sub-bass impact, ground thud, gravel crunch granules, servo
 *              exhale and a faint metallic ring
 *   motor      Cybertruck-style EV whine + tyre roar + gravel for driving
 *
 * Everything runs through a bus compressor and a generated convolution
 * reverb (open desert: short, bright early reflections, long thin tail).
 */
interface MotorVoices {
	gain: GainNode;
	o1: OscillatorNode;
	o2: OscillatorNode;
	bp: BiquadFilterNode;
	road: GainNode;
	roadLp: BiquadFilterNode;
	gravel: GainNode;
}

export class CybertruckAudio {
	ctx: AudioContext | null = null;
	enabled = true;
	out: GainNode;
	bus: GainNode;
	verb: ConvolverNode;
	verbSend: GainNode;
	white: AudioBuffer;
	brown: AudioBuffer;
	motor: MotorVoices;

	constructor() {

		this.ctx = null;
		this.enabled = true;

	}

	init() {

		if ( this.ctx ) return true;
		try {

			const Context = window.AudioContext || ( window as typeof window & { webkitAudioContext?: typeof AudioContext } ).webkitAudioContext;
			if ( ! Context ) return false;
			const ctx = this.ctx = new Context();

			this.out = ctx.createGain();
			this.out.gain.value = 0.9;
			const comp = ctx.createDynamicsCompressor();
			comp.threshold.value = - 16; comp.knee.value = 12; comp.ratio.value = 4;
			comp.attack.value = 0.004; comp.release.value = 0.2;
			this.bus = ctx.createGain();
			this.bus.connect( comp ).connect( this.out ).connect( ctx.destination );

			this.verb = ctx.createConvolver();
			this.verb.buffer = this.impulse( 2.4 );
			this.verbSend = ctx.createGain();
			this.verbSend.gain.value = 0.32;
			this.verbSend.connect( this.verb ).connect( this.bus );

			this.white = this.noiseBuffer( 2, 'white' );
			this.brown = this.noiseBuffer( 2, 'brown' );
			this.buildMotor();
			return true;

		} catch {

			return false;

		}

	}

	resume() {

		if ( this.init() && this.ctx.state === 'suspended' ) this.ctx.resume();

	}

	setMuted( m ) {

		this.enabled = ! m;
		if ( this.ctx ) this.out.gain.setTargetAtTime( m ? 0 : 0.9, this.ctx.currentTime, 0.05 );

	}

	/* --------------------------- building blocks --------------------------- */

	noiseBuffer( sec, kind ) {

		const ctx = this.ctx, n = ctx.sampleRate * sec;
		const b = ctx.createBuffer( 1, n, ctx.sampleRate );
		const d = b.getChannelData( 0 );
		let last = 0;
		for ( let i = 0; i < n; i ++ ) {

			const w = Math.random() * 2 - 1;
			if ( kind === 'brown' ) {

				last = ( last + 0.02 * w ) / 1.02;
				d[ i ] = last * 3.5;

			} else d[ i ] = w;

		}

		return b;

	}

	impulse( sec ) {

		const ctx = this.ctx, n = Math.floor( ctx.sampleRate * sec );
		const b = ctx.createBuffer( 2, n, ctx.sampleRate );
		for ( let c = 0; c < 2; c ++ ) {

			const d = b.getChannelData( c );
			let lp = 0;
			for ( let i = 0; i < n; i ++ ) {

				const t = i / ctx.sampleRate;
				// sparse early reflections, then a darkening exponential tail
				const early = t < 0.09 && Math.random() < 0.004 ? ( Math.random() * 2 - 1 ) * 0.9 : 0;
				const k = 0.25 + 0.7 * Math.min( 1, t / 1.2 );
				lp += ( Math.random() * 2 - 1 - lp ) * ( 1 - k );
				d[ i ] = early + lp * Math.exp( - t * 3.2 ) * ( t < 0.012 ? t / 0.012 : 1 ) * 0.6;

			}

		}

		return b;

	}

	noise( t, dur, { buf = this.white, type = 'bandpass', f = 1000, f2 = null, Q = 1, gain = 0.3, a = 0.005, r = null, dest = this.bus, send = 0, rate = 1 } = {} ) {

		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = buf;
		src.loop = true;
		src.playbackRate.value = rate;
		const fl = ctx.createBiquadFilter();
		fl.type = type as BiquadFilterType; fl.Q.value = Q;
		fl.frequency.setValueAtTime( f, t );
		if ( f2 ) fl.frequency.exponentialRampToValueAtTime( f2, t + dur );
		const g = ctx.createGain();
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( gain, t + a );
		if ( r === null ) g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );
		else {

			g.gain.setValueAtTime( gain, t + Math.max( a, dur - r ) );
			g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );

		}

		src.connect( fl ).connect( g ).connect( dest );
		if ( send ) {

			const s = ctx.createGain();
			s.gain.value = send;
			g.connect( s ).connect( this.verbSend );

		}

		src.start( t, Math.random() * 1.5 );
		src.stop( t + dur + 0.05 );
		return { g, fl };

	}

	tone( t, dur, { type = 'sine', f = 100, f2 = null, gain = 0.3, a = 0.003, dest = this.bus, send = 0, curve = 'exp' } = {} ) {

		const ctx = this.ctx;
		const o = ctx.createOscillator();
		o.type = type as OscillatorType;
		o.frequency.setValueAtTime( f, t );
		if ( f2 ) o.frequency.exponentialRampToValueAtTime( f2, t + dur * 0.9 );
		const g = ctx.createGain();
		g.gain.setValueAtTime( 0.0001, t );
		g.gain.exponentialRampToValueAtTime( gain, t + a );
		if ( curve === 'exp' ) g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );
		else g.gain.linearRampToValueAtTime( 0.0001, t + dur );
		o.connect( g ).connect( dest );
		if ( send ) {

			const s = ctx.createGain();
			s.gain.value = send;
			g.connect( s ).connect( this.verbSend );

		}

		o.start( t );
		o.stop( t + dur + 0.05 );
		return o;

	}

	/** struck steel: inharmonic modes with frequency-dependent decay */
	metal( t, { f0 = 220, gain = 0.25, decay = 1.0, send = 0.6, bright = 1 } = {} ) {

		const ratios = [ 1, 1.593, 2.135, 2.295, 2.917, 3.598, 4.153, 5.404 ];
		ratios.forEach( ( r, i ) => {

			const f = f0 * r * ( 1 + ( Math.random() - 0.5 ) * 0.01 );
			if ( f > 9000 ) return;
			const amp = gain * Math.pow( 0.72, i ) * ( i > 3 ? bright : 1 );
			this.tone( t, decay * ( 1.1 - i * 0.1 ), { f, gain: amp, a: 0.001, send } );

		} );

	}

	/* ------------------------------ sounds -------------------------------- */

	/** geared motor running for `dur` seconds */
	servo( t, dur, { pitch = 1, gain = 0.09, small = false } = {} ) {

		const ctx = this.ctx;
		const bus = ctx.createGain();
		bus.gain.value = 1;
		bus.connect( this.bus );
		const send = ctx.createGain();
		send.gain.value = 0.25;
		bus.connect( send ).connect( this.verbSend );

		const base = ( small ? 190 : 95 ) * pitch;
		const spinUp = Math.min( 0.18, dur * 0.3 );
		const env = ctx.createGain();
		env.gain.setValueAtTime( 0.0001, t );
		env.gain.exponentialRampToValueAtTime( gain, t + spinUp );
		env.gain.setValueAtTime( gain, t + dur - spinUp );
		env.gain.exponentialRampToValueAtTime( 0.0001, t + dur + 0.08 );

		const bp = ctx.createBiquadFilter();
		bp.type = 'bandpass';
		bp.Q.value = 3.5;
		bp.frequency.setValueAtTime( base * 3, t );
		bp.frequency.exponentialRampToValueAtTime( base * 9, t + spinUp );
		bp.frequency.setValueAtTime( base * 9, t + dur - spinUp );
		bp.frequency.exponentialRampToValueAtTime( base * 4, t + dur + 0.08 );
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = small ? 5200 : 3200;

		for ( const det of [ 1, 1.007, 2.003 ] ) {

			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			o.frequency.setValueAtTime( base * det * 0.5, t );
			o.frequency.exponentialRampToValueAtTime( base * det, t + spinUp );
			o.frequency.setValueAtTime( base * det, t + dur - spinUp );
			o.frequency.exponentialRampToValueAtTime( base * det * 0.6, t + dur + 0.08 );
			// load wobble
			const lfo = ctx.createOscillator();
			lfo.frequency.value = 5 + Math.random() * 3;
			const lg = ctx.createGain();
			lg.gain.value = base * 0.012;
			lfo.connect( lg ).connect( o.frequency );
			const og = ctx.createGain();
			og.gain.value = det > 2 ? 0.35 : 0.6;
			o.connect( og ).connect( bp );
			o.start( t ); lfo.start( t );
			o.stop( t + dur + 0.1 ); lfo.stop( t + dur + 0.1 );

		}

		bp.connect( lp ).connect( env ).connect( bus );

		// gear mesh chatter: noise gated at the tooth frequency
		const src = ctx.createBufferSource();
		src.buffer = this.white; src.loop = true;
		const nb = ctx.createBiquadFilter();
		nb.type = 'bandpass'; nb.frequency.value = small ? 5200 : 3400; nb.Q.value = 1.2;
		const gate = ctx.createGain();
		gate.gain.value = 0;
		const tooth = ctx.createOscillator();
		tooth.type = 'square';
		tooth.frequency.setValueAtTime( base * 0.3, t );
		tooth.frequency.exponentialRampToValueAtTime( base * 0.55, t + spinUp );
		const tg = ctx.createGain();
		tg.gain.value = gain * 0.35;
		tooth.connect( tg ).connect( gate.gain );
		src.connect( nb ).connect( gate ).connect( env );
		src.start( t, Math.random() ); tooth.start( t );
		src.stop( t + dur + 0.1 ); tooth.stop( t + dur + 0.1 );

	}

	hydraulic( t, dur, { gain = 0.1, pitch = 1 } = {} ) {

		// pump drone
		this.tone( t, dur + 0.1, { type: 'triangle', f: 48 * pitch, f2: 62 * pitch, gain: gain * 0.9, a: 0.08, curve: 'lin' } );
		this.tone( t, dur + 0.1, { type: 'sine', f: 96 * pitch, f2: 118 * pitch, gain: gain * 0.4, a: 0.08, curve: 'lin' } );
		// fluid hiss, rising pressure
		this.noise( t, dur, { f: 900, f2: 2600, Q: 0.8, gain: gain * 0.55, a: 0.06, r: 0.1, send: 0.2 } );
		this.noise( t, dur, { buf: this.brown, type: 'lowpass', f: 300, f2: 500, Q: 0.7, gain: gain * 0.8, a: 0.1, r: 0.15 } );
		// pressure release
		this.noise( t + dur, 0.35, { type: 'highpass', f: 3500, f2: 1800, Q: 0.6, gain: gain * 0.5, a: 0.004, send: 0.3 } );

	}

	lock( t, { size = 1, gain = 0.5 } = {} ) {

		// transient
		this.noise( t, 0.03, { type: 'highpass', f: 2500, Q: 0.7, gain: gain * 0.6, a: 0.0008, send: 0.3 } );
		// body thump
		this.tone( t, 0.22 * size, { f: 120 / size, f2: 48 / size, gain: gain * 0.9, a: 0.002 } );
		this.noise( t, 0.12 * size, { buf: this.brown, type: 'lowpass', f: 600, Q: 0.7, gain: gain * 0.7, a: 0.002 } );
		// ringing steel
		this.metal( t + 0.002, { f0: ( 260 + Math.random() * 180 ) / size, gain: gain * 0.16, decay: 0.7 * size, send: 0.7 } );

	}

	latch( t, gain = 0.35 ) {

		for ( const dt of [ 0, 0.045 + Math.random() * 0.02 ] ) {

			this.noise( t + dt, 0.025, { f: 4200, Q: 2.5, gain, a: 0.0005 } );
			this.tone( t + dt, 0.06, { f: 2200 + Math.random() * 600, gain: gain * 0.15, a: 0.0005, send: 0.3 } );

		}

	}

	impact( t, strength = 1 ) {

		const g = 0.55 * strength;
		this.tone( t, 0.6, { f: 72, f2: 30, gain: g, a: 0.004 } );
		this.tone( t, 0.3, { f: 150, f2: 60, gain: g * 0.5, a: 0.002 } );
		this.noise( t, 0.35, { buf: this.brown, type: 'lowpass', f: 420, f2: 160, Q: 0.8, gain: g * 0.9, a: 0.003 } );
		// gravel crunch: granular bursts
		const grains = Math.floor( 14 + 18 * strength );
		for ( let i = 0; i < grains; i ++ ) {

			const tt = t + Math.pow( Math.random(), 1.7 ) * 0.28;
			this.noise( tt, 0.012 + Math.random() * 0.02, { f: 1400 + Math.random() * 3200, Q: 3, gain: ( 0.05 + Math.random() * 0.09 ) * strength, a: 0.0005 } );

		}

		this.metal( t + 0.005, { f0: 120 + Math.random() * 40, gain: 0.05 * strength, decay: 0.9, send: 0.8, bright: 0.5 } );

	}

	/* ------------------------------ public -------------------------------- */

	/** called with the kind of timeline event and its duration (s) */
	actuator( kind, dur, reverse ) {

		if ( ! this.ctx || ! this.enabled ) return;
		const t = this.ctx.currentTime + 0.01;
		switch ( kind ) {

			case 'servo': this.servo( t, dur, { pitch: reverse ? 0.9 : 1 } ); break;
			case 'servo-s': this.servo( t, dur, { small: true, gain: 0.06, pitch: 0.9 + Math.random() * 0.25 } ); break;
			case 'hydraulic': this.hydraulic( t, dur, { gain: 0.09 } ); this.servo( t, dur, { pitch: 0.7, gain: 0.04 } ); break;
			case 'latch': this.latch( t ); break;
			case 'latches': {

				// panels unlatching one after another, spread across the body
				const n = 9;
				for ( let i = 0; i < n; i ++ ) this.latch( t + ( i / n ) * dur * 0.9 + Math.random() * 0.05, 0.16 + Math.random() * 0.14 );
				break;

			}

			case 'heavy-rise':
				this.hydraulic( t, dur, { gain: 0.12, pitch: 0.7 } );
				this.servo( t, dur, { pitch: 0.5, gain: 0.07 } );
				break;
			case 'heavy':
				this.hydraulic( t, dur, { gain: 0.14, pitch: 0.8 } );
				this.servo( t, dur, { pitch: 0.55, gain: 0.08 } );
				break;
			case 'settle': this.hydraulic( t, dur * 0.6, { gain: 0.05, pitch: 1.2 } ); break;
			default: break;

		}

	}

	locked( kind ) {

		if ( ! this.ctx || ! this.enabled ) return;
		const t = this.ctx.currentTime + 0.01;
		if ( kind === 'heavy' ) { this.impact( t, 1.4 ); this.lock( t + 0.03, { size: 1.6, gain: 0.6 } ); }
		else if ( kind === 'latch' || kind === 'latches' ) return;
		else if ( kind === 'heavy-rise' ) { this.lock( t, { size: 1.5, gain: 0.5 } ); this.impact( t, 0.6 ); }
		else if ( kind === 'servo-s' ) this.lock( t, { size: 0.6, gain: 0.22 } );
		else if ( kind === 'settle' ) this.lock( t, { size: 1.3, gain: 0.3 } );
		else this.lock( t, { size: 1, gain: 0.42 } );

	}

	wake( reverse ) {

		if ( ! this.ctx || ! this.enabled ) return;
		const t = this.ctx.currentTime + 0.01;
		// power-up: filtered sweep + two-tone chime, restrained
		this.noise( t, 0.9, { f: reverse ? 3000 : 400, f2: reverse ? 400 : 3000, Q: 4, gain: 0.05, a: 0.2, send: 0.6 } );
		this.tone( t, 1.2, { type: 'triangle', f: reverse ? 330 : 220, f2: reverse ? 220 : 330, gain: 0.05, a: 0.3, send: 0.8 } );
		this.latch( t + 0.25, 0.25 );

	}

	footstep( strength = 1 ) {

		if ( ! this.ctx || ! this.enabled ) return;
		const t = this.ctx.currentTime + 0.005;
		this.impact( t, strength );
		this.hydraulic( t - 0.02, 0.18, { gain: 0.035 * strength, pitch: 1.4 } );
		this.servo( t + 0.05, 0.28, { small: true, gain: 0.02, pitch: 0.8 + Math.random() * 0.2 } );

	}

	buildMotor() {

		const ctx = this.ctx;
		this.motor = {} as MotorVoices;
		const m = this.motor;
		m.gain = ctx.createGain(); m.gain.gain.value = 0;
		m.gain.connect( this.bus );
		m.o1 = ctx.createOscillator(); m.o1.type = 'sine';
		m.o2 = ctx.createOscillator(); m.o2.type = 'triangle';
		const g1 = ctx.createGain(); g1.gain.value = 0.6;
		const g2 = ctx.createGain(); g2.gain.value = 0.18;
		const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.value = 900;
		m.bp = bp;
		m.o1.connect( g1 ).connect( m.gain );
		m.o2.connect( g2 ).connect( bp ).connect( m.gain );
		m.o1.start(); m.o2.start();

		// tyre roar + gravel
		m.road = ctx.createGain(); m.road.gain.value = 0;
		const rs = ctx.createBufferSource(); rs.buffer = this.brown; rs.loop = true;
		m.roadLp = ctx.createBiquadFilter(); m.roadLp.type = 'lowpass'; m.roadLp.frequency.value = 300;
		rs.connect( m.roadLp ).connect( m.road ).connect( this.bus );
		rs.start();
		m.gravel = ctx.createGain(); m.gravel.gain.value = 0;
		const gs = ctx.createBufferSource(); gs.buffer = this.white; gs.loop = true;
		const gbp = ctx.createBiquadFilter(); gbp.type = 'bandpass'; gbp.frequency.value = 2400; gbp.Q.value = 0.9;
		const crackle = ctx.createGain(); crackle.gain.value = 0.5;
		const lfo = ctx.createBufferSource(); lfo.buffer = this.white; lfo.loop = true; lfo.playbackRate.value = 0.004;
		lfo.connect( crackle.gain );
		gs.connect( gbp ).connect( crackle ).connect( m.gravel ).connect( this.bus );
		gs.start(); lfo.start();

	}

	drive( speed, throttle, isCar ) {

		if ( ! this.ctx ) return;
		const m = this.motor, t = this.ctx.currentTime;
		const v = Math.abs( speed );
		const on = isCar && this.enabled ? 1 : 0;
		m.o1.frequency.setTargetAtTime( 70 + v * 22, t, 0.08 );
		m.o2.frequency.setTargetAtTime( 140 + v * 51, t, 0.08 );
		m.bp.frequency.setTargetAtTime( 600 + v * 60, t, 0.1 );
		m.gain.gain.setTargetAtTime( on * ( Math.min( v / 25, 1 ) * 0.03 + Math.abs( throttle ) * 0.025 * Math.min( 1, v / 3 + 0.2 ) ), t, 0.12 );
		m.road.gain.setTargetAtTime( on * Math.min( v / 30, 1 ) * 0.22, t, 0.15 );
		m.roadLp.frequency.setTargetAtTime( 180 + v * 18, t, 0.15 );
		m.gravel.gain.setTargetAtTime( on * Math.min( v / 25, 1 ) * 0.05, t, 0.15 );

	}

}
