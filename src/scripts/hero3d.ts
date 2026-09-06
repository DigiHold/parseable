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
    vec3 paper = vec3(0.985, 0.982, 0.975) - fibre * 0.05;

    vec3 human = texture2D(uHuman, vUv).rgb;
    vec3 machine = texture2D(uMachine, vUv).rgb;

    // the blade: everything above is the typeset page, below it the extraction
    float edge = smoothstep(uScan - 0.004, uScan + 0.004, vUv.y);
    // in a thin band just under the blade the letters have not settled yet
    float below = uScan - vUv.y;
    float unsettled = below > 0.0 ? 1.0 - smoothstep(0.0, 0.07, below) : 0.0;
    vec2 jitter = vec2(hash(vec2(floor(vUv.y * 400.0), floor(uTime * 12.0))) - 0.5, 0.0) * unsettled * 0.012;
    vec3 machineJ = texture2D(uMachine, vUv + jitter).rgb;

    vec3 ink = mix(machineJ, human, edge);
    vec3 col = paper * ink;

    // light from the blade, falling onto the paper both ways
    float d = abs(vUv.y - uScan);
    float glow = exp(-d * 60.0) * 0.9 + exp(-d * 14.0) * 0.25;
    col += vec3(0.30, 0.48, 0.90) * glow * 0.6;

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

/* The typeset page, drawn with the page's own faces at print size. */
function humanFace(THREE: T) {
  const [c, g] = canvas(1240, 1754);
  const X = 118; let y = 170;
  g.fillStyle = '#111'; g.font = '600 56px "IBM Plex Sans"'; g.fillText(RESUME.name, X, y); y += 48;
  g.fillStyle = '#555'; g.font = '400 26px "IBM Plex Sans"'; g.fillText(RESUME.role, X, y); y += 40;
  g.fillStyle = '#444'; g.font = '400 19px "IBM Plex Sans"'; g.fillText(RESUME.contact, X, y); y += 30;
  g.fillStyle = '#111'; g.fillRect(X, y, 1004, 3); y += 56;
  for (const [head, lines] of RESUME.sections) {
    g.fillStyle = '#111'; g.font = '600 20px "IBM Plex Sans"'; g.fillText(head, X, y); y += 12;
    g.fillStyle = '#ddd'; g.fillRect(X, y, 1004, 1); y += 38;
    for (const l of lines) {
      const isTitle = /\d{4} - \d{4}$/.test(l);
      const isOrg = /^(Payfit|Doctolib|INSA)/.test(l);
      g.fillStyle = isOrg ? '#555' : '#222';
      g.font = isTitle ? '600 21px "IBM Plex Sans"' : isOrg ? 'italic 400 19px "IBM Plex Sans"' : '400 19.5px "IBM Plex Sans"';
      if (isTitle) {
        const [t, d] = [l.replace(/\s{2,}.*$/, ''), l.replace(/^.*\s{2,}/, '')];
        g.fillText(t, X, y); g.font = '400 18px "IBM Plex Sans"'; g.fillStyle = '#666';
        g.fillText(d, X + 1004 - g.measureText(d).width, y);
      } else g.fillText((head === 'EXPERIENCE' && !isOrg ? '   ' : '') + l, X, y);
      y += 33;
    }
    y += 30;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/* The same page as the extractor returns it: one weight, one face, the posting's terms lit. */
function machineFace(THREE: T) {
  const [c, g] = canvas(1240, 1754);
  const X = 118; let y = 170; const line = 34;
  g.font = '400 19px "IBM Plex Mono"';
  const put = (s: string) => {
    let x = X;
    for (const part of s.split(/(\b(?:Python|Go|Kubernetes|Docker|PostgreSQL|CI\/CD)\b)/)) {
      if (!part) continue;
      const w = g.measureText(part).width;
      if (LIT.includes(part)) { g.fillStyle = '#d6e3ff'; g.fillRect(x - 2, y - 20, w + 4, 27); g.fillStyle = '#1d4ed8'; }
      else g.fillStyle = '#222';
      g.fillText(part, x, y); x += w;
    }
    y += line;
  };
  put(RESUME.name); put(RESUME.role); put(RESUME.contact); y += line;
  for (const [head, lines] of RESUME.sections) { put(head); for (const l of lines) put(l); y += line; }
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

  const geo = new THREE.PlaneGeometry(2.1, 2.97, 48, 64);
  const paper = new THREE.ShaderMaterial({
    uniforms: { uHuman: { value: humanFace(THREE) }, uMachine: { value: machineFace(THREE) }, uScan: { value: 1.1 }, uTime: { value: 0 } },
    vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG,
  });
  const sheet = new THREE.Mesh(geo, paper);

  // a second, unlit sheet behind for depth, and a soft floor shadow
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.97), new THREE.MeshBasicMaterial({ color: 0x1b1d23 }));
  back.position.set(0.32, -0.26, -0.22); back.rotation.z = -0.06;
  const shadowTex = (() => {
    const [c, g] = canvas(512, 512); g.clearRect(0, 0, 512, 512);
    const r = g.createRadialGradient(256, 256, 60, 256, 256, 256); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 512, 512); return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.set(0.4, -0.6, -1.2);

  // the blade of light, emissive, bloomed by the composer
  const bladeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  bladeMat.color.setRGB(2.2, 3.0, 5.0);
  const blade = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.014), bladeMat);
  blade.position.z = 0.09;

  const group = new THREE.Group();
  group.add(shadow, back, sheet, blade);
  group.rotation.set(0.12, -0.42, 0.04);
  scene.add(group);
  const place = () => {
    const narrow = host.clientWidth < 760;
    group.position.set(narrow ? 0 : 1.25, narrow ? -1.15 : 0, 0);
    group.scale.setScalar(narrow ? 0.62 : 1);
  };
  place();

  host.replaceChildren(renderer.domElement);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.6, 1.05);
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

  const setScan = (v: number) => { paper.uniforms.uScan.value = v; blade.position.y = (v - 0.5) * 2.97; blade.visible = v > 0 && v < 1; };

  const base = { x: 0.12, y: -0.42 };
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
  const CYCLE = 9;
  const frame = () => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    const p = (t % CYCLE) / CYCLE;
    const scan = p < 0.45 ? 1.1 - ease(p / 0.45) * 1.2 : p < 0.55 ? -0.1 : p < 0.95 ? -0.1 + ease((p - 0.55) / 0.4) * 1.2 : 1.1;
    setScan(scan);
    paper.uniforms.uTime.value = t;
    grain.uniforms.uTime.value = t;
    cur.x += (target.x - cur.x) * 0.045; cur.y += (target.y - cur.y) * 0.045;
    group.rotation.set(cur.x, cur.y, 0.04 + Math.sin(t * 0.5) * 0.012);
    group.position.y = (host.clientWidth < 760 ? -1.15 : 0) + Math.sin(t * 0.7) * 0.05;
    composer.render();
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; clock.start(); frame(); }
    if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  }, { threshold: 0.05 }).observe(host);
}
