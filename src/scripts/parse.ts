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

/** Marks the line set in the largest type on the first page, which is the name on almost every resume. */
export const NAME = '\u0003';

type Item = { str: string; x: number; y: number; w: number; size: number };

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // In pdf.js 6 the loading task owns destroy(), not the document proxy.
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  let biggest = 0;

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const pageW = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    const items: Item[] = (content.items as any[])
      .filter((it) => typeof it.str === 'string' && it.str.trim())
      .map((it) => ({
        str: it.str as string,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
        w: typeof it.width === 'number' ? it.width : 0,
        size: Math.max(Math.abs(it.transform[0] as number), Math.abs(it.transform[3] as number)) || 10,
      }));
    if (n === 1) biggest = Math.max(0, ...items.filter((it) => it.str.trim().length > 1).map((it) => it.size));

    // A sidebar is a second column. Reading the page top to bottom in one pass would
    // interleave the two, so the columns are found first and read one after the other,
    // the one holding the name first. That is what a careful reader does with the page.
    const columns = splitColumns(items, pageW);
    const named = columns.findIndex((col) => col.some((it) => it.size >= biggest - 0.5 && n === 1));
    if (named > 0) columns.unshift(...columns.splice(named, 1));

    const text: string[] = [];
    for (const col of columns) {
      const lines = toLines(col);
      const ends = lines.map((ln) => Math.max(...ln.map((it) => it.x + it.w)));
      const rightEdge = Math.max(...ends, 0) * 0.94;
      lines.forEach((ln, i) => {
        let out = '';
        let lastEnd: number | null = null;
        for (const it of ln) {
          if (lastEnd !== null) {
            const gap = it.x - lastEnd;
            // Some producers report item widths accurately and some do not. Where they do,
            // a wide gap is a right aligned column and marking it makes the split exact.
            if (gap > 14) out += GAP;
            else if (gap > 1 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' ';
          }
          out += it.str;
          lastEnd = it.x + it.w;
        }
        out = out.trim();
        if (!out) return;
        const size = Math.max(...ln.map((it) => it.size));
        const isName = n === 1 && size >= biggest - 0.5 && out.length < 42 && !/\d/.test(out) && !EMAIL.test(out);
        // A line that reaches the right margin was cut by the margin, not by the writer.
        // FULL_WIDTH marks it so the wrap can be undone once the lines are back together.
        text.push((isName ? NAME : '') + out + (ends[i] >= rightEdge && ln.length > 0 ? FULL_WIDTH : ''));
      });
    }
    pages.push(text.join('\n'));
  }
  await task.destroy();
  return pages.join('\n\n');
}

/** Groups items into visual lines, top to bottom, left to right. */
function toLines(items: Item[]): Item[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const cur = lines[lines.length - 1];
    const ref = cur?.[0];
    if (ref && Math.abs(ref.y - it.y) <= Math.max(2.5, Math.min(ref.size, it.size) * 0.4)) cur.push(it);
    else lines.push([it]);
  }
  return lines.map((ln) => ln.sort((a, b) => a.x - b.x));
}

/**
 * Finds a vertical gutter no text crosses, with real content on both sides, and
 * splits the page there. A resume has at most two columns, so one gutter is enough.
 */
function splitColumns(items: Item[], pageW: number): Item[][] {
  if (items.length < 12) return [items];
  const bins = new Uint16Array(Math.ceil(pageW) + 1);
  for (const it of items) {
    const from = Math.max(0, Math.floor(it.x));
    const to = Math.min(bins.length - 1, Math.ceil(it.x + Math.max(it.w, it.size * 0.5)));
    for (let x = from; x <= to; x++) bins[x]++;
  }
  let best: { at: number; width: number } | null = null;
  let run = 0;
  for (let x = Math.floor(pageW * 0.2); x < pageW * 0.7; x++) {
    if (bins[x] === 0) run++;
    else {
      if (run >= 6 && (!best || run > best.width)) best = { at: x - run / 2, width: run };
      run = 0;
    }
  }
  if (!best) return [items];
  const left = items.filter((it) => it.x < best!.at);
  const right = items.filter((it) => it.x >= best!.at);
  const share = Math.min(left.length, right.length) / items.length;
  if (share < 0.12) return [items];
  return [left, right];
}

