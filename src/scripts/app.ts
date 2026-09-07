import type { Resume, TemplateId } from './types';
import { emptyResume, normalise } from './types';
import { renderSheet, renderParserText } from './render';
import { audit, type Audit } from './keywords';
import { tailor, guessTitle, cleanTitle, describe, describeSkipped, type TailorLog } from './tailor';

type StepId = 'details' | 'template' | 'posting' | 'export';
const STEPS: StepId[] = ['details', 'template', 'posting', 'export'];
const KEY = 'parseable/draft';

/* A sample resume sits in the tool on arrival, so the page shows the product rather than a picture of it. */
const DEMO: Resume = {"schema": "ats-resume-builder/v1", "basics": {"name": "Marie Dubois", "title": "Senior Backend Engineer", "email": "marie.dubois@example.com", "phone": "+33 6 12 34 56 78", "location": "Lyon, France, remote across CET", "links": [{"label": "github.com/mariedubois", "url": "https://github.com/mariedubois"}], "photo": null, "summary": "Backend engineer with nine years building payment systems in Python and Go. Led the migration of a monolith to services handling four thousand requests per second, and mentored the team through it. Works remotely across CET."}, "skills": [{"label": "Languages", "items": "Python, Go, SQL, TypeScript"}, {"label": "Infrastructure", "items": "Kubernetes, Docker, PostgreSQL, Terraform, AWS"}, {"label": "Practices", "items": "CI/CD, on call, incident reviews, technical writing"}], "experience": [{"title": "Senior Backend Engineer", "org": "Payfit, Paris", "dates": "2021 - 2026", "bullets": ["Rebuilt the billing service in Go and cut p99 latency from 800ms to 90ms.", "Mentored four engineers through the migration and ran the on call rotation.", "Wrote the incident review process the whole platform team now follows."], "env": "Go, Python, PostgreSQL, Kubernetes, AWS"}, {"title": "Backend Engineer", "org": "Doctolib, Paris", "dates": "2017 - 2021", "bullets": ["Shipped the appointment reminder pipeline, sending two million messages a day.", "Moved the search index to a managed cluster with zero downtime."], "env": ""}], "projects": [], "education": [{"degree": "MSc Computer Science", "school": "INSA Lyon", "dates": "2015 - 2017", "detail": ""}], "languages": "French (native), English (professional)", "settings": {"template": "classic", "showPhoto": false}} as Resume;

let data: Resume = DEMO;
let demo = true;
let step: StepId = 'details';
let started = false;
let posting = '';
let postingTitle = '';
let tailorLog: TailorLog | null = null;
let beforeTailor: string | null = null;
let lastAudit: Audit | null = null;
let zoom = 0.66;

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* The draft lives in sessionStorage, so it survives a reload and is gone when
   the tab closes. It never reaches a server, because there is no server. */
function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ data, posting, postingTitle, step, started, demo })); } catch { /* private mode */ }
}
function restore() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as { data?: unknown; posting?: string; postingTitle?: string; step?: StepId; started?: boolean; demo?: boolean };
    data = normalise(p.data);
    demo = p.demo === true;
    started = p.started === true;
    posting = typeof p.posting === 'string' ? p.posting : '';
    postingTitle = typeof p.postingTitle === 'string' ? p.postingTitle : '';
    if (p.step && STEPS.includes(p.step)) step = p.step;
  } catch { /* corrupt draft, start clean */ }
}

/* ------------------------------------------------------------------ panels */

