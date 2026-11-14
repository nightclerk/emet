// The golem: a clay bust drawn in SVG. It breathes with your chest, its heart
// glows with your arterial pulse wave, its face follows yours, and the aleph
// on its forehead holds only while you stay calm. Lose the aleph and אמת
// (emet, truth) becomes מת (met, dead): the clay cracks and the golem sinks.

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

export class Golem {
  constructor(host) {
    this.svg = el('svg', { viewBox: '0 0 600 640', class: 'golem', role: 'img', 'aria-label': 'A clay golem' }, host);
    const defs = el('defs', {}, this.svg);

    // Clay: a little noise lit from the upper left, so it reads as worked earth.
    const clay = el('filter', { id: 'clay', x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.9', numOctaves: '3', seed: '7', result: 'grain' }, clay);
    const light = el('feDiffuseLighting', { in: 'grain', surfaceScale: '1.6', lightingColor: '#f3d9b4', result: 'lit' }, clay);
    el('feDistantLight', { azimuth: '225', elevation: '58' }, light);
    el('feComposite', { in: 'lit', in2: 'SourceGraphic', operator: 'in', result: 'litclay' }, clay);
    el('feBlend', { in: 'SourceGraphic', in2: 'litclay', mode: 'multiply' }, clay);

    // Carved letters: a dark recess with a lit lower lip.
    const carve = el('filter', { id: 'carve' }, defs);
    el('feOffset', { in: 'SourceAlpha', dx: '0', dy: '2', result: 'off' }, carve);
    el('feGaussianBlur', { in: 'off', stdDeviation: '1.2', result: 'blur' }, carve);
    el('feFlood', { 'flood-color': '#e8c39a', 'flood-opacity': '0.55', result: 'lipc' }, carve);
    el('feComposite', { in: 'lipc', in2: 'blur', operator: 'in', result: 'lip' }, carve);
    const merge = el('feMerge', {}, carve);
    el('feMergeNode', { in: 'lip' }, merge); el('feMergeNode', { in: 'SourceGraphic' }, merge);

    // Hand-pressed edges: nothing about a golem is a clean curve.
    const rough = el('filter', { id: 'rough', x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.018', numOctaves: '2', seed: '3', result: 'warp' }, rough);
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'warp', scale: '14', xChannelSelector: 'R', yChannelSelector: 'G' }, rough);

    // Candle light from the lower left; shadow pooling on the right.
    const shade = el('radialGradient', { id: 'shade', cx: '30%', cy: '35%', r: '80%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#ffe2bd', 'stop-opacity': '0.35' }, shade);
    el('stop', { offset: '55%', 'stop-color': '#000', 'stop-opacity': '0' }, shade);
    el('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': '0.55' }, shade);
    const socket = el('radialGradient', { id: 'socket' }, defs);
    el('stop', { offset: '55%', 'stop-color': '#1a0d06' }, socket);
    el('stop', { offset: '100%', 'stop-color': '#1a0d06', 'stop-opacity': '0' }, socket);
    const thumb = el('radialGradient', { id: 'thumb', cx: '40%', cy: '35%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#000', 'stop-opacity': '0.28' }, thumb);
    el('stop', { offset: '70%', 'stop-color': '#000', 'stop-opacity': '0.08' }, thumb);
    el('stop', { offset: '100%', 'stop-color': '#fff', 'stop-opacity': '0.12' }, thumb);

    const ember = el('radialGradient', { id: 'ember' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#ffd28a' }, ember);
    el('stop', { offset: '45%', 'stop-color': '#e2672a', 'stop-opacity': '0.85' }, ember);
    el('stop', { offset: '100%', 'stop-color': '#7a1d0c', 'stop-opacity': '0' }, ember);

    const skin = el('linearGradient', { id: 'skin', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#a7714a' }, skin);
    el('stop', { offset: '100%', 'stop-color': '#5d3820' }, skin);

    // Body (shoulders + chest), drawn first so the head sits on it.
    this.body = el('g', { class: 'body' }, this.svg);
    const bodyClay = el('g', { filter: 'url(#rough)' }, this.body);
    this.neck = el('path', { d: 'M232 390 L 368 390 L 386 480 L 214 480 Z', fill: '#66401f', filter: 'url(#clay)' }, bodyClay);
    this.chest = el('path', {
      d: 'M30 640 C 40 545, 110 488, 205 470 C 250 462, 350 462, 395 470 C 490 488, 560 545, 570 640 Z',
      fill: 'url(#skin)', filter: 'url(#clay)',
    }, bodyClay);
    el('path', { d: 'M30 640 C 40 545, 110 488, 205 470 C 250 462, 350 462, 395 470 C 490 488, 560 545, 570 640 Z', fill: 'url(#shade)' }, bodyClay);
    for (const [x, y, r, a] of [[150, 565, 22, -20], [438, 548, 18, 25]]) el('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.55, fill: 'url(#thumb)', opacity: 0.6, transform: `rotate(${a} ${x} ${y})` }, bodyClay);
    this.heart = el('circle', { cx: 300, cy: 568, r: 46, fill: 'url(#ember)', opacity: 0.2 }, this.body);

    // Head.
    this.head = el('g', { class: 'head' }, this.svg);
    const headClay = el('g', { filter: 'url(#rough)' }, this.head);
    const SKULL = 'M300 78 C 392 74, 448 118, 456 200 C 462 262, 452 318, 430 360 C 408 404, 362 428, 300 432 C 238 428, 192 404, 170 360 C 148 318, 138 262, 144 200 C 152 118, 208 82, 300 78 Z';
    this.skull = el('path', { d: SKULL, fill: 'url(#skin)', filter: 'url(#clay)' }, headClay);
    el('path', { d: SKULL, fill: 'url(#shade)' }, headClay);
    for (const [x, y, r, a] of [[198, 150, 17, -35], [414, 304, 15, 60]]) el('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.5, fill: 'url(#thumb)', opacity: 0.55, transform: `rotate(${a} ${x} ${y})` }, headClay);
    // Brow ridge: a heavy shelf of clay pressed over the eyes.
    el('path', { d: 'M178 214 C 220 190, 270 196, 300 206 C 330 196, 380 190, 422 214 C 404 226, 360 222, 300 224 C 240 222, 196 226, 178 214 Z', fill: '#5a3519', opacity: 0.55 }, headClay);
    this.face = el('g', { class: 'face' }, this.head);

    // Forehead: אמת. The aleph is its own element so it can fade alone.
    this.word = el('g', { class: 'word', filter: 'url(#carve)' }, this.face);
    this.mem = el('text', { x: 300, y: 158, 'text-anchor': 'middle', class: 'letters' }, this.word);
    this.mem.textContent = 'מת';
    this.aleph = el('text', { x: 360, y: 158, 'text-anchor': 'middle', class: 'letters aleph' }, this.word);
    this.aleph.textContent = 'א';

    // Brows, eyes (sockets, embers, lids), mouth.
    this.browA = el('path', { class: 'brow', fill: 'none', stroke: '#4a2b17', 'stroke-width': 9, 'stroke-linecap': 'round' }, this.face);
    this.browB = el('path', { class: 'brow', fill: 'none', stroke: '#4a2b17', 'stroke-width': 9, 'stroke-linecap': 'round' }, this.face);
    this.eyes = [230, 370].map((cx) => {
      const g = el('g', {}, this.face);
      el('ellipse', { cx, cy: 242, rx: 40, ry: 28, fill: 'url(#socket)' }, g);
      el('ellipse', { cx, cy: 242, rx: 28, ry: 18, fill: '#1a0d06' }, g);
      const glow = el('ellipse', { cx, cy: 242, rx: 12, ry: 10, fill: 'url(#ember)' }, g);
      const lid = el('path', { fill: '#7a4a28', filter: 'url(#clay)' }, g);
      return { cx, glow, lid };
    });
    // A broad lump of a nose, pressed on with a thumb.
    el('path', { d: 'M286 250 C 280 280, 262 300, 266 318 C 278 330, 322 330, 334 318 C 338 300, 320 280, 314 250 Z', fill: '#7d4b28', filter: 'url(#clay)' }, this.face);
    el('path', { d: 'M286 250 C 280 280, 262 300, 266 318 C 278 330, 322 330, 334 318 C 338 300, 320 280, 314 250 Z', fill: 'url(#shade)' }, this.face);
    el('ellipse', { cx: 284, cy: 318, rx: 7, ry: 4, fill: '#24130a' }, this.face);
    el('ellipse', { cx: 316, cy: 318, rx: 7, ry: 4, fill: '#24130a' }, this.face);
    this.mouth = el('path', { fill: '#24130a', stroke: '#3b2212', 'stroke-width': 3 }, this.face);
    this.ear = el('circle', { cx: 455, cy: 255, r: 16, fill: 'url(#ember)', opacity: 0 }, this.head);

    // Cracks, hidden until the aleph is gone.
    this.cracks = el('g', { class: 'cracks', fill: 'none', stroke: '#1d0f07', 'stroke-width': 3, 'stroke-linecap': 'round' }, this.svg);
    for (const d of [
      'M300 72 L 292 120 L 306 150 L 296 190', 'M180 160 L 210 205 L 198 240 L 222 290',
      'M430 180 L 404 230 L 420 270 L 398 320', 'M300 430 L 310 470 L 296 520 L 312 600',
      'M150 560 L 200 540 L 230 575', 'M450 560 L 405 545 L 380 585',
    ]) {
      const p = el('path', { d }, this.cracks);
      p.style.strokeDasharray = '400'; p.style.strokeDashoffset = '400';
    }

    this.alive = 0;     // 0 = clay, 1 = fully awake; eases toward the target
    this.alephHeld = 1; // eases toward calm
    this.dead = false;
  }

  // state: { shaping, shapingProgress, calm, breath, heart, face, blink, talking }
  draw(s, dt) {
    const ease = (cur, target, rate) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

    // Waking: the golem comes alive as the shaping minute completes.
    this.alive = ease(this.alive, s.shaping ? s.shapingProgress * 0.6 : 1, 1.5);

    // The aleph holds while you are calm. Below ~0.3 for long enough, it lets go.
    const target = s.shaping ? 1 : Math.max(0, Math.min(1, (s.calm - 0.2) / 0.35));
    this.alephHeld = ease(this.alephHeld, target, 0.8);
    const wasDead = this.dead;
    if (!this.dead && this.alephHeld < 0.12) this.dead = true;
    if (this.dead && this.alephHeld > 0.55) this.dead = false;
    this.aleph.style.opacity = this.alephHeld.toFixed(3);
    this.mem.setAttribute('x', 300 - 22 * this.alephHeld); // מת closes up when the aleph is gone
    this.aleph.setAttribute('x', 300 + 52 * this.alephHeld);
    if (wasDead !== this.dead) this.onChange?.(this.dead);

    const life = this.alive * (this.dead ? 0.08 : 1);
    for (const p of this.cracks.children) {
      const cur = parseFloat(p.style.strokeDashoffset);
      p.style.strokeDashoffset = String(ease(cur, this.dead ? 0 : 400, this.dead ? 0.9 : 0.5));
    }

    // Breathing: chest and shoulders rise, head rides on top.
    const br = (s.breath - 0.5) * 2 * life;
    this.body.setAttribute('transform', `translate(300 640) scale(${1 + 0.018 * br} ${1 + 0.035 * br}) translate(-300 -640)`);

    // Heart: ember brightness follows the arterial pressure wave.
    this.heart.setAttribute('opacity', (0.08 + 0.85 * life * Math.pow(s.heart, 2)).toFixed(3));
    this.heart.setAttribute('r', (40 + 12 * s.heart * life).toFixed(1));

    // Head: follows your roll and yaw, sinks when the golem dies.
    const f = s.face;
    const sink = this.dead ? 26 : 0;
    this.headSink = ease(this.headSink || 0, sink, 1.2);
    this.head.setAttribute('transform', `translate(${18 * f.yaw * life} ${this.headSink - 6 * br}) rotate(${(-f.roll * 14 * life).toFixed(2)} 300 430)`);
    this.face.setAttribute('transform', `translate(${10 * f.yaw * life} 0)`);

    // Brows.
    const by = 200 - 16 * (f.brow - 0.4) * life;
    this.browA.setAttribute('d', `M196 ${by + 6} Q 230 ${by - 8} 264 ${by + 2}`);
    this.browB.setAttribute('d', `M336 ${by + 2} Q 370 ${by - 8} 404 ${by + 6}`);

    // Eyes: lids close with yours (and on every blink); embers go dark without life.
    const open = s.blink ? 0.05 : Math.max(0.05, f.eye) * (0.25 + 0.75 * this.alive);
    for (const e of this.eyes) {
      const top = 222 + (1 - open) * 42;
      e.lid.setAttribute('d', `M${e.cx - 34} 236 C ${e.cx - 30} 216, ${e.cx + 30} 216, ${e.cx + 34} 236 L ${e.cx + 32} ${top + 4} Q ${e.cx} ${top + 14} ${e.cx - 32} ${top + 4} Z`);
      e.glow.setAttribute('opacity', (0.15 + 0.85 * life).toFixed(3));
    }

    // Mouth: opens with yours, curves with your smile.
    const mw = 48 + 26 * f.smile, mo = 4 + 30 * f.mouthOpen * life, curve = 10 * (f.smile - 0.4), my = 366;
    this.mouth.setAttribute('d', `M${300 - mw} ${my} Q 300 ${my + curve} ${300 + mw} ${my} Q 300 ${my + mo + curve} ${300 - mw} ${my} Z`);

    // Listening: an ember by the ear while you talk.
    this.ear.setAttribute('opacity', String(ease(parseFloat(this.ear.getAttribute('opacity')), s.talking && !this.dead ? 0.9 : 0, 4).toFixed(3)));

    this.svg.classList.toggle('dead', this.dead);
  }
}
