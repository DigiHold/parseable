/**
 * Reads an existing resume in the browser and sorts it into fields.
 *
 * The file never leaves the tab: pdf.js runs locally and the extracted text is
 * held in memory. Extraction is never perfect on a design heavy resume, which
 * is exactly why every field lands in a form the person corrects afterwards.
 */
import type { Resume, Role, SkillRow } from './types';
import { emptyResume } from './types';

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // In pdf.js 6 the loading task owns destroy(), not the document proxy.
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let line = '';
    let lastY: number | null = null;
    const lines: string[] = [];

    let lastEndX: number | null = null;
    for (const raw of content.items as any[]) {
      if (typeof raw.str !== 'string') continue;
      const y = Math.round(raw.transform[5]);
      const x = raw.transform[4] as number;

      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = '';
        lastEndX = null;
      }
      // Runs carry no spaces of their own, so a horizontal gap is the only signal.
      if (lastEndX !== null && x - lastEndX > 1 && !/\s$/.test(line) && !/^\s/.test(raw.str)) line += ' ';
      line += raw.str;

      lastEndX = x + (typeof raw.width === 'number' ? raw.width : 0);
      if (raw.hasEOL) { lines.push(line.trim()); line = ''; lastEndX = null; }
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.filter(Boolean).join('\n'));
  }
  await task.destroy();
  return pages.join('\n\n');
}

/* Section headings, English and French, as they are actually written on resumes. */
const HEADINGS: Array<[keyof SectionMap, RegExp]> = [
  ['summary', /^(professional\s+summary|summary|profile|about(\s+me)?|objective|profil|à\s+propos)\b/i],
  ['skills', /^(technical\s+skills|core\s+skills|skills?|technologies|tech\s+stack|competenc|compétences)\b/i],
  ['experience', /^(work\s+experience|professional\s+experience|experience|employment|career|expérience)\b/i],
  ['projects', /^(selected\s+projects|projects?|portfolio|projets?|réalisations)\b/i],
  ['education', /^(education|academic|qualifications|formation|études)\b/i],
  ['languages', /^(languages?|langues?)\b/i],
  ['certifications', /^(certifications?|licenses?|courses)\b/i],
];
type SectionMap = Record<'summary' | 'skills' | 'experience' | 'projects' | 'education' | 'languages' | 'certifications' | 'head', string[]>;

const DATE_RANGE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)[a-zé.]*\s*)?(19|20)\d{2}\s*(?:[-–—]|to|à|jusqu|until)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-zé.]*\s*)?((19|20)\d{2}|present|current|today|now|aujourd|présent|actuel)/i;
const BULLET = /^\s*[•▪◦●·*\-–—]\s+/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const PHONE = /(\+\d{1,3}[\s.-]?)?(\(?\d{1,4}\)?[\s.-]?){2,6}\d{2,4}/;
const URL = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|net|org|io|dev|ai|co|me|fr|ch|app|xyz)(?:\/[\w./-]*)?)\b/i;

