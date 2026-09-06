/**
 * The hero object: an A4 sheet floating in space, crossed by a scan beam.
 * Above the beam the sheet is the resume a person sees. Below it, the same
 * sheet is what the screening software reads: flat text, styling gone.
 *
 * three is imported on demand after the page has painted, so it never sits
 * in the critical path. With reduced motion on, one frame is drawn and held.
 */

type ThreeNS = typeof import('three');

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uHuman;
  uniform sampler2D uMachine;
  uniform float uScan;
  uniform vec3 uGlow;
  varying vec2 vUv;
  void main() {
    vec3 human = texture2D(uHuman, vUv).rgb;
    vec3 machine = texture2D(uMachine, vUv).rgb;
    float above = smoothstep(uScan - 0.006, uScan + 0.006, vUv.y);
    vec3 col = mix(machine, human, above);
    float glow = exp(-abs(vUv.y - uScan) * 70.0);
    col += uGlow * glow * 0.85;
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Row { y: number; w: number; kind: 'name' | 'role' | 'rule' | 'head' | 'line' | 'gap' }

/* One layout, drawn twice. The rows are what make the two faces read as the same document. */
const ROWS: Row[] = [
  { y: 84, w: 330, kind: 'name' }, { y: 132, w: 210, kind: 'role' }, { y: 176, w: 1024, kind: 'rule' },
  { y: 232, w: 250, kind: 'head' },
  { y: 282, w: 840, kind: 'line' }, { y: 318, w: 810, kind: 'line' }, { y: 354, w: 760, kind: 'line' },
  { y: 430, w: 120, kind: 'head' },
  { y: 480, w: 700, kind: 'line' }, { y: 516, w: 640, kind: 'line' }, { y: 552, w: 720, kind: 'line' },
  { y: 628, w: 190, kind: 'head' },
  { y: 678, w: 420, kind: 'line' }, { y: 714, w: 790, kind: 'line' }, { y: 750, w: 830, kind: 'line' },
  { y: 786, w: 700, kind: 'line' },
  { y: 852, w: 400, kind: 'line' }, { y: 888, w: 800, kind: 'line' }, { y: 924, w: 760, kind: 'line' },
  { y: 990, w: 380, kind: 'line' }, { y: 1026, w: 810, kind: 'line' }, { y: 1062, w: 690, kind: 'line' },
  { y: 1140, w: 170, kind: 'head' },
  { y: 1190, w: 560, kind: 'line' }, { y: 1226, w: 620, kind: 'line' },
  { y: 1300, w: 640, kind: 'line' }, { y: 1336, w: 520, kind: 'line' },
];
const MATCHED = new Set([282, 480, 552, 714, 888, 1026, 1190]);

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D] as const;
}

function humanFace(THREE: ThreeNS) {
  const [c, g] = canvas(1024, 1448);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 1448);
  const x = 96;
  for (const r of ROWS) {
    if (r.kind === 'rule') { g.fillStyle = '#c9a961'; g.fillRect(x, r.y, 832, 4); continue; }
    g.fillStyle = r.kind === 'name' || r.kind === 'head' ? '#16181c' : r.kind === 'role' ? '#8b95a5' : '#d9dde3';
    const h = r.kind === 'name' ? 30 : r.kind === 'head' ? 16 : r.kind === 'role' ? 14 : 12;
    g.beginPath(); g.roundRect(x, r.y, Math.min(r.w, 832), h, 3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function machineFace(THREE: ThreeNS) {
  const [c, g] = canvas(1024, 1448);
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, 1024, 1448);
  const x = 96;
  for (const r of ROWS) {
    if (r.kind === 'rule') continue; // styling does not survive extraction
    const matched = MATCHED.has(r.y);
    g.fillStyle = matched ? '#34d399' : r.kind === 'line' ? '#3f4756' : '#9aa3b2';
    // everything is the same weight to the machine: one monospace run per row
    const segs = Math.max(1, Math.round(r.w / 120));
    let cx = x;
    for (let i = 0; i < segs; i++) {
      const sw = Math.min(r.w - (cx - x), 96 + ((i * 37) % 30));
      if (sw <= 0) break;
      g.beginPath(); g.roundRect(cx, r.y + 1, sw, 10, 2); g.fill();
      cx += sw + 22;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function shadowFace(THREE: ThreeNS) {
  const [c, g] = canvas(512, 512);
  const grad = g.createRadialGradient(256, 256, 40, 256, 256, 250);
  grad.addColorStop(0, 'rgba(15,23,42,0.34)');
  grad.addColorStop(1, 'rgba(15,23,42,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export async function mountHero(host: HTMLElement): Promise<void> {
  const THREE = await import('three');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  camera.position.set(0, 0, 7.6);

  const sheetGeo = new THREE.PlaneGeometry(2.1, 2.97);
  const face = new THREE.ShaderMaterial({
    uniforms: {
      uHuman: { value: humanFace(THREE) },
      uMachine: { value: machineFace(THREE) },
      uScan: { value: 1.1 },
      uGlow: { value: new THREE.Color('#2563eb') },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const sheet = new THREE.Mesh(sheetGeo, face);

  const back = new THREE.Mesh(sheetGeo, new THREE.MeshBasicMaterial({ color: '#eef1f5' }));
  back.position.set(0.26, -0.22, -0.16); back.rotation.z = -0.05;

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 5.2),
    new THREE.MeshBasicMaterial({ map: shadowFace(THREE), transparent: true, depthWrite: false })
  );
  shadow.position.set(0.3, -0.5, -0.9);

  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(2.14, 0.014),
    new THREE.MeshBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beam.position.z = 0.02;

  const group = new THREE.Group();
  group.add(shadow, back, sheet, beam);
  scene.add(group);

  const base = { x: 0.1, y: -0.34 };
  const target = { x: base.x, y: base.y };
  const current = { x: base.x, y: base.y };

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  host.replaceChildren(renderer.domElement);
  resize();
  new ResizeObserver(resize).observe(host);

  const setScan = (v: number) => {
    face.uniforms.uScan.value = v;
    beam.position.y = (v - 0.5) * 2.97;
    beam.visible = v > 0 && v < 1;
  };

  if (reduce) {
    group.rotation.set(base.x, base.y, 0.03);
    setScan(0.56);
    renderer.render(scene, camera);
    return;
  }

  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const my = ((e.clientY - r.top) / r.height) * 2 - 1;
    target.y = base.y + mx * 0.22;
    target.x = base.x - my * 0.14;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  const clock = new THREE.Clock();
  let running = false;
  let raf = 0;
  const CYCLE = 7.2; // seconds: sweep down, hold, sweep back, hold

  const frame = () => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    const p = (t % CYCLE) / CYCLE;
    let scan: number;
    if (p < 0.42) scan = 1.1 - ease(p / 0.42) * 1.2;
    else if (p < 0.56) scan = -0.1;
    else if (p < 0.92) scan = -0.1 + ease((p - 0.56) / 0.36) * 1.2;
    else scan = 1.1;
    setScan(scan);

    current.x += (target.x - current.x) * 0.05;
    current.y += (target.y - current.y) * 0.05;
    group.rotation.set(current.x, current.y, 0.03 + Math.sin(t * 0.6) * 0.01);
    group.position.y = Math.sin(t * 0.8) * 0.04;
    renderer.render(scene, camera);
  };

  const io = new IntersectionObserver(([entry]) => {
    const visible = entry.isIntersecting;
    if (visible && !running) { running = true; clock.start(); frame(); }
    if (!visible && running) { running = false; cancelAnimationFrame(raf); }
  }, { threshold: 0.05 });
  io.observe(host);
}
