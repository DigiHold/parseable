/**
 * The hero: a sheet of paper floating in a dark room, crossed by a blade of light.
 * Above the blade the sheet is the resume a person reads, typeset. Below it, the same
 * sheet is what the screening software reads: one monospace run, styling gone, the
 * terms a posting asked for lit. Bloom on the blade, film grain over everything,
 * a slow drift and a parallax that follows the pointer.
 *
 * three loads after first paint. With reduced motion, one still frame is drawn.
 */
import type * as THREE_NS from 'three';

type T = typeof THREE_NS;

const PAPER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vBend;
  void main() {
    vUv = uv;
    vec3 p = position;
    // paper is never flat: a soft bend along the width, breathing slowly
    float bend = sin(uv.x * 3.1416) * 0.06 * (0.8 + 0.2 * sin(uTime * 0.6));
    p.z += bend;
    vBend = bend;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const PAPER_FRAG = /* glsl */ `
  uniform sampler2D uHuman;
  uniform sampler2D uMachine;
  uniform float uScan;
  uniform float uTime;
  varying vec2 vUv;
  varying float vBend;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    // cotton paper: layered noise, faint fibres
    float fibre = noise(vUv * 900.0) * 0.5 + noise(vUv * 220.0) * 0.35 + noise(vUv * 40.0) * 0.15;
    vec3 paper = vec3(0.93, 0.925, 0.91) - fibre * 0.09;
    // the cut edge of the sheet, a hair darker
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    paper *= 0.78 + 0.22 * smoothstep(0.0, 0.006, edge);

    vec3 human = texture2D(uHuman, vUv).rgb;
    vec3 machine = texture2D(uMachine, vUv).rgb;

    // the blade: everything above is the typeset page, below it the extraction
    float side = smoothstep(uScan - 0.004, uScan + 0.004, vUv.y);
    // in a thin band just under the blade the letters have not settled yet
    float below = uScan - vUv.y;
    float unsettled = below > 0.0 ? 1.0 - smoothstep(0.0, 0.035, below) : 0.0;
    vec2 jitter = vec2(hash(vec2(floor(vUv.y * 400.0), floor(uTime * 12.0))) - 0.5, 0.0) * unsettled * 0.004;
    vec3 machineJ = texture2D(uMachine, vUv + jitter).rgb;

    vec3 ink = mix(machineJ, human, side);
    vec3 col = paper * ink;

    // the blade on the paper: a thin tinted core, a broad falloff that lifts the paper to white
    float d = abs(vUv.y - uScan);
    float core = exp(-d * 420.0);
    float fall = exp(-d * 26.0);
    col += vec3(0.10, 0.10, 0.11) * fall;
    // the light model: the blade is the source. Paper beside it goes to white, the far
    // corners fall to about half, and the near (left) edge catches more than the far one.
    float toBlade = exp(-d * 3.4);
    float across = 1.0 - vUv.x * 0.35;
    float lit = clamp(0.52 + 0.62 * toBlade * across + 0.10 * (1.0 - vUv.x), 0.45, 1.25);
    col *= lit;
    // the cut edge on the lit side, a hair brighter, as a sheet with thickness would show
    col += vec3(0.10) * (1.0 - smoothstep(0.0, 0.004, vUv.x)) * toBlade;
    col += vec3(0.45, 0.62, 1.0) * core * 0.9;

    // shading from the bend, a hair darker where the paper turns away
    col *= 0.94 + vBend * 1.2;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GRAIN_SHADER = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.055 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float g = (hash(vUv * 1400.0) - 0.5) * uAmount;
      // a soft vignette keeps the eye on the sheet
      float v = smoothstep(1.25, 0.35, length(vUv - 0.5));
      gl_FragColor = vec4(c.rgb * (0.82 + 0.18 * v) + g, 1.0);
    }`,
};