function panelDetails(): string {
  const b = data.basics;
  return `
    <div class="p-5">

      <div class="field"><label for="f-name">Full name</label><input id="f-name" data-bind="basics.name" value="${esc(b.name)}" autocomplete="name"></div>
      <div class="field"><label for="f-title">Job title</label><input id="f-title" data-bind="basics.title" value="${esc(b.title)}" placeholder="Full Stack Developer"></div>
      <div class="row2 grid grid-cols-2 gap-3">
        <div class="field"><label for="f-email">Email</label><input id="f-email" type="email" data-bind="basics.email" value="${esc(b.email)}"></div>
        <div class="field"><label for="f-phone">Phone</label><input id="f-phone" data-bind="basics.phone" value="${esc(b.phone)}"></div>
      </div>
      <div class="field"><label for="f-loc">Location</label><input id="f-loc" data-bind="basics.location" value="${esc(b.location)}" placeholder="Berlin, Germany or Remote (CET)"></div>

      <div class="field"><label for="f-links">Links</label>
        <input id="f-links" data-bind="links" value="${esc(b.links.map((l) => l.url).join(', '))}" placeholder="github.com/you, yoursite.com, separated by commas"></div>

      <div class="field"><label for="f-sum">Professional summary</label>
        <textarea id="f-sum" data-bind="basics.summary" rows="5" placeholder="Three or four sentences. This is where the posting's most important terms belong.">${esc(b.summary)}</textarea>
        <p class="sub"><b data-role="sum-count">${b.summary.trim() ? b.summary.trim().split(/\s+/).length : 0}</b> words. Aim for 45 to 80.</p></div>

      ${repeatable('Skills', 'skills', data.skills.map((s, i) => `
        <div class="card" data-idx="${i}">
          <div class="mb-2.5 flex items-center gap-2">
            <strong class="flex-1 font-display text-[13.5px]">Group ${i + 1}</strong>
            ${moveButtons('skills', i, data.skills.length)}
          </div>
          <div class="field"><label>Label</label><input data-bind="skills.${i}.label" value="${esc(s.label)}" placeholder="Languages"></div>
          <div class="field mb-0"><label>Items</label><input data-bind="skills.${i}.items" value="${esc(s.items)}" placeholder="TypeScript, Python, SQL"></div>
        </div>`).join(''))}

      ${repeatable('Experience', 'experience', data.experience.map((e, i) => `
        <div class="card" data-idx="${i}">
          <div class="mb-2.5 flex items-center gap-2">
            <strong class="flex-1 font-display text-[13.5px]">${esc(e.title || e.org || 'New role')}</strong>
            ${moveButtons('experience', i, data.experience.length)}
          </div>
          <div class="field"><label>Job title</label><input data-bind="experience.${i}.title" value="${esc(e.title)}"></div>
          <div class="row2 grid grid-cols-2 gap-3">
            <div class="field"><label>Company and place</label><input data-bind="experience.${i}.org" value="${esc(e.org)}"></div>
            <div class="field"><label>Dates</label><input data-bind="experience.${i}.dates" value="${esc(e.dates)}" placeholder="2023 - 2025"></div>
          </div>
          <div class="field"><label>What you did, one line each</label>
            <textarea data-bind="experience.${i}.bullets" rows="4" placeholder="Start each line with a verb. Put a number in it when you have one.">${esc(e.bullets.join('\n'))}</textarea></div>
          <div class="field mb-0"><label>Environment (optional)</label><input data-bind="experience.${i}.env" value="${esc(e.env)}" placeholder="React, Node.js, PostgreSQL, AWS"></div>
        </div>`).join(''))}

      ${repeatable('Projects', 'projects', data.projects.map((p, i) => `
        <div class="card" data-idx="${i}">
          <div class="mb-2.5 flex items-center gap-2">
            <strong class="flex-1 font-display text-[13.5px]">${esc(p.name || 'New project')}</strong>
            ${moveButtons('projects', i, data.projects.length)}
          </div>
          <div class="row2 grid grid-cols-2 gap-3">
            <div class="field"><label>Name</label><input data-bind="projects.${i}.name" value="${esc(p.name)}"></div>
            <div class="field"><label>Link or label</label><input data-bind="projects.${i}.meta" value="${esc(p.meta)}" placeholder="github.com/you/thing"></div>
          </div>
          <div class="field"><label>One line on what it is</label><input data-bind="projects.${i}.subtitle" value="${esc(p.subtitle)}"></div>
          <div class="field mb-0"><label>Details, one line each</label><textarea data-bind="projects.${i}.bullets" rows="3">${esc(p.bullets.join('\n'))}</textarea></div>
        </div>`).join(''))}

      ${repeatable('Education', 'education', data.education.map((e, i) => `
        <div class="card" data-idx="${i}">
          <div class="mb-2.5 flex items-center gap-2">
            <strong class="flex-1 font-display text-[13.5px]">${esc(e.degree || 'New entry')}</strong>
            ${moveButtons('education', i, data.education.length)}
          </div>
          <div class="field"><label>Qualification</label><input data-bind="education.${i}.degree" value="${esc(e.degree)}"></div>
          <div class="row2 grid grid-cols-2 gap-3">
            <div class="field"><label>School</label><input data-bind="education.${i}.school" value="${esc(e.school)}"></div>
            <div class="field"><label>Dates</label><input data-bind="education.${i}.dates" value="${esc(e.dates)}"></div>
          </div>
          <div class="field mb-0"><label>Detail (optional)</label><input data-bind="education.${i}.detail" value="${esc(e.detail)}"></div>
        </div>`).join(''))}

      <div class="field"><label for="f-lang">Languages</label><input id="f-lang" data-bind="languages" value="${esc(data.languages)}" placeholder="English (native), German (B2)"></div>
    </div>`;
}

