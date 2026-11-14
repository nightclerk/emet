// Emet: the golem that lives only while you are calm.
// Renderer: consent, input choice, the SmartSpectra session, and the draw loop.

import { Signals, SHAPING_SECONDS } from './signals.js';
import { faceFeatures, golemFace, neutral } from './face.js';
import { Golem } from './golem.js';
import { MockSDK } from './mock.js';

const MOCK = new URLSearchParams(location.search).has('mock');
const $ = (id) => document.getElementById(id);
const show = (name) => { for (const s of document.querySelectorAll('[data-screen]')) s.hidden = s.dataset.screen !== name; };

if (MOCK) $('mock-banner').hidden = false;

// ---------------------------------------------------------------- the key
// Kept in this computer's local storage only; never written to the repo or sent anywhere but Presage.
const KEY_STORE = 'emet.presageKey';
const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
$('key-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('key-input').value.trim();
  if (!k) return;
  try { localStorage.setItem(KEY_STORE, k); } catch {}
  $('key-input').value = '';
  show('intro');
});
$('forget-key').addEventListener('click', () => { try { localStorage.removeItem(KEY_STORE); } catch {} show('key'); });

// ---------------------------------------------------------------- session
let sdk = null, video = null, golem = null, signals = new Signals(), face = neutral(), raf = 0, lastFrame = 0;
let sdkLib = null, awakeSaid = false;

async function loadSdk() {
  if (MOCK) return null;
  if (!sdkLib) {
    const r = await import('@smartspectra/node-sdk/renderer');
    const m = await import('@smartspectra/node-sdk/messages');
    sdkLib = { ...r, decodeMetrics: m.decodeMetrics };
  }
  return sdkLib;
}

// Ask for everything the golem uses. If this key isn't allowed some of it,
// try again without that group rather than failing: EDA first, then face.
function metricPlans(L) {
  return [
    [...L.breathingMetrics, ...L.cardioMetrics, ...L.faceMetrics, ...L.edaMetrics],
    [...L.breathingMetrics, ...L.cardioMetrics, ...L.faceMetrics],
    [...L.breathingMetrics, ...L.cardioMetrics],
  ];
}

async function begin(source) {
  show('live');
  $('stage').innerHTML = '';
  golem = new Golem($('stage'));
  golem.onChange = (dead) => say(dead ? '\u2068מת\u2069. Breathe slowly, and I will rise again.' : '\u2068אמת\u2069. I am awake.', dead ? 'dead' : 'alive');
  signals.reset(); face = neutral(); awakeSaid = false;
  say('Hold still. I am being shaped from your breath.', 'shaping');
  const telemetry = $('telemetry').checked;

  if (MOCK) {
    sdk = new MockSDK({ speed: Number(new URLSearchParams(location.search).get('speed') || 1) });
    wire(sdk, (m) => m);
    await sdk.start();
  } else {
    const L = await loadSdk();
    let stream = null;
    if (source.file) {
      video = $('file-video');
      video.src = URL.createObjectURL(source.file);
      video.loop = true; video.muted = true;
      await video.play();
      stream = video.captureStream(30);
    }
    let started = false, lastErr = null;
    for (const metrics of metricPlans(L)) {
      sdk = new L.SmartSpectraSDK({ apiKey: getKey(), requestedMetrics: metrics, enableTelemetry: telemetry });
      wire(sdk, (buf) => L.decodeMetrics(buf), L);
      if (stream) sdk.useMediaStream(stream);
      try { await sdk.start(); started = true; break; } catch (err) {
        lastErr = err;
        try { sdk.destroy(); } catch {}
        sdk = null;
        if (err.code !== L.SmartSpectraErrorCode?.kMetricNotAuthorized && err.code !== 13) break;
      }
    }
    if (!started) { stop(); return fail(lastErr); }
  }
  lastFrame = performance.now();
  raf = requestAnimationFrame(tick);
  if (DIAG) startDiag();
}

// --diag: is each signal arriving, and how confident is the SDK? Never the values themselves.
const DIAG = new URLSearchParams(location.search).has('diag');
let diagTimer = 0;
function startDiag() {
  clearInterval(diagTimer);
  diagTimer = setInterval(() => {
    const c = (x) => (x == null ? null : Math.round(x));
    console.log('[diag] ' + JSON.stringify({
      t: Math.round(signals.now), shaping: signals.shaping, validation: signals.validation,
      pulse: signals.pulse ? c(signals.pulse.confidence) : 'none', breath: signals.breathRate ? c(signals.breathRate.confidence) : 'none',
      hrv: signals.hrv ? c(signals.hrv.confidence) : 'none', eda: signals.eda.length ? 'yes' : 'none',
      landmarks: signals.landmarks ? signals.landmarks.length : 0, talking: signals.talking,
      expression: signals.expression ? 'yes' : 'none', dead: !!golem?.dead,
    }));
  }, 5000);
}

function wire(s, decode, L) {
  s.on('metrics', (buf) => {
    let m; try { m = decode(buf); } catch { return; }
    if (!m || (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(m))) return;
    signals.ingest(m);
  });
  s.on('validationStatus', (code, _ts, hint) => {
    signals.validation = code;
    if (code === 0) return;
    say(VALIDATION[code] || hint || 'I cannot see you clearly.', 'hint');
  });
  s.on('error', (code, message) => fail({ code, message }));
  s.on('streamAvailable', (stream) => { const v = $('cam-video'); v.srcObject = stream; v.play().catch(() => {}); });
}