const RESUME = {
  name: 'Marie Dubois', role: 'Senior Backend Engineer',
  contact: 'marie.dubois@example.com  |  +33 6 12 34 56 78  |  Lyon, France, remote across CET',
  sections: [
    ['PROFESSIONAL SUMMARY', ['Backend engineer with nine years building payment systems in Python and Go. Led the', 'migration of a monolith to services handling four thousand requests per second.']],
    ['SKILLS', ['Languages: Python, Go, SQL, TypeScript', 'Infrastructure: Kubernetes, Docker, PostgreSQL, Terraform, AWS', 'Practices: CI/CD, on call, incident reviews, technical writing']],
    ['EXPERIENCE', ['Senior Backend Engineer                                              2021 - 2026', 'Payfit, Paris', 'Rebuilt the billing service in Go and cut p99 latency from 800ms to 90ms.', 'Mentored four engineers through the migration and ran the on call rotation.', 'Wrote the incident review process the whole platform team now follows.', 'Backend Engineer                                                     2017 - 2021', 'Doctolib, Paris', 'Shipped the appointment reminder pipeline, sending two million messages a day.', 'Moved the search index to a managed cluster with zero downtime.']],
    ['EDUCATION', ['MSc Computer Science                                                 2015 - 2017', 'INSA Lyon']],
  ] as Array<[string, string[]]>,
};
const LIT = ['Python', 'Go', 'Kubernetes', 'Docker', 'PostgreSQL', 'CI/CD'];

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  return [c, g] as const;
}

/* One layout shared by both faces, so the machine reads the same words at the same places. */
interface Run { text: string; y: number; x?: number; kind: 'name' | 'role' | 'contact' | 'head' | 'title' | 'date' | 'org' | 'line' | 'rule' }
function layout(): Run[] {
  const X = 118; const W = 1004; let y = 150; const runs: Run[] = [];
  runs.push({ text: RESUME.name, y, kind: 'name' }); y += 46;
  runs.push({ text: RESUME.role, y, kind: 'role' }); y += 36;
  runs.push({ text: RESUME.contact, y, kind: 'contact' }); y += 26;
  runs.push({ text: '', y, kind: 'rule' }); y += 50;
  for (const [head, lines] of RESUME.sections) {
    runs.push({ text: head, y, kind: 'head' }); y += 34;
    for (const l of lines) {
      if (/\d{4} - \d{4}$/.test(l)) {
        runs.push({ text: l.replace(/\s{2,}.*$/, ''), y, kind: 'title' });
        runs.push({ text: l.replace(/^.*\s{2,}/, ''), y, x: X + W, kind: 'date' });
      } else if (/^(Payfit|Doctolib|INSA)/.test(l)) runs.push({ text: l, y, kind: 'org' });
      else runs.push({ text: l, y, kind: 'line' });
      y += 31;
    }
    y += 24;
  }
  return runs;
}

