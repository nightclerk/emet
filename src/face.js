// A few expressive numbers from SmartSpectra's 478 face landmarks, so the
// golem's clay face can follow yours. Indices follow the MediaPipe Face Mesh
// layout (468 points + 10 iris points). Everything is relative to the size of
// your face, so distance from the camera doesn't matter.

const I = {
  eyeA: { top: 159, bottom: 145, outer: 33, inner: 133 },
  eyeB: { top: 386, bottom: 374, outer: 263, inner: 362 },
  mouth: { top: 13, bottom: 14, left: 61, right: 291 },
  browA: 105, browB: 334,
  cheekA: 234, cheekB: 454, forehead: 10, chin: 152, nose: 1,
};

const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

export function faceFeatures(lm) {
  if (!lm || lm.length < 468) return null;
  const P = (i) => lm[i];
  const faceW = d(P(I.cheekA), P(I.cheekB));
  const faceH = d(P(I.forehead), P(I.chin));
  if (faceW < 1e-3 || faceH < 1e-3) return null;
  const eye = (e) => d(P(e.top), P(e.bottom)) / Math.max(1e-3, d(P(e.outer), P(e.inner)));
  const mid = { x: (P(I.cheekA).x + P(I.cheekB).x) / 2, y: (P(I.cheekA).y + P(I.cheekB).y) / 2 };
  return {
    eyeA: eye(I.eyeA),                                   // ~0.25-0.35 open, <0.12 closed
    eyeB: eye(I.eyeB),
    mouthOpen: d(P(I.mouth.top), P(I.mouth.bottom)) / faceH,
    mouthWide: d(P(I.mouth.left), P(I.mouth.right)) / faceW,
    brow: (d(P(I.browA), P(I.eyeA.top)) + d(P(I.browB), P(I.eyeB.top))) / 2 / faceH,
    roll: Math.atan2(P(I.eyeB.outer).y - P(I.eyeA.outer).y, P(I.eyeB.outer).x - P(I.eyeA.outer).x),
    yaw: (P(I.nose).x - mid.x) / faceW,
  };
}

// Map raw features onto the golem's face controls, each in [0, 1] (roll/yaw in [-1, 1]).
export function golemFace(f, prev) {
  if (!f) return prev || neutral();
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const target = {
    eye: clamp(((f.eyeA + f.eyeB) / 2 - 0.1) / 0.22),
    mouthOpen: clamp((f.mouthOpen - 0.01) / 0.12),
    smile: clamp((f.mouthWide - 0.36) / 0.12),
    brow: clamp((f.brow - 0.07) / 0.06),
    roll: clamp(f.roll / 0.5, -1, 1),
    yaw: clamp(f.yaw / 0.25, -1, 1),
  };
  if (!prev) return target;
  const out = {};
  for (const k of Object.keys(target)) out[k] = prev[k] + 0.35 * (target[k] - prev[k]); // soften jitter
  return out;
}

export const neutral = () => ({ eye: 0.8, mouthOpen: 0.05, smile: 0.3, brow: 0.4, roll: 0, yaw: 0 });
