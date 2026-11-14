// Test mode (?mock): a scripted stand-in for the SDK, so the golem can be
// built, tested and screenshotted without a camera, a face or an API key.
// It emits payloads in the same shape as SmartSpectra's decoded metrics.
// A red banner says so whenever it is on.

const US = 1e6;

// A crude 478-point face: only the points face.js reads are placed with care.
function fakeLandmarks({ eye = 0.3, mouth = 0.02, wide = 0.42, brow = 0.1, roll = 0, yaw = 0 }) {
  const pts = Array.from({ length: 478 }, () => ({ x: 320, y: 240 }));
  const cx = 320 + yaw * 120, cy = 240, W = 200, H = 260;
  const r = (x, y) => { const c = Math.cos(roll), s = Math.sin(roll); return { x: cx + x * c - y * s, y: cy + x * s + y * c }; };
  const set = (i, x, y) => { pts[i] = r(x, y); };
  set(234, -W / 2, 0); set(454, W / 2, 0); set(10, 0, -H / 2); set(152, 0, H / 2); set(1, yaw * 30, 10);
  const eyeW = 44;
  for (const [o, i, t, b, sx] of [[33, 133, 159, 145, -1], [263, 362, 386, 374, 1]]) {
    set(o, sx * 70, -30); set(i, sx * (70 - eyeW), -30);
    set(t, sx * 48, -30 - eye * eyeW / 2); set(b, sx * 48, -30 + eye * eyeW / 2);
  }
  set(105, -48, -30 - eye * eyeW / 2 - brow * H); set(334, 48, -30 - eye * eyeW / 2 - brow * H);
  set(13, 0, 60 - mouth * H / 2); set(14, 0, 60 + mouth * H / 2); set(61, -wide * W / 2, 60); set(291, wide * W / 2, 60);
  return pts;
}

// The script: a calm minute, a tense stretch, then the breath comes back.
function scene(t) {
  const tense = t < 70 ? 0 : t < 95 ? Math.min(1, (t - 70) / 8) : Math.max(0, 1 - (t - 95) / 15);
  return {
    pulse: 66 + 16 * tense,
    breathRate: 11 + 8 * tense,
    rmssd: 48 - 26 * tense,
    edaLevel: 0.2 * tense,
    talking: t > 100 && t < 108,
    face: { eye: 0.3 - 0.05 * tense, mouth: 0.02 + (t > 100 && t < 108 ? 0.05 * Math.abs(Math.sin(t * 9)) : 0), wide: 0.42 + 0.04 * Math.max(0, Math.sin(t / 6)), brow: 0.1 + 0.03 * tense, roll: 0.08 * Math.sin(t / 5), yaw: 0.15 * Math.sin(t / 7) },
  };
}

export class MockSDK {
  constructor({ speed = 1 } = {}) { this.speed = speed; this.handlers = {}; this.timer = null; this.t = 0; this.eda = 0; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this.handlers[ev] || []) fn(...a); }
  async start() {
    const t0 = Date.now() * 1000;
    const step = 0.2; // seconds of simulated time per tick
    this.emit('validationStatus', 0, t0, '');
    this.timer = setInterval(() => {
      const from = this.t; this.t += step;
      const s = scene(this.t), ts = (x) => t0 + Math.round(x * US);
      const trace = (f) => { const out = []; for (let x = from; x < this.t; x += 1 / 30) out.push({ value: f(x), stable: true, timestamp: ts(x) }); return out; };
      this.eda += (s.edaLevel - this.eda) * 0.05;
      const m = {
        breathing: {
          upperTrace: trace((x) => Math.sin(2 * Math.PI * x * scene(x).breathRate / 60)),
          rate: this.t > 30 ? [{ value: s.breathRate, confidence: 80, stable: true, timestamp: ts(this.t) }] : [],
        },
        cardio: {
          arterialPressureTrace: trace((x) => { const ph = (x * scene(x).pulse / 60) % 1; return Math.exp(-((ph - 0.15) ** 2) / 0.006) + 0.35 * Math.exp(-((ph - 0.45) ** 2) / 0.01); }),
          pulseRate: this.t > 12 ? [{ value: s.pulse + Math.sin(this.t) * 0.6, confidence: 75, stable: true, timestamp: ts(this.t) }] : [],
          hrv: this.t > 60 ? [{ rmssd: s.rmssd, sdnn: s.rmssd * 1.2, baevsky: 120 + 200 * (1 - s.rmssd / 48), meanNn: 60000 / s.pulse, confidence: 70, stable: true, timestamp: ts(this.t) }] : [],
        },
        eda: { trace: this.t > 35 ? trace((x) => 1 + this.eda + 0.002 * Math.sin(x)) : [] },
        face: {
          landmarks: [{ value: fakeLandmarks(s.face), stable: true, timestamp: ts(this.t) }],
          blinking: [{ detected: (this.t % 4.1) < 0.2, stable: true, timestamp: ts(this.t) }],
          talking: [{ detected: s.talking, stable: true, timestamp: ts(this.t) }],
          expression: [{ stable: true, timestamp: ts(this.t), scores: [{ type: 6, confidence: 70 }, { type: 5, confidence: 20 }] }],
        },
      };
      this.emit('metrics', m, ts(this.t));
    }, (step * 1000) / this.speed);
    this.emit('processingStatus', 2);
  }
  async stop() { clearInterval(this.timer); this.timer = null; this.emit('processingStatus', 0); }
  destroy() { this.stop(); }
}