function humanFace(THREE: T) {
  const [c, g] = canvas(1240, 1506);
  const X = 118;
  for (const r of layout()) {
    if (r.kind === 'rule') { g.fillStyle = '#111'; g.fillRect(X, r.y, 1004, 3); continue; }
    const font = { name: '600 50px', role: '400 24px', contact: '400 17px', head: '600 18px', title: '600 19px', date: '400 17px', org: 'italic 400 17px', line: '400 18px' }[r.kind];
    g.font = `${font} "IBM Plex Sans"`;
    g.fillStyle = r.kind === 'role' || r.kind === 'org' || r.kind === 'date' ? '#555' : r.kind === 'contact' ? '#444' : '#111';
    const x = r.x !== undefined ? r.x - g.measureText(r.text).width : r.kind === 'line' && !/^(Languages|Infrastructure|Practices|Backend engineer|migration)/.test(r.text) ? X + 14 : X;
    g.fillText(r.text, x, r.y);
    if (r.kind === 'head') { g.fillStyle = '#ddd'; g.fillRect(X, r.y + 10, 1004, 1); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function machineFace(THREE: T) {
  const [c, g] = canvas(1240, 1506);
  const X = 118;
  g.font = '400 17px "IBM Plex Mono"';
  for (const r of layout()) {
    if (r.kind === 'rule') continue;
    let x = r.x !== undefined ? r.x - g.measureText(r.text).width : X;
    for (const part of r.text.split(/(\b(?:Python|Go|Kubernetes|Docker|PostgreSQL|CI\/CD)\b)/)) {
      if (!part) continue;
      const w = g.measureText(part).width;
      if (LIT.includes(part)) { g.fillStyle = '#d6e3ff'; g.fillRect(x - 2, r.y - 18, w + 4, 24); g.fillStyle = '#1d4ed8'; }
      else g.fillStyle = '#222';
      g.fillText(part, x, r.y); x += w;
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export async function mountHero(host: HTMLElement): Promise<void> {
  await Promise.all([document.fonts.load('600 46px "IBM Plex Sans"'), document.fonts.load('400 16px "IBM Plex Mono"')]).catch(() => {});
  const THREE = await import('three');
  const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
  const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');
  const { ShaderPass } = await import('three/examples/jsm/postprocessing/ShaderPass.js');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a0b0e, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 40);
  camera.position.set(0, 0, 8.2);

  const geo = new THREE.PlaneGeometry(2.1, 2.55, 48, 64);
  const paper = new THREE.ShaderMaterial({
    uniforms: { uHuman: { value: humanFace(THREE) }, uMachine: { value: machineFace(THREE) }, uScan: { value: 1.1 }, uTime: { value: 0 } },
    vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG,
  });
  const sheet = new THREE.Mesh(geo, paper);

  // a second, unlit sheet behind for depth, and a soft floor shadow
  const shadowTex = (() => {
    const [c, g] = canvas(512, 512); g.clearRect(0, 0, 512, 512);
    const r = g.createRadialGradient(256, 256, 60, 256, 256, 256); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 512, 512); return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 1 }));
  shadow.position.set(0.22, -0.32, -0.26);

  // the blade of light, emissive, bloomed by the composer
  const bladeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  bladeMat.color.setRGB(2.4, 3.0, 4.6);
  const blade = new THREE.Mesh(new THREE.PlaneGeometry(2.02, 0.006), bladeMat);
  blade.position.z = 0.09;
  const spillTex = (() => {
    const [c, g] = canvas(512, 512); g.clearRect(0, 0, 512, 512);
    const r = g.createRadialGradient(256, 256, 4, 256, 256, 200);
    r.addColorStop(0, 'rgba(90,130,255,0.22)'); r.addColorStop(0.45, 'rgba(50,80,170,0.07)'); r.addColorStop(0.85, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 512, 512); return new THREE.CanvasTexture(c);
  })();
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  spill.position.z = -0.6;

  const group = new THREE.Group();
  group.add(spill, shadow, sheet, blade);
  group.rotation.set(0.14, -0.5, 0.05);
  scene.add(group);
  const place = () => {
    const narrow = host.clientWidth < 760;
    group.rotation.set(narrow ? 0.06 : 0.14, narrow ? -0.16 : -0.5, narrow ? 0.02 : 0.05);
    group.position.set(narrow ? 0.4 : 1.32, narrow ? -1.55 : -0.42, 0);
    group.scale.setScalar(narrow ? 1.0 : 1.12);
  };
  place();

  host.replaceChildren(renderer.domElement);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 1.0, 1.02);
  composer.addPass(bloom);
  const grain = new ShaderPass(GRAIN_SHADER);
  composer.addPass(grain);

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    place();
  };
  resize();
  new ResizeObserver(resize).observe(host);

  const setScan = (v: number) => { paper.uniforms.uScan.value = v; blade.position.y = (v - 0.5) * 2.55; spill.position.y = blade.position.y - 0.1; blade.visible = v > 0 && v < 1; (spill.material as THREE_NS.MeshBasicMaterial).opacity = blade.visible ? 1 : 0; };

  const base = { x: 0.14, y: -0.5 };
  const target = { ...base }; const cur = { ...base };
  if (!reduce) {
    window.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      target.y = base.y + (((e.clientX - r.left) / r.width) * 2 - 1) * 0.28;
      target.x = base.x - (((e.clientY - r.top) / r.height) * 2 - 1) * 0.16;
    }, { passive: true });
  }

  if (reduce) { setScan(0.52); composer.render(); return; }

  const clock = new THREE.Clock();
  let running = false, raf = 0;
  const CYCLE = 12;
  const frame = () => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    const p = (t % CYCLE) / CYCLE;
    // sweep to the middle, rest there so one frame tells the story, finish, come back
    const scan = p < 0.25 ? 1.1 - ease(p / 0.25) * 0.62 : p < 0.55 ? 0.48 : p < 0.72 ? 0.48 - ease((p - 0.55) / 0.17) * 0.58 : p < 0.8 ? -0.1 : p < 0.97 ? -0.1 + ease((p - 0.8) / 0.17) * 1.2 : 1.1;
    setScan(scan);
    paper.uniforms.uTime.value = t;
    grain.uniforms.uTime.value = t;
    cur.x += (target.x - cur.x) * 0.045; cur.y += (target.y - cur.y) * 0.045;
    if (host.clientWidth >= 760) group.rotation.set(cur.x, cur.y, 0.04 + Math.sin(t * 0.5) * 0.012);
    group.position.y = (host.clientWidth < 760 ? -1.55 : -0.42) + Math.sin(t * 0.7) * 0.04;
    composer.render();
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; clock.start(); frame(); }
    if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  }, { threshold: 0.05 }).observe(host);
}