function repeatable(title: string, key: string, body: string): string {
  const count = (data as unknown as Record<string, unknown[]>)[key].length;
  return `<details class="acc">
    <summary><span>${title}</span><span class="acc-count">${count}</span></summary>
    <div class="acc-body">${body}<button class="btn btn-quiet" data-add="${key}">Add ${title.toLowerCase().replace(/s$/, '')}</button></div>
  </details>`;
}
function moveButtons(key: string, i: number, len: number): string {
  return `<button class="icon-btn" data-move="${key}:${i}:-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
    <button class="icon-btn" data-move="${key}:${i}:1" aria-label="Move down" ${i === len - 1 ? 'disabled' : ''}>↓</button>
    <button class="icon-btn danger" data-del="${key}:${i}" aria-label="Remove">✕</button>`;
}

function panelTemplate(): string {
  const tpls: Array<{ id: TemplateId; name: string; desc: string }> = [
    { id: 'classic', name: 'Classic', desc: 'Helvetica under a firm rule, the shape most recruiters expect.' },
    { id: 'editorial', name: 'Editorial', desc: 'Plex Serif with an oxblood accent, it reads like a printed book.' },
    { id: 'signal', name: 'Signal', desc: 'A large name, orange headings, and the employer named first.' },
    { id: 'mono', name: 'Mono', desc: 'Plex Mono for the data lines, Plex Sans for the prose, for engineers.' },
    { id: 'portrait', name: 'Portrait', desc: 'A centred serif header built around a photo.' },
    { id: 'open', name: 'Open', desc: 'For a first job: education and projects come before experience.' },
    { id: 'compact', name: 'Ledger', desc: 'Dates in their own column, a rule above each section, for a long career.' },
  ];
  const mini = renderSheet(data);
  const b = data.basics;
  return `
    <div class="p-5">
      <p class="text-[13.5px] text-ink-2 mb-4">Seven one column layouts that differ in voice, never in structure, so each one reads the same to the software.</p>
      <div class="mb-5 grid grid-cols-2 gap-2.5">
        ${tpls.map((t) => `
          <button class="tpl" data-tpl="${t.id}" aria-pressed="${data.settings.template === t.id}">
            <span class="tpl-thumb" aria-hidden="true"><article class="sheet" data-tpl="${t.id}">${mini}</article></span>
            <span class="block font-display text-[12.5px] font-semibold leading-tight">${t.name}</span>
            <span class="block text-[11.5px] leading-snug text-ink-3">${t.desc}</span>
          </button>`).join('')}
      </div>

      <div class="border-t border-rule pt-4">
        <h3 class="mb-1 font-display text-[15px] font-bold">Photo</h3>
        <p class="mb-3 text-[13.5px] text-ink-2">Normal in France, Germany, Switzerland and Spain. Usually left off in the UK, Ireland and the US.</p>
        <label class="mb-3 flex cursor-pointer items-center gap-2.5 text-[14px]">
          <input type="checkbox" data-bind="settings.showPhoto" ${data.settings.showPhoto ? 'checked' : ''} class="h-4 w-4 accent-ink">
          Show a photo on the resume
        </label>
        ${data.settings.showPhoto ? `
          <div class="flex items-center gap-3">
            ${b.photo ? `<img src="${b.photo}" alt="" class="h-16 w-[52px] rounded object-cover border border-rule">` : '<div class="grid h-16 w-[52px] place-items-center rounded border border-dashed border-edge text-[11px] text-ink-3">none</div>'}
            <button class="btn btn-ghost btn-sm" data-action="pick-photo">${b.photo ? 'Replace' : 'Choose image'}</button>
            ${b.photo ? '<button class="btn btn-quiet" data-action="drop-photo">Remove</button>' : ''}
            <input type="file" accept="image/*" class="hidden" data-file="photo">
          </div>
          <p class="mt-2 text-[12.5px] text-ink-3">Resized to 400px and kept in this tab. It travels inside your JSON export.</p>` : ''}
      </div>
    </div>`;
}