/** Turns extracted text into a resume the person then corrects. */
export function textToResume(text: string): Resume {
  const r = emptyResume();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());

  const sections: SectionMap = { head: [], summary: [], skills: [], experience: [], projects: [], education: [], languages: [], certifications: [] };
  let current: keyof SectionMap = 'head';

  for (const line of lines) {
    if (!line) continue;
    const heading = line.length < 46 && HEADINGS.find(([, re]) => re.test(line));
    if (heading) { current = heading[0]; continue; }
    sections[current].push(line);
  }

  // ---- contact block, taken from the whole document because it can sit anywhere
  const all = lines.join('\n');
  r.basics.email = all.match(EMAIL)?.[0] ?? '';

  // A contact line is usually one row of fragments split by pipes or bullets, so the
  // phone and the location sit beside the email rather than on lines of their own.
  const fragments = lines
    .slice(0, 14)
    .flatMap((l) => l.split(/\s*[|•·]\s*|\s{3,}/))
    .map((f) => f.trim())
    .filter(Boolean);

  const phoneFrag = fragments.find((f) => !EMAIL.test(f) && PHONE.test(f) && (f.match(/\d/g) || []).length >= 8);
  r.basics.phone = phoneFrag ? (phoneFrag.match(PHONE)?.[0].trim() ?? '') : '';

  const seen = new Set<string>();
  for (const l of sections.head.slice(0, 12)) {
    const u = l.match(URL)?.[0];
    if (u && !EMAIL.test(u) && !seen.has(u.toLowerCase())) { seen.add(u.toLowerCase()); r.basics.links.push({ label: u, url: u.startsWith('http') ? u : `https://${u}` }); }
  }

  // ---- name and title: the first plausible name line, then the line under it
  const nameLine = sections.head.find(
    (l) => /^[A-ZÀ-Ý][\w'’.-]+(\s+[A-ZÀ-Ý][\w'’.-]+){1,3}$/.test(l) && !EMAIL.test(l) && !/\d/.test(l) && l.length < 42
  );
  if (nameLine) {
    r.basics.name = nameLine;
    const after = sections.head[sections.head.indexOf(nameLine) + 1];
    if (after && after.length < 64 && !EMAIL.test(after) && !/\d{4}/.test(after)) r.basics.title = after;
  }
  const PLACE = /\b(remote|hybrid|onsite|france|switzerland|belgium|germany|spain|italy|portugal|netherlands|ireland|poland|paris|lyon|marseille|london|berlin|munich|amsterdam|madrid|barcelona|lisbon|dublin|zurich|geneva|lausanne|brussels|milan|warsaw|suisse|belgique|allemagne|espagne|cet|cest|gmt|utc)\b/i;
  const loc = fragments.find((f) => PLACE.test(f) && f.length < 60 && !EMAIL.test(f) && f !== r.basics.title);
  if (loc) r.basics.location = loc;

  // ---- summary
  r.basics.summary = sections.summary.join(' ').replace(BULLET, '').trim();

  // ---- skills, keeping any "Label: a, b, c" shape the original used
  r.skills = sections.skills
    .map((l): SkillRow => {
      const m = l.match(/^([A-Za-zÀ-ÿ&/ ]{2,28}):\s*(.+)$/);
      return m ? { label: m[1].trim(), items: m[2].trim() } : { label: '', items: l.replace(BULLET, '').trim() };
    })
    .filter((s) => s.items.length > 1);
  if (r.skills.length > 1 && r.skills.every((s) => !s.label) && r.skills.every((s) => s.items.split(',').length < 2)) {
    r.skills = [{ label: 'Skills', items: r.skills.map((s) => s.items).join(', ') }];
  }

  r.experience = blockToRoles(sections.experience);
  r.projects = blockToRoles(sections.projects).map((e) => ({ name: e.title, meta: e.dates, subtitle: e.org, bullets: e.bullets, env: e.env }));
  r.education = blockToRoles(sections.education).map((e) => ({ degree: e.title, school: e.org, dates: e.dates, detail: e.bullets.join(' ') }));
  r.languages = sections.languages.join(', ').replace(/\s*,\s*/g, ', ').trim();

  return r;
}

/** A line carrying a date range opens a new entry. Everything under it belongs to that entry. */
function blockToRoles(block: string[]): Role[] {
  const roles: Role[] = [];
  let cur: Role | null = null;

  for (const line of block) {
    // "Full Stack Developer      2023" is a role too, not only "2021 - 2024".
    const single = line.match(/^(?![•▪◦●·*\-–—\s]*[•▪◦●·*])(?=.{4,70}$).*?\s((?:19|20)\d{2})\s*$/);
    const dates = line.match(DATE_RANGE)?.[0] ?? (single ? single[1] : /^\s*((19|20)\d{2})\s*$/.test(line) ? line.trim() : '');
    const isBullet = BULLET.test(line);

    if (dates && !isBullet) {
      if (cur) roles.push(cur);
      const rest = line.replace(dates, '').replace(/[|·•,–—-]\s*$/, '').trim();
      cur = { title: rest, org: '', dates: dates.replace(/\s+/g, ' ').trim(), bullets: [], env: '' };
      continue;
    }
    if (!cur) { cur = { title: line, org: '', dates: '', bullets: [], env: '' }; continue; }

    if (isBullet) cur.bullets.push(line.replace(BULLET, '').trim());
    else if (!cur.title) cur.title = line;
    else if (!cur.org && line.length < 76) cur.org = line;
    else if (/^(environment|stack|tech|technologies|environnement)\s*:/i.test(line)) cur.env = line.replace(/^[^:]*:\s*/, '');
    else cur.bullets.push(line);
  }
  if (cur) roles.push(cur);
  return roles.filter((r) => r.title || r.org || r.bullets.length);
}
