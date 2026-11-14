// Turns the SmartSpectra metrics stream into the few numbers the golem lives by.
//
// Nothing here is medical. "Calm" is a playful, relative reading: how your
// breathing, pulse, HRV and EDA Proxy compare with *your own* first minute in
// front of the golem, not with any norm. Everything stays in memory and is
// dropped when the window closes.

export const SHAPING_SECONDS = 60; // HRV needs a full 60 s window; EDA Proxy its first ~35 s

const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);
const num = (ts) => (ts == null ? 0 : typeof ts === 'number' ? ts : typeof ts === 'bigint' ? Number(ts) : typeof ts.toNumber === 'function' ? ts.toNumber() : Number(ts));
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// Running mean / spread of a signal during the shaping minute.
class Baseline {
  constructor() { this.n = 0; this.mean = 0; this.m2 = 0; }
  add(x) { this.n++; const d = x - this.mean; this.mean += d / this.n; this.m2 += d * (x - this.mean); }
  get sd() { return this.n > 1 ? Math.sqrt(this.m2 / (this.n - 1)) : 0; }
  ready(min = 3) { return this.n >= min; }
}

// Exponential moving average with a time constant in seconds.
class Smooth {
  constructor(tau) { this.tau = tau; this.v = null; this.t = null; }
  push(x, t) {
    if (this.v == null) { this.v = x; this.t = t; return x; }
    const dt = Math.max(0, t - this.t); this.t = t;
    const a = 1 - Math.exp(-dt / this.tau);
    this.v += a * (x - this.v);
    return this.v;
  }
}

export class Signals {
  constructor() { this.reset(); }

  reset() {
    this.t0 = null;              // seconds, first sample
    this.now = 0;                // seconds since t0
    this.pulse = null;           // { value, confidence, stable }
    this.breathRate = null;
    this.hrv = null;             // { rmssd, sdnn, baevsky, confidence, stable }
    this.eda = [];               // [{ t, v }] recent EDA Proxy trace
    this.breath = [];            // [{ t, v }] chest trace, recent
    this.beats = [];             // [{ t, v }] arterial pressure trace, recent
    this.blink = false; this.talking = false;
    this.expression = null;      // { type, confidence } dominant
    this.landmarks = null;       // [{x,y}...]
    this.base = { pulse: new Baseline(), breath: new Baseline(), rmssd: new Baseline(), eda: new Baseline() };
    this.calmSmooth = new Smooth(4);
    this.calm = 0.5;             // 0 = tense, 1 = calm
    this.parts = {};             // per-signal contribution, for the "how it reads you" panel
    this.validation = null;      // last validation hint from the SDK
  }

  get shaping() { return this.now < SHAPING_SECONDS; }
  get shapingProgress() { return clamp(this.now / SHAPING_SECONDS); }

  // Feed one decoded `metrics` payload (the windowed slice since the last event).
  ingest(m) {
    const firstTs = m.breathing?.upperTrace?.[0]?.timestamp ?? m.cardio?.pulseRate?.[0]?.timestamp
      ?? m.face?.landmarks?.[0]?.timestamp ?? m.cardio?.arterialPressureTrace?.[0]?.timestamp ?? m.eda?.trace?.[0]?.timestamp;
    if (firstTs != null && this.t0 == null) this.t0 = num(firstTs) / 1e6;
    if (this.t0 == null) return;
    const sec = (ts) => num(ts) / 1e6 - this.t0;
    const keep = (arr, horizon) => { while (arr.length && arr[0].t < this.now - horizon) arr.shift(); };

    for (const s of m.breathing?.upperTrace || []) { const t = sec(s.timestamp); this.breath.push({ t, v: s.value }); this.now = Math.max(this.now, t); }
    for (const s of m.cardio?.arterialPressureTrace || []) { const t = sec(s.timestamp); this.beats.push({ t, v: s.value, c: s.confidence }); this.now = Math.max(this.now, t); }
    for (const s of m.eda?.trace || []) { const t = sec(s.timestamp); this.eda.push({ t, v: s.value }); this.now = Math.max(this.now, t); }
    keep(this.breath, 20); keep(this.beats, 8); keep(this.eda, 40);

    const p = last(m.cardio?.pulseRate); if (p) this.pulse = { value: p.value, confidence: p.confidence, stable: p.stable };
    const b = last(m.breathing?.rate); if (b) this.breathRate = { value: b.value, confidence: b.confidence, stable: b.stable };
    const h = last(m.cardio?.hrv); if (h) this.hrv = { rmssd: h.rmssd, sdnn: h.sdnn, baevsky: h.baevsky, confidence: h.confidence, stable: h.stable };
    const bl = last(m.face?.blinking); if (bl) this.blink = !!bl.detected;
    const tk = last(m.face?.talking); if (tk) this.talking = !!tk.detected;
    const lm = last(m.face?.landmarks); if (lm && lm.value?.length) this.landmarks = lm.value;
    const ex = last(m.face?.expression);
    if (ex?.scores?.length) {
      const top = [...ex.scores].sort((a, z) => z.confidence - a.confidence)[0];
      this.expression = { type: top.type, confidence: top.confidence };
    }

    if (this.shaping) this.learn(); else this.read();
  }