function panelPosting(): string {
  const a = lastAudit;
  return `
    <div class="p-5">
      <p class="text-[13.5px] text-ink-2 mb-4">Paste the posting and its title. The checker compares the two titles, lists the terms it scores and marks the ones your resume already contains.</p>
      <div class="field">
        <label for="f-post-title">Job title</label>
        <input id="f-post-title" type="text" data-role="posting-title" value="${esc(postingTitle)}" placeholder="Senior Backend Engineer, as the posting writes it" autocomplete="off">
      </div>
      <div class="field">
        <label for="f-post">Job description</label>
        <textarea id="f-post" rows="7" data-role="posting" placeholder="Paste the whole posting, requirements included.">${esc(posting)}</textarea>
      </div>
      <button class="btn btn-ghost w-full" data-action="run-audit">Check my resume against it</button>
      ${a ? renderAudit(a) : `<p class="mt-4 text-[13px] text-ink-3">Nothing is sent anywhere. The comparison runs in this tab.</p>`}
    </div>`;
}

function renderAudit(a: Audit): string {
  const req = a.keywords.filter((k) => k.required);
  const pref = a.keywords.filter((k) => !k.required);
  const chips = (list: typeof req) =>
    list.length
      ? `<div class="flex flex-wrap gap-1.5">${list.map((k) => k.found
          ? `<span class="chip chip-hit">${esc(k.term)}</span>`
          : `<button class="chip chip-miss" data-kw="${esc(k.term)}" title="Add to your skills, only if it is true of you">${esc(k.term)}</button>`).join('')}</div>`
      : '<p class="text-[13px] text-ink-3">Nothing in this group was detected in the posting.</p>';

  const t = a.title;
  const titleBlock = !t ? '' : t.exact
    ? `<p class="mb-4 text-[13.5px] text-ink-2"><b class="text-ink">Title.</b> Your resume already carries "${esc(t.wanted)}", and the title is the first field the software scores.</p>`
    : `<div class="notice"><strong>The title does not match</strong>The posting is for "${esc(t.wanted)}" and that phrase is not in your resume${t.wordsHit ? `, though ${t.wordsHit} of its ${t.words} words are` : ''}. If that is honestly the role you do, take it as your job title, because the title is the first field the software scores.<div class="mt-2"><button class="btn btn-ghost btn-sm" data-action="use-title">Use it as my job title</button></div></div>`;

  return `
    <div class="mt-5 border-t border-rule pt-4">
      ${titleBlock}
      <div class="flex items-baseline gap-2.5">
        <b class="font-display text-[34px] font-bold leading-none tracking-[-0.03em]">${a.requiredPct}%</b>
        <span class="text-[13.5px] text-ink-2">of the ${a.requiredTotal} required terms, ${a.requiredHit} matched</span>
      </div>
      <div class="my-2.5 mb-4 h-1.5 overflow-hidden rounded-full bg-rule">
        <i class="block h-full rounded-full bg-match transition-[width] duration-300" style="width:${a.requiredPct}%"></i>
      </div>
      ${a.requiredPct < 80 ? `<div class="notice"><strong>Below the usual 80% mark</strong>Place the missing terms where they are honestly true, in your summary, your skills or a real bullet. A term you cannot place honestly stays missing, and that is a genuine gap rather than a formatting problem.</div>` : ''}
      <div class="mb-4"><h3 class="mb-2 font-display text-[12.5px] font-semibold uppercase tracking-wide text-ink-2">Required</h3>${chips(req)}</div>
      <div class="mb-2"><h3 class="mb-2 font-display text-[12.5px] font-semibold uppercase tracking-wide text-ink-2">Preferred (${a.preferredHit}/${a.preferredTotal})</h3>${chips(pref)}</div>
      <p class="text-[12.5px] text-ink-3">Click a missing term to put it in, and only do that when it is genuinely true of you, because it will be the first thing an interviewer asks about.</p>
      ${tailorLog
        ? `<div class="notice mt-4"><strong>Tailored to this posting</strong>${esc(describe(tailorLog))}${
            tailorLog.added.length ? ' Read them once and delete any that is not true of you, because it will be the first thing an interviewer asks about.' : ''
          }${tailorLog.skipped.length ? ` ${esc(describeSkipped(tailorLog))}` : ''}<div class="mt-2"><button class="btn btn-ghost btn-sm" data-action="undo-tailor">Undo</button></div></div>`
        : `<button class="btn btn-primary mt-4 w-full" data-action="tailor">Tailor my resume to this posting</button>
           <p class="mt-2 text-[12.5px] text-ink-3">It takes the posting's job title as yours, puts the terms it scores into your skills and moves them to the front. A degree, a school, an employer or a number of years is never written for you, so anything of that kind stays missing. One click undoes it.</p>`}
    </div>`;
}

function panelExport(): string {
  return `
    <div class="p-5">
      <p class="text-[13.5px] text-ink-2 mb-4">The PDF for this application, and the JSON so the next one takes a minute.</p>
      <button class="btn btn-ghost mb-2.5 w-full" data-action="print">Download PDF</button>
      <button class="btn btn-ghost mb-4 w-full" data-action="export-json">Export JSON</button>
      <div class="notice">
        <strong>In the print dialog</strong>
        Choose "Save as PDF", set margins to none and turn off headers and footers. That keeps a real
        text layer in the file, which is the layer every parser reads.
      </div>
      <div class="notice">
        <strong>Name the file plainly</strong>
        FirstnameLastname_Resume.pdf. Some parsers choke on spaces, brackets and accents.
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ render */

function render() {
  const panels = $('#panels');
  if (panels) {
    panels.innerHTML =
      step === 'details' ? panelDetails()
      : step === 'template' ? panelTemplate()
      : step === 'posting' ? panelPosting()
      : panelExport();
  }

  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((el) => {
    const id = el.dataset.step as StepId;
    const done = STEPS.indexOf(id) < STEPS.indexOf(step);
    el.classList.toggle('done', done);
    if (id === step) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
  });

  const prev = $<HTMLButtonElement>('[data-nav="prev"]');
  const next = $<HTMLButtonElement>('[data-nav="next"]');
  if (prev) prev.hidden = step === 'details';
  const note = $('[data-role="demo-note"]');
  if (note) note.hidden = !demo;
  const ws = $('#workspace');
  if (ws) ws.hidden = !started;
  const shot = $('[data-role="shot"]');
  if (shot) shot.hidden = started;
  if (next) { next.hidden = step === 'export'; next.textContent = 'Continue'; }

  renderPreview();
  save();
}

function renderPreview() {
  const sheet = $('#sheet');
  if (!sheet) return;
  sheet.setAttribute('data-tpl', data.settings.template);
  sheet.innerHTML = renderSheet(data);
  const parser = $('#parser');
  if (parser) parser.textContent = renderParserText(sheet) || 'Your resume is empty, so a parser would read nothing.';
  const scale = $('#scale');
  if (scale) { scale.style.transform = `scale(${zoom})`; scale.style.height = `${Math.round(297 * 3.78 * zoom)}px`; scale.style.width = `${Math.round(210 * 3.78 * zoom)}px`; }
  const z = $('#zoomval');
  if (z) z.textContent = `${Math.round(zoom * 100)}%`;
}

/* ------------------------------------------------------------------ edits */

function setPath(path: string, value: string | boolean) {
  const parts = path.split('.');
  let node: Record<string, unknown> = data as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] as Record<string, unknown>;
  const last = parts[parts.length - 1];
  node[last] = last === 'bullets' && typeof value === 'string' ? value.split('\n').map((l) => l.trim()).filter(Boolean) : value;
}