/* Section headings, English and French, as they are actually written on resumes. */
const HEADINGS: Array<[keyof SectionMap, RegExp]> = [
  ['summary', /^(professional\s+summary|summary|profile|about(\s+me)?|objective|profil|à\s+propos)\b/i],
  ['skills', /^(technical\s+skills|core\s+skills|professional\s+skills|soft\s+skills|key\s+skills|hard\s+skills|skills?|expertise|tools?|technologies|tech\s+stack|competenc|compétences|outils|logiciels)\b/i],
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
/** A heading is short, opens with a capital and never ends a sentence, so a wrapped word never passes for one. */
const looksLikeHeading = (line: string): boolean =>
  line.length < 46 && /^[A-ZÀ-Ý]/.test(line) && !/[.,;]$/.test(line) && HEADINGS.some(([, re]) => re.test(line));
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
    const isHeading = looksLikeHeading(bare);
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

const isPhoneLine = (l: string): boolean => !DATE_RANGE.test(l) && l.length < 40 && PHONE.test(l) && (l.match(/\d/g) || []).length >= 8 && (l.match(/[a-z]/gi) || []).length < 6;
const isLinkLine = (l: string): boolean => l.length < 70 && URL.test(l) && l.replace(URL, '').replace(/[|•·\s]/g, '').length < 12;

/** Turns extracted text into a resume the person then corrects. */
export function textToResume(text: string): Resume {
  const r = emptyResume();
  const lines = joinWrapped(text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean));


  const sections: SectionMap = { head: [], summary: [], skills: [], experience: [], projects: [], education: [], languages: [], certifications: [] };
  let current: keyof SectionMap = 'head';
  // Several skills blocks ("Professional skills", "Tools") each keep their own label.
  const skillGroups: Array<{ label: string; lines: string[] }> = [];
  const nameLine = lines.find((l) => l.startsWith(NAME))?.slice(1) ?? '';
  const titleLine = nameLine ? lines[lines.findIndex((l) => l.startsWith(NAME)) + 1] ?? '' : '';

  for (const raw of lines) {
    const line = raw.replace(NAME, '');
    if (!line) continue;
    if (nameLine && (line === nameLine || line === titleLine)) continue;
    // Contact lines belong to the head wherever the layout put them.
    if (line.length < 70 && (EMAIL.test(line) || isPhoneLine(line) || isLinkLine(line))) { sections.head.push(line); continue; }
    const heading = looksLikeHeading(line) ? HEADINGS.find(([, re]) => re.test(line)) : undefined;
    if (heading) {
      current = heading[0];
      if (current === 'skills') skillGroups.push({ label: /^skills?$/i.test(line) ? '' : line.replace(/\s*:\s*$/, ''), lines: [] });
      continue;
    }
    if (current === 'skills' && skillGroups.length) skillGroups[skillGroups.length - 1].lines.push(line);
    sections[current].push(line);
  }

  // ---- contact block, taken from the whole document because it can sit anywhere
  const all = lines.join('\n');
  r.basics.email = all.match(EMAIL)?.[0] ?? '';

  // A contact line is usually one row of fragments split by pipes or bullets, so the
  // phone and the location sit beside the email rather than on lines of their own.
  // On a two column resume they can sit anywhere, so every short line is a candidate.
  const fragments = lines
    .flatMap((l) => l.replace(NAME, '').split(/\s*[|•·]\s*|\s{3,}/))
    .map((f) => f.trim())
    .filter(Boolean);

  const phoneFrag = fragments.find((f) => !EMAIL.test(f) && !DATE_RANGE.test(f) && f.length < 40 && PHONE.test(f) && (f.match(/\d/g) || []).length >= 8);
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

  // ---- name and title: the line set in the largest type, then the line under it;
  // failing that, the first plausible name line in the head of the document.
  if (nameLine) {
    r.basics.name = nameLine.replace(/\s+/g, ' ').trim();
    if (titleLine && titleLine.length < 64 && !EMAIL.test(titleLine) && !/\d{4}/.test(titleLine) && !HEADINGS.some(([, re]) => re.test(titleLine))) r.basics.title = titleLine;
  } else {
    const guess = sections.head.find(
      (l) => /^[A-ZÀ-Ý][\w'’.-]+(\s+[A-ZÀ-Ý][\w'’.-]+){1,3}$/.test(l) && !EMAIL.test(l) && !/\d/.test(l) && l.length < 42
    );
    if (guess) {
      r.basics.name = guess;
      const after = sections.head[sections.head.indexOf(guess) + 1];
      if (after && after.length < 64 && !EMAIL.test(after) && !/\d{4}/.test(after)) r.basics.title = after;
    }
  }
  const PLACE = /\b(remote|hybrid|onsite|france|switzerland|belgium|germany|spain|italy|portugal|netherlands|ireland|poland|paris|lyon|marseille|london|berlin|munich|amsterdam|madrid|barcelona|lisbon|dublin|zurich|geneva|lausanne|brussels|milan|warsaw|suisse|belgique|allemagne|espagne|cet|cest|gmt|utc)\b/i;
  // The location sits with the contact details: in the head, or on the lines around the email and phone.
  const contactAt = lines.findIndex((l) => EMAIL.test(l) || isPhoneLine(l));
  const near = [...sections.head, ...(contactAt >= 0 ? lines.slice(Math.max(0, contactAt - 3), contactAt + 4) : [])]
    .flatMap((l) => l.replace(NAME, '').split(/\s*[|•·]\s*|\s{3,}/)).map((f) => f.trim()).filter(Boolean);
  const loc = near.find((f) => PLACE.test(f) && f.length < 48 && !EMAIL.test(f) && !DATE_RANGE.test(f) && !/\b(SA|SAS|SARL|Ltd|Inc|GmbH|AG|LLC)\b/.test(f) && f !== r.basics.title && f !== r.basics.name);
  if (loc) r.basics.location = loc;

  // ---- summary
  r.basics.summary = sections.summary.join(' ').replace(BULLET, '').trim();

  // ---- skills: one row per block the resume had, keeping any "Label: a, b, c" shape
  const groups = skillGroups.length ? skillGroups : [{ label: '', lines: sections.skills }];
  r.skills = groups.flatMap((g): SkillRow[] => {
    const rows = g.lines
      .map((l): SkillRow => {
        const m = l.match(/^([A-Za-zÀ-ÿ&/ ]{2,28}):\s*(.+)$/);
        return m ? { label: m[1].trim(), items: m[2].trim() } : { label: '', items: l.replace(BULLET, '').trim() };
      })
      .filter((row) => row.items.length > 1);
    if (rows.length > 1 && rows.every((row) => !row.label) && rows.every((row) => row.items.split(',').length < 3)) {
      return [{ label: g.label || 'Skills', items: rows.map((row) => row.items).join(', ') }];
    }
    return rows.map((row) => (row.label ? row : { label: g.label, items: row.items }));
  });

  r.experience = blockToRoles(sections.experience);
  r.projects = blockToRoles(sections.projects).map((e) => ({ name: e.title, meta: e.dates, subtitle: e.org, bullets: e.bullets, env: e.env }));
  r.education = blockToRoles(sections.education).map((e) => ({ degree: e.title, school: e.org, dates: e.dates, detail: e.bullets.join(' ') }));
  r.languages = sections.languages.join(', ').replace(/\s*,\s*/g, ', ').trim();

  return stripMarkers(r);
}

/** The layout markers are internal, so nothing carrying them ever reaches a form field. */
function stripMarkers<T>(value: T): T {
  const MARKERS = new RegExp(`[${FULL_WIDTH}${GAP}${NAME}]`, 'g');
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
  for (const role of roles) {
    role.dates = role.dates.replace(/\s*([-–—]|to|à)\s*/i, ' - ').replace(/\s+/g, ' ').trim();
    if (!role.org) {
      const m = role.title.match(/^(.{2,60}?)\s+(?:-|–|—|\||at|chez|@)\s+(.{2,60})$/i);
      if (m) { role.title = m[1].trim(); role.org = m[2].trim(); }
    }
  }
  return roles.filter((r) => r.title || r.org || r.bullets.length);
}
