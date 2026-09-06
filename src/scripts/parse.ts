/**
 * Reads an existing resume in the browser and sorts it into fields.
 *
 * The file never leaves the tab: pdf.js runs locally and the extracted text is
 * held in memory. Extraction is never perfect on a design heavy resume, which
 * is exactly why every field lands in a form the person corrects afterwards.
 */
import type { Resume, Role, SkillRow } from './types';
import { emptyResume } from './types';

/** Marks a line that ran into the right margin, so a wrap can be told from a real break. */
export const FULL_WIDTH = '\u0001';
/** Marks a wide horizontal gap, which is how a right aligned column reads in a text layer. */
export const GAP = '\u0002';

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
    const ends: number[] = [];

    let lastEndX: number | null = null;
    for (const raw of content.items as any[]) {
      if (typeof raw.str !== 'string') continue;
      const y = Math.round(raw.transform[5]);
      const x = raw.transform[4] as number;

      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        ends.push(lastEndX ?? 0);
        line = '';
        lastEndX = null;
      }
      // Runs carry no spaces of their own, so a horizontal gap is the only signal.
      if (lastEndX !== null) {
        const gap = x - lastEndX;
        // Some producers report item widths accurately and some do not. Where they do,
        // a wide gap is a right aligned column and marking it makes the split exact.
        if (gap > 14) line += GAP;
        else if (gap > 1 && !/\s$/.test(line) && !/^\s/.test(raw.str)) line += ' ';
      }
      line += raw.str;

      lastEndX = x + (typeof raw.width === 'number' ? raw.width : 0);
      if (raw.hasEOL) { lines.push(line.trim()); ends.push(lastEndX ?? 0); line = ''; lastEndX = null; }
      lastY = y;
    }
    if (line.trim()) { lines.push(line.trim()); ends.push(lastEndX ?? 0); }

    // A line that reaches the right margin was cut by the margin, not by the writer.
    // FULL_WIDTH marks it so the wrap can be undone once the lines are back together.
    const rightEdge = Math.max(...ends, 0) * 0.94;
    pages.push(
      lines
        .map((l, i) => (l && ends[i] >= rightEdge ? l + FULL_WIDTH : l))
        .filter((l) => l.replace(FULL_WIDTH, '').length > 0)
        .join('\n')
    );
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
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)[a-zé.]*\s*)?(19|20)\d{2}\s*(?:[-–—]|to|à|jusqu|until)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-zé.]*\s*)?((19|20)\d{2}|present|current|today|now|aujourd'hui|aujourd|présent|actuel)/i;
const BULLET = /^\s*[•▪◦●·*\-–—]\s+/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const PHONE = /(\+\d{1,3}[\s.-]?)?(\(?\d{1,4}\)?[\s.-]?){2,6}\d{2,4}/;
const URL = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|net|org|io|dev|ai|co|me|fr|ch|app|xyz)(?:\/[\w./-]*)?)\b/i;

/**
 * A PDF stores one visual line at a time, so a sentence that wraps arrives as
 * two or three lines. Left alone, every wrapped bullet becomes several bullets.
 * A line continues the one above it when it opens lowercase, or when the line
 * above ends on a comma or a word that cannot end a sentence.
 */
const OPEN_TAIL = /(,|\b(and|or|the|a|an|to|in|of|for|with|on|at|by|from|as|that|which|into|across|through|including|such as)\b)\s*$/i;