const BLANKS: Record<string, () => unknown> = {
  skills: () => ({ label: '', items: '' }),
  experience: () => ({ title: '', org: '', dates: '', bullets: [], env: '' }),
  projects: () => ({ name: '', meta: '', subtitle: '', bullets: [], env: '' }),
  education: () => ({ degree: '', school: '', dates: '', detail: '' }),
};
const listOf = (key: string) => (data as unknown as Record<string, unknown[]>)[key];

async function readPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const w = 400;
  const h = Math.round((bitmap.height / bitmap.width) * w);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function print() {
  const root = $('#print-root');
  const sheet = $('#sheet');
  if (!root || !sheet) return;
  root.innerHTML = `<article class="sheet" data-tpl="${data.settings.template}">${sheet.innerHTML}</article>`;
  window.print();
}

function goto(id: StepId) { step = id; started = true; render(); $('#workspace')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }

/* ------------------------------------------------------------------ wiring */

function bootstrap() {
  restore();
  render();

  document.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement | HTMLTextAreaElement;
    if (el.dataset.role === 'posting') {
      posting = el.value;
      if (!postingTitle.trim()) {
        const guess = guessTitle(posting);
        if (guess) { postingTitle = guess; const f = $<HTMLInputElement>('#f-post-title'); if (f) f.value = guess; }
      }
      save(); return;
    }
    if (el.dataset.role === 'posting-title') { postingTitle = el.value; save(); return; }
    const path = el.dataset.bind;
    if (!path) return;

    if (path === 'links') {
      data.basics.links = el.value.split(',').map((s) => s.trim()).filter(Boolean)
        .map((u) => ({ label: u.replace(/^https?:\/\//, ''), url: u.startsWith('http') ? u : `https://${u}` }));
    } else if (el.type === 'checkbox') {
      setPath(path, (el as HTMLInputElement).checked);
      if (path === 'settings.showPhoto') { render(); return; }
    } else {
      setPath(path, el.value);
    }

    if (path === 'basics.summary') {
      const c = $('[data-role="sum-count"]');
      if (c) c.textContent = String(el.value.trim() ? el.value.trim().split(/\s+/).length : 0);
    }
    renderPreview();
    save();
  });

  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const hit = (sel: string) => t.closest<HTMLElement>(sel);

    const stepBtn = hit('[data-step]');
    if (stepBtn?.dataset.step) { goto(stepBtn.dataset.step as StepId); return; }

    const nav = hit('[data-nav]')?.dataset.nav;
    if (nav) {
      const i = STEPS.indexOf(step) + (nav === 'next' ? 1 : -1);
      if (i >= 0 && i < STEPS.length) goto(STEPS[i]);
      return;
    }


    // Only the two tab buttons switch the view. The body carries data-view as well,
    // so a bare [data-view] match would swallow every click on the page after the first switch.
    const view = hit('button[role="tab"][data-view]')?.dataset.view;
    if (view) {
      document.body.dataset.view = view;
      document.querySelectorAll('button[role="tab"][data-view]').forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.view === view)));
      return;
    }

    const zoomDir = hit('[data-zoom]')?.dataset.zoom;
    if (zoomDir) { zoom = Math.min(1.2, Math.max(0.3, zoom + Number(zoomDir) * 0.1)); renderPreview(); return; }

    const tpl = hit('[data-tpl]')?.dataset.tpl;
    if (tpl) { data.settings.template = tpl as TemplateId; render(); return; }

    const add = hit('[data-add]')?.dataset.add;
    if (add && BLANKS[add]) { listOf(add).push(BLANKS[add]()); render(); return; }

    const del = hit('[data-del]')?.dataset.del;
    if (del) { const [k, i] = del.split(':'); listOf(k).splice(Number(i), 1); render(); return; }

    const move = hit('[data-move]')?.dataset.move;
    if (move) {
      const [k, i, d] = move.split(':');
      const list = listOf(k);
      const from = Number(i); const to = from + Number(d);
      if (to >= 0 && to < list.length) { const [item] = list.splice(from, 1); list.splice(to, 0, item); render(); }
      return;
    }

    const kw = hit('[data-kw]')?.dataset.kw;
    if (kw) {
      let row = data.skills.find((s) => /^(added for this role|skills)$/i.test(s.label));
      if (!row) { row = { label: 'Added for this role', items: '' }; data.skills.push(row); }
      const items = row.items.split(',').map((s) => s.trim()).filter(Boolean);
      if (!items.some((s) => s.toLowerCase() === kw.toLowerCase())) items.push(kw);
      row.items = items.join(', ');
      lastAudit = audit(posting, renderParserText($('#sheet') as HTMLElement), cleanTitle(postingTitle));
      render();
      return;
    }

    const action = hit('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'blank') { data = emptyResume(); demo = false; goto('details'); }
    if (action === 'sample') { data = DEMO; demo = true; goto('details'); }
    if (action === 'pick-pdf') $<HTMLInputElement>('[data-file="pdf"]')?.click();
    if (action === 'import-json') $<HTMLInputElement>('[data-file="json"]')?.click();
    if (action === 'pick-photo') $<HTMLInputElement>('[data-file="photo"]')?.click();
    if (action === 'drop-photo') { data.basics.photo = null; render(); }
    if (action === 'print') print();
    if (action === 'export-json') {
      const stem = (data.basics.name || 'resume').replace(/[^A-Za-z0-9]+/g, '') || 'resume';
      download(`${stem}_resume.json`, JSON.stringify(data, null, 2), 'application/json');
    }
    if (action === 'use-title') {
      const wanted = lastAudit?.title?.wanted ?? cleanTitle(postingTitle);
      if (!wanted) return;
      data.basics.title = wanted;
      renderPreview();
      const sheet = $('#sheet');
      if (sheet && posting.trim()) lastAudit = audit(posting, renderParserText(sheet), cleanTitle(postingTitle));
      save(); render(); return;
    }
    if (action === 'run-audit') {
      const sheet = $('#sheet');
      if (!sheet || !posting.trim()) return;
      lastAudit = audit(posting, renderParserText(sheet), cleanTitle(postingTitle));
      render();
    }
    if (action === 'tailor') {
      const sheet = $('#sheet');
      if (!sheet || !lastAudit) return;
      beforeTailor = beforeTailor ?? JSON.stringify(data);
      tailorLog = tailor(data, lastAudit);
      renderPreview();
      lastAudit = audit(posting, renderParserText(sheet), cleanTitle(postingTitle));
      save(); render(); return;
    }
    if (action === 'undo-tailor') {
      if (!beforeTailor) return;
      data = normalise(JSON.parse(beforeTailor));
      beforeTailor = null; tailorLog = null;
      renderPreview();
      const sheet = $('#sheet');
      if (sheet && posting.trim()) lastAudit = audit(posting, renderParserText(sheet), cleanTitle(postingTitle));
      save(); render(); return;
    }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement;
    const kind = el.dataset.file;
    const file = el.files?.[0];
    if (!kind || !file) return;

    if (kind === 'pdf') void loadPdf(file);
    if (kind === 'json') {
      void file.text().then((txt) => {
        try { data = normalise(JSON.parse(txt)); demo = false; goto('details'); }
        catch { status('That file is not a resume export from here.'); }
      });
    }
    if (kind === 'photo') void readPhoto(file).then((src) => { data.basics.photo = src; render(); });
    el.value = '';
  });

  ['dragover', 'drop'].forEach((type) => {
    document.addEventListener(type, (ev) => {
      const zone = (ev.target as HTMLElement).closest('[data-drop="pdf"]');
      if (!zone) return;
      ev.preventDefault();
      zone.classList.toggle('over', type === 'dragover');
      if (type === 'drop') {
        const file = (ev as DragEvent).dataTransfer?.files?.[0];
        if (file?.type === 'application/pdf') void loadPdf(file);
      }
    });
  });
}

function status(msg: string) {
  const el = $('[data-role="pdf-status"]');
  if (el) el.textContent = msg;
}

async function loadPdf(file: File) {
  status('Reading the file in your browser, one moment.');
  try {
    const { extractPdfText, textToResume } = await import('./parse');
    const text = await extractPdfText(file);
    if (text.trim().length < 60) {
      status('That PDF has no text layer, so it is an image. An employer\'s parser would read nothing from it either.');
      return;
    }
    data = textToResume(text);
    demo = false;
    status('Read in your browser, and every field below came from that file.');
    goto('details');
  } catch (err) {
    status('That file could not be read. Try exporting it again as a PDF, or start blank.');
    if (import.meta.env.DEV) throw err;
    window.dispatchEvent(new CustomEvent('resume-parse-error', { detail: String(err) }));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
else bootstrap();
