// Unit tests for the parts of Emet that decide what the golem does.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Signals, edaSlope, SHAPING_SECONDS } from '../src/signals.js';
import { faceFeatures, golemFace } from '../src/face.js';

const US = 1e6;
const payload = (t, { pulse = 65, breath = 11, rmssd = 45, eda = 1, talking = false } = {}) => ({
  breathing: { rate: [{ value: breath, confidence: 80, stable: true, timestamp: t * US }], upperTrace: [{ value: Math.sin(t), stable: true, timestamp: t * US }] },
  cardio: { pulseRate: [{ value: pulse, confidence: 80, stable: true, timestamp: t * US }], hrv: [{ rmssd, sdnn: rmssd, baevsky: 100, confidence: 70, stable: true, timestamp: t * US }], arterialPressureTrace: [{ value: Math.sin(t * 7), confidence: 60, stable: true, timestamp: t * US }] },
  eda: { trace: [{ value: eda, stable: true, timestamp: t * US }] },
  face: { talking: [{ detected: talking, stable: true, timestamp: t * US }] },
});

function run(signals, from, to, f) { for (let t = from; t <= to; t += 0.5) signals.ingest(payload(t, f(t))); }

test('the first minute only learns; calm stays neutral', () => {
  const s = new Signals();
  run(s, 0, SHAPING_SECONDS - 1, () => ({}));
  assert.equal(s.shaping, true);
  assert.equal(s.calm, 0.5);
});

test('a racing pulse, fast breathing, low HRV and rising EDA read as tense', () => {
  const s = new Signals();
  run(s, 0, SHAPING_SECONDS, () => ({}));
  run(s, SHAPING_SECONDS + 0.5, SHAPING_SECONDS + 30, (t) => ({ pulse: 82, breath: 19, rmssd: 20, eda: 1 + (t - SHAPING_SECONDS) * 0.02 }));
  assert.ok(s.calm < 0.25, `calm was ${s.calm}`);
  for (const k of ['pulse', 'breath', 'hrv', 'eda']) assert.ok(s.parts[k] < 0, `${k} should pull toward tense`);
});

test('slower breathing and more HRV than your own baseline read as calm', () => {
  const s = new Signals();
  run(s, 0, SHAPING_SECONDS, () => ({}));
  run(s, SHAPING_SECONDS + 0.5, SHAPING_SECONDS + 30, () => ({ pulse: 60, breath: 7, rmssd: 70 }));
  assert.ok(s.calm > 0.75, `calm was ${s.calm}`);
});

test('breathing rate is ignored while you talk', () => {
  const s = new Signals();
  run(s, 0, SHAPING_SECONDS, () => ({}));
  run(s, SHAPING_SECONDS + 0.5, SHAPING_SECONDS + 10, () => ({ breath: 25, talking: true }));
  assert.equal(s.parts.breath, undefined);
});

test('reset forgets everything', () => {
  const s = new Signals();
  run(s, 0, 70, () => ({}));
  s.reset();
  assert.equal(s.t0, null); assert.equal(s.pulse, null); assert.equal(s.base.pulse.n, 0); assert.equal(s.eda.length, 0);
});

test('EDA slope is positive when the trace rises and needs enough points', () => {
  assert.equal(edaSlope([{ t: 0, v: 1 }]), null);
  const rising = Array.from({ length: 30 }, (_, i) => ({ t: i, v: 1 + i * 0.1 }));
  assert.ok(Math.abs(edaSlope(rising) - 0.1) < 1e-9);
});

test('face features: open vs closed eyes, open mouth', () => {
  const lm = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const put = (i, x, y) => { lm[i] = { x, y }; };
  put(234, -100, 0); put(454, 100, 0); put(10, 0, -130); put(152, 0, 130); put(1, 0, 10);
  for (const [o, i, t, b, sx] of [[33, 133, 159, 145, -1], [263, 362, 386, 374, 1]]) { put(o, sx * 70, -30); put(i, sx * 26, -30); put(t, sx * 48, -37); put(b, sx * 48, -23); }
  put(105, -48, -60); put(334, 48, -60); put(13, 0, 55); put(14, 0, 75); put(61, -45, 65); put(291, 45, 65);
  const f = faceFeatures(lm);
  assert.ok(f.eyeA > 0.25 && f.eyeB > 0.25);
  const g = golemFace(f);
  assert.ok(g.eye > 0.6 && g.mouthOpen > 0.3);
  assert.equal(faceFeatures(lm.slice(0, 100)), null);
});