function joinWrapped(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw;
    const prev = out[out.length - 1];
    const bare = line.replace(FULL_WIDTH, '');
    const isHeading = bare.length < 46 && HEADINGS.some(([, re]) => re.test(bare));
    // "Backend: Node.js, ..." opens a new row even when the line above ran to the margin.
    const LABEL_ROW = /^[A-Za-zÀ-ÿ&/ ]{2,28}\s?:\s\S/;
    const starts =
      BULLET.test(bare) || isHeading || DATE_RANGE.test(bare) || EMAIL.test(bare) ||
      LABEL_ROW.test(bare) || bare.includes(GAP);
    // A role header reaches the right margin because its dates are set there, not
    // because it wrapped, so it must never swallow the company line beneath it.
    const prevBare = prev === undefined ? '' : prev.replace(FULL_WIDTH, '');
    const prevIsHeader =
      prev !== undefined && (prevBare.includes(GAP) || DATE_RANGE.test(prevBare) || /\s((?:19|20)\d{2})\s*$/.test(prevBare));
    // Reaching the right margin on a short line means something was aligned there,
    // a date or a link, not that the sentence ran out of room. Only a long line wraps.
    const wrapped = prev !== undefined && prev.endsWith(FULL_WIDTH) && !prevIsHeader && prevBare.length > 45;
    const continues =
      prev !== undefined &&
      !starts &&
      !prevIsHeader &&
      (wrapped || (prevBare.length > 45 && !/[.!?:]$/.test(prevBare) && (/^[a-z(]/.test(line) || OPEN_TAIL.test(prevBare))));
    if (continues) out[out.length - 1] = `${prev.replace(FULL_WIDTH, '')} ${line}`;
    else out.push(line);
  }
  return out.map((l) => l.replace(new RegExp(FULL_WIDTH, 'g'), '').trim());
}

/** Turns extracted text into a resume the person then corrects. */
export function textToResume(text: string): Resume {
  const r = emptyResume();
  const lines = joinWrapped(text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean));


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
  for (const raw of sections.head.slice(0, 12)) {
    // Strip addresses first, otherwise the domain inside an email reads as a link.
    const u = raw.replace(new RegExp(EMAIL.source, 'g'), ' ').match(URL)?.[0];
    if (u && !seen.has(u.toLowerCase())) {
      seen.add(u.toLowerCase());
      r.basics.links.push({ label: u, url: u.startsWith('http') ? u : `https://${u}` });
    }
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

  return stripMarkers(r);
}

/** The layout markers are internal, so nothing carrying them ever reaches a form field. */
function stripMarkers<T>(value: T): T {
  const MARKERS = new RegExp(`[${FULL_WIDTH}${GAP}]`, 'g');
  if (typeof value === 'string') return value.replace(MARKERS, ' ').replace(/\s+/g, ' ').trim() as unknown as T;
  if (Array.isArray(value)) return value.map(stripMarkers) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripMarkers(v);
    return out as T;
  }
  return value;
}

/** A line carrying a date range opens a new entry. Everything under it belongs to that entry. */
function blockToRoles(block: string[]): Role[] {
  const roles: Role[] = [];
  let cur: Role | null = null;
  // Bullet glyphs are drawn by CSS in many PDFs and never reach the text layer, so
  // "a plain line after bullets starts a new entry" is only safe where dates are
  // absent entirely. That is the projects block. Experience always has dates.
  const datelessBlock = !block.some((l) => DATE_RANGE.test(l) || /\s((?:19|20)\d{2})\s*$/.test(l));

  for (const line of block) {
    // A gap means a right aligned column, so the left is the entry and the right is
    // its dates or its link. That covers "Founder            2016 - 2019" and
    // "LinkedGrow                    linkedgrow.ai" with the same rule.
    const parts = line.split(GAP).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1 && !BULLET.test(line)) {
      if (cur) roles.push(cur);
      cur = { title: parts[0], org: '', dates: parts[parts.length - 1], bullets: [], env: '' };
      continue;
    }
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

    // Projects rarely carry dates, so the shape is the signal: a plain line
    // arriving after a run of bullets is the next project's name.
    if (datelessBlock && !isBullet && cur.bullets.length > 0 && line.length < 70 && !/^(environment|stack|tech|technologies|environnement)\s*:/i.test(line)) {
      roles.push(cur);
      cur = { title: line, org: '', dates: '', bullets: [], env: '' };
      continue;
    }

    if (isBullet) cur.bullets.push(line.replace(BULLET, '').trim());
    else if (!cur.title) cur.title = line;
    else if (!cur.org && line.length < 76) cur.org = line;
    else if (/^(environment|stack|tech|technologies|environnement)\s*:/i.test(line)) cur.env = line.replace(/^[^:]*:\s*/, '');
    else cur.bullets.push(line);
  }
  if (cur) roles.push(cur);
  return roles.filter((r) => r.title || r.org || r.bullets.length);
}