  // During the shaping minute: learn this person's own baseline.
  learn() {
    if (this.pulse?.stable) this.base.pulse.add(this.pulse.value);
    if (this.breathRate?.stable && !this.talking) this.base.breath.add(this.breathRate.value);
    if (this.hrv?.stable) this.base.rmssd.add(this.hrv.rmssd);
    const e = last(this.eda); if (e) this.base.eda.add(e.v);
  }

  // After shaping: how far each signal has moved from the baseline, toward tense or calm.
  // Each part is in [-1, 1]: positive = calmer than your baseline, negative = more tense.
  read() {
    const parts = {};
    const rel = (x, b, scale) => clamp((b.mean - x) / Math.max(scale, b.sd * 2), -1, 1);
    if (this.pulse?.stable && this.base.pulse.ready()) parts.pulse = rel(this.pulse.value, this.base.pulse, 6);       // +6 bpm ≈ fully "tense"
    if (this.breathRate?.stable && !this.talking && this.base.breath.ready()) parts.breath = rel(this.breathRate.value, this.base.breath, 3);
    if (this.hrv?.stable && this.base.rmssd.ready()) parts.hrv = -rel(this.hrv.rmssd, this.base.rmssd, 10);            // more variability = calmer
    const slope = edaSlope(this.eda);
    if (slope != null && this.base.eda.ready()) parts.eda = clamp(-slope / Math.max(1e-6, (this.base.eda.sd || 0.05) / 10), -1, 1); // rising EDA Proxy = arousal
    const weights = { pulse: 1, breath: 1, hrv: 1.2, eda: 1.2 };
    let sum = 0, w = 0;
    for (const [k, v] of Object.entries(parts)) { sum += weights[k] * v; w += weights[k]; }
    const raw = w ? 0.5 + 0.5 * (sum / w) : 0.5;
    this.calm = clamp(this.calmSmooth.push(raw, this.now));
    this.parts = parts;
  }

  // The golem's chest: latest chest-breathing sample, normalised over the last 20 s.
  breathPhase() { return normalisedLast(this.breath); }
  // The golem's heart: latest arterial-pressure-trace sample, normalised over the last 8 s.
  heartPhase() { return normalisedLast(this.beats); }
}

function normalisedLast(arr) {
  if (arr.length < 5) return 0.5;
  let lo = Infinity, hi = -Infinity;
  for (const s of arr) { if (s.v < lo) lo = s.v; if (s.v > hi) hi = s.v; }
  return hi - lo < 1e-9 ? 0.5 : (arr[arr.length - 1].v - lo) / (hi - lo);
}

// Least-squares slope of the EDA Proxy trace over its last ~20 s, per second.
export function edaSlope(arr, window = 20) {
  if (arr.length < 6) return null;
  const tEnd = arr[arr.length - 1].t;
  const pts = arr.filter((s) => s.t >= tEnd - window);
  if (pts.length < 6) return null;
  const n = pts.length, mt = pts.reduce((a, s) => a + s.t, 0) / n, mv = pts.reduce((a, s) => a + s.v, 0) / n;
  let num_ = 0, den = 0;
  for (const s of pts) { num_ += (s.t - mt) * (s.v - mv); den += (s.t - mt) ** 2; }
  return den ? num_ / den : null;
}