// The SDK's camera guidance, in the golem's voice.
const VALIDATION = {
  1: 'I cannot find your face. Come where I can see you.',
  2: 'I see more than one face. I can be shaped by only one.',
  3: 'Come to the middle, where I can see you.',
  4: 'Not so near, not so far.',
  5: 'It is too dark. Bring a light closer.',
  6: 'The light is too bright.',
  7: 'Let me see your chest rise. Move back a little.',
  10: 'My eyes are adjusting to your light.',
  11: 'Your camera is too slow for me.',
  12: 'Be still. I cannot follow so much movement.',
  13: 'You are too close.', 14: 'You are too far away.',
  15: 'You are too high in the frame.', 16: 'You are too low in the frame.',
  17: 'Look at me.',
};

function say(text, mood) {
  const w = $('words');
  if (w.dataset.text === text) return;
  w.dataset.text = text; w.textContent = text; w.dataset.mood = mood || '';
}

function fail(err) {
  const auth = err && (err.code === 2 || /auth/i.test(err.message || ''));
  $('error').hidden = false;
  if (DIAG) console.log('[diag] error ' + JSON.stringify({ code: err?.code, message: err?.message }));
  $('error-text').textContent = auth
    ? 'Presage did not accept the key. Check it, or enter it again.'
    : `The golem could not wake: ${err?.message || err}`;
}

function stop() {
  cancelAnimationFrame(raf); clearInterval(diagTimer);
  try { sdk?.stop?.(); } catch {}
  try { sdk?.destroy?.(); } catch {}
  sdk = null;
  if (video) { video.pause(); URL.revokeObjectURL(video.src); video.removeAttribute('src'); video.load(); video = null; }
  const cam = $('cam-video'); cam.srcObject = null;
  signals.reset(); // nothing about you outlives the session
}

$('stop').addEventListener('click', () => { stop(); show('intro'); });
$('error-back').addEventListener('click', () => { $('error').hidden = true; stop(); show(getKey() || MOCK ? 'intro' : 'key'); });

// ---------------------------------------------------------------- draw loop
function tick(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  face = golemFace(faceFeatures(signals.landmarks), face);
  golem.draw({
    shaping: signals.shaping, shapingProgress: signals.shapingProgress, calm: signals.calm,
    breath: signals.breathPhase(), heart: signals.heartPhase(), face, blink: signals.blink, talking: signals.talking,
  }, dt);
  panel();
  if (!signals.shaping && !awakeSaid) { awakeSaid = true; if (!golem.dead) say('\u2068אמת\u2069. I am awake.', 'alive'); }
  if (signals.shaping) {
    const left = Math.max(0, Math.ceil(SHAPING_SECONDS - signals.now));
    $('shaping').hidden = false;
    $('shaping-bar').style.width = (signals.shapingProgress * 100).toFixed(1) + '%';
    $('shaping-left').textContent = signals.t0 == null ? 'waiting for you…' : `${left} s`;
  } else {
    $('shaping').hidden = true;
    if (signals.talking && !golem.dead) say('I am listening. (While you talk, I cannot count your breaths.)', 'listen');
    else if (!golem.dead && $('words').dataset.mood === 'listen') say('\u2068אמת\u2069. I am awake.', 'alive');
  }
  raf = requestAnimationFrame(tick);
}

// "How the golem reads you": every signal, its confidence, and which way it pulls.
function panel() {
  const fmt = (x, d = 0) => (x == null || Number.isNaN(x) ? '–' : x.toFixed(d));
  const rows = [
    ['pulse', 'Pulse', signals.pulse ? `${fmt(signals.pulse.value)} bpm` : '–', signals.pulse?.confidence],
    ['breath', 'Breathing', signals.breathRate ? `${fmt(signals.breathRate.value)} /min` : '–', signals.breathRate?.confidence],
    ['hrv', 'HRV (RMSSD)', signals.hrv ? `${fmt(signals.hrv.rmssd)} ms` : '–', signals.hrv?.confidence],
    ['eda', 'EDA Proxy', signals.eda.length ? 'trend' : '–', null],
  ];
  for (const [k, label, value, conf] of rows) {
    const row = $('r-' + k);
    row.querySelector('.label').textContent = label;
    row.querySelector('.value').textContent = value;
    row.querySelector('.conf').textContent = conf == null ? '' : `${fmt(conf)}%`;
    const p = signals.parts[k];
    const bar = row.querySelector('.pull i');
    bar.style.width = p == null ? '0%' : `${Math.abs(p) * 50}%`;
    bar.style.left = p == null || p >= 0 ? '50%' : `${50 - Math.abs(p) * 50}%`;
    bar.className = p == null ? '' : p >= 0 ? 'calm' : 'tense';
  }
  drawMesh();
  $('calm-value').textContent = signals.shaping ? 'learning you' : `${Math.round(signals.calm * 100)}`;
  $('aleph-meter').style.height = `${(golem?.alephHeld ?? 1) * 100}%`;
}

// The face as the SDK hands it over: points only. Scaled to fit, mirrored like a mirror.
function drawMesh() {
  const c = $('mesh'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const lm = signals.landmarks;
  if (!lm || lm.length < 10) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of lm) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const s = Math.min((c.width - 20) / Math.max(1, x1 - x0), (c.height - 20) / Math.max(1, y1 - y0));
  const ox = (c.width - (x1 - x0) * s) / 2, oy = (c.height - (y1 - y0) * s) / 2;
  g.fillStyle = golem?.dead ? '#6b5a4b' : '#e2a46a';
  for (const p of lm) g.fillRect(c.width - (ox + (p.x - x0) * s) - 1, oy + (p.y - y0) * s - 1, 1.6, 1.6);
}

// ---------------------------------------------------------------- start
$('use-camera').addEventListener('click', () => begin({ camera: true }));
$('use-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) begin({ file: f }); });

show(getKey() || MOCK ? 'intro' : 'key');
