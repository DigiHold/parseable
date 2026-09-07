/**
 * Writes the resume as a real PDF, in the browser, with a genuine text layer.
 *
 * The browser's own print dialog produced a good file but asked the person to
 * find "Save as PDF" and turn off headers, and most never did. This builds the
 * page itself with pdfmake, so one click saves the file, and every glyph stays
 * text a parser can read rather than a picture of text.
 *
 * The layout mirrors sheet.css template by template. Both files use points, so
 * the numbers below are the numbers on screen.
 */
import type { Resume, Role, TemplateId } from './types';

const MM = 2.834645669;
const PAGE_W = 595.28;

type FontName = 'Plex' | 'PlexSerif' | 'PlexMono';
type Ink = 'ink' | 'mut' | 'accent';

/** sheet.css writes its margins in px and its type in pt, so one conversion covers the file. */
const pt = (px: number) => px * 0.75;
/** pdfmake multiplies the font's own line height, and IBM Plex measures 1.3, so CSS 1.42 is 1.42/1.3 here. */
const NATURAL = 1.3;

interface Tpl {
  font: FontName;
  proseFont?: FontName;
  pad: [number, number];
  fs: number; lh: number;
  gaps: { head: number; headPad: number; name: number; role: number; h2Top: number; h2Bottom: number; item: number; org: number; para: number; skill: number };
  ink: string; mut: string; accent: string; rule: string;
  headRule: string | null;
  center?: boolean;
  name: { size: number; bold: boolean; upper?: boolean };
  role: { size: number; italic?: boolean; bold?: boolean; color: Ink };
  contact: { size: number; sep: string; sepColor: Ink | 'rule'; color: string };
  h2: { size: number; bold: boolean; upper: boolean; color: Ink; rule: 'below' | 'above' | 'none'; top: number; bottom: number };
  item: {
    size: number; bold: boolean; dates: 'right' | 'gutter'; datesItalic?: boolean; datesColor: Ink;
    orgItalic?: boolean; orgBold?: boolean; orgColor: Ink; employerFirst?: boolean; gutter?: number;
  };
  bullet: Ink;
  photo: 'right' | 'circle';
}

const SANS: FontName = 'Plex';
const TEMPLATES: Record<TemplateId, Tpl> = {
  classic: {
    font: SANS, pad: [14, 13], fs: 9.6, lh: 1.42,
    gaps: { head: pt(13), headPad: pt(7), name: pt(2), role: pt(6), h2Top: pt(15), h2Bottom: pt(7), item: pt(11), org: pt(4), para: pt(6), skill: pt(3.5) },
    ink: '#16130f', mut: '#5c564e', accent: '#16130f', rule: '#c9c4bc', headRule: '#6b6b6b',
    name: { size: 21, bold: true }, role: { size: 10.8, bold: true, color: 'mut' },
    contact: { size: 8.9, sep: '|', sepColor: 'accent', color: '#45403a' },
    h2: { size: 9.6, bold: true, upper: true, color: 'ink', rule: 'below', top: 15, bottom: 7 },
    item: { size: 10.3, bold: true, dates: 'right', datesColor: 'mut', orgItalic: true, orgColor: 'mut' },
    bullet: 'accent', photo: 'right',
  },
  editorial: {
    font: 'PlexSerif', pad: [17, 16], fs: 10, lh: 1.5,
    gaps: { head: pt(18), headPad: pt(11), name: pt(2), role: pt(6), h2Top: pt(20), h2Bottom: pt(6), item: pt(12), org: pt(4), para: pt(6), skill: pt(3.5) },
    ink: '#16130f', mut: '#6a6259', accent: '#7a2e2e', rule: '#e6e0d8', headRule: '#16130f',
    name: { size: 28, bold: true }, role: { size: 11.5, italic: true, color: 'accent' },
    contact: { size: 9, sep: '·', sepColor: 'accent', color: '#45403a' },
    h2: { size: 12.5, bold: true, upper: false, color: 'ink', rule: 'none', top: 20, bottom: 6 },
    item: { size: 10.6, bold: false, dates: 'right', datesColor: 'mut', orgItalic: true, orgColor: 'accent' },
    bullet: 'accent', photo: 'right',
  },
  signal: {
    font: SANS, pad: [16, 15], fs: 9.8, lh: 1.45,
    gaps: { head: pt(18), headPad: 0, name: pt(5), role: pt(8), h2Top: pt(18), h2Bottom: pt(6), item: pt(11), org: pt(4), para: pt(6), skill: pt(3.5) },
    ink: '#16130f', mut: '#5c5c5c', accent: '#b5451b', rule: '#ececec', headRule: null,
    name: { size: 28, bold: true }, role: { size: 12, bold: true, color: 'ink' },
    contact: { size: 8.9, sep: '|', sepColor: 'rule', color: '#5c5c5c' },
    h2: { size: 10, bold: true, upper: true, color: 'accent', rule: 'none', top: 18, bottom: 6 },
    item: { size: 10, bold: false, dates: 'right', datesColor: 'mut', orgBold: true, orgColor: 'ink', employerFirst: true },
    bullet: 'mut', photo: 'right',
  },
  mono: {
    font: 'PlexMono', proseFont: SANS, pad: [18, 16], fs: 8.9, lh: 1.5,
    gaps: { head: pt(16), headPad: 0, name: pt(2), role: pt(6), h2Top: pt(16), h2Bottom: pt(6), item: pt(11), org: pt(4), para: pt(6), skill: pt(3.5) },
    ink: '#16130f', mut: '#5f6672', accent: '#3a4a6b', rule: '#d9dce3', headRule: null,
    name: { size: 19, bold: true }, role: { size: 10.2, color: 'ink' },
    contact: { size: 7.9, sep: '|', sepColor: 'mut', color: '#5f6672' },
    h2: { size: 9.2, bold: true, upper: true, color: 'accent', rule: 'none', top: 16, bottom: 6 },
    item: { size: 9.4, bold: true, dates: 'right', datesColor: 'mut', orgColor: 'mut' },
    bullet: 'mut', photo: 'right',
  },
  portrait: {
    font: 'PlexSerif', pad: [17, 15], fs: 9.8, lh: 1.5, center: true,
    gaps: { head: pt(18), headPad: pt(14), name: pt(2), role: pt(6), h2Top: pt(18), h2Bottom: pt(6), item: pt(11), org: pt(4), para: pt(6), skill: pt(3.5) },
    ink: '#16130f', mut: '#6a6259', accent: '#7a2e2e', rule: '#e6e0d8', headRule: '#16130f',
    name: { size: 30, bold: true }, role: { size: 11, italic: true, color: 'accent' },
    contact: { size: 8.9, sep: '·', sepColor: 'accent', color: '#45403a' },
    h2: { size: 10, bold: true, upper: true, color: 'ink', rule: 'none', top: 18, bottom: 6 },
    item: { size: 10.3, bold: false, dates: 'right', datesItalic: true, datesColor: 'ink', orgItalic: true, orgColor: 'mut' },
    bullet: 'accent', photo: 'circle',
  },
  open: {
    font: SANS, pad: [17, 16], fs: 10, lh: 1.55,
    gaps: { head: pt(20), headPad: 0, name: pt(2), role: pt(6), h2Top: pt(20), h2Bottom: pt(7), item: pt(13), org: pt(4), para: pt(6), skill: pt(3.5) },
    ink: '#16130f', mut: '#5a615c', accent: '#1e5c45', rule: '#e4e6e3', headRule: null,
    name: { size: 26, bold: true }, role: { size: 11.4, color: 'mut' },
    contact: { size: 8.9, sep: '|', sepColor: 'rule', color: '#45403a' },
    h2: { size: 11.5, bold: true, upper: false, color: 'accent', rule: 'none', top: 20, bottom: 7 },
    item: { size: 10.3, bold: true, dates: 'right', datesColor: 'mut', orgColor: 'mut' },
    bullet: 'mut', photo: 'right',
  },
  compact: {
    font: SANS, pad: [13, 12], fs: 9.1, lh: 1.36,
    gaps: { head: pt(14), headPad: 0, name: pt(2), role: pt(6), h2Top: pt(12), h2Bottom: pt(5), item: pt(7), org: pt(2), para: pt(6), skill: pt(3.5) },
    ink: '#16130f', mut: '#55524d', accent: '#16130f', rule: '#8f8b85', headRule: null,
    name: { size: 17, bold: true }, role: { size: 9.6, color: 'ink' },
    contact: { size: 8.6, sep: '|', sepColor: 'accent', color: '#45403a' },
    h2: { size: 8.4, bold: true, upper: true, color: 'ink', rule: 'above', top: 12, bottom: 5 },
    item: { size: 9.6, bold: true, dates: 'gutter', gutter: 24 * MM, datesColor: 'ink', orgColor: 'mut' },
    bullet: 'mut', photo: 'right',
  },
};

const FILES: Record<FontName, Record<string, string>> = {
  Plex: {
    normal: 'IBMPlexSans-Regular.ttf', bold: 'IBMPlexSans-SemiBold.ttf',
    italics: 'IBMPlexSans-Italic.ttf', bolditalics: 'IBMPlexSans-SemiBoldItalic.ttf',
  },
  PlexSerif: {
    normal: 'IBMPlexSerif-Regular.ttf', bold: 'IBMPlexSerif-Bold.ttf',
    italics: 'IBMPlexSerif-Italic.ttf', bolditalics: 'IBMPlexSerif-BoldItalic.ttf',
  },
  PlexMono: {
    normal: 'IBMPlexMono-Regular.ttf', bold: 'IBMPlexMono-SemiBold.ttf',
    italics: 'IBMPlexMono-Italic.ttf', bolditalics: 'IBMPlexMono-SemiBoldItalic.ttf',
  },
};

const loaded = new Set<string>();

async function loadFamily(pdfMake: any, family: FontName): Promise<void> {
  if (loaded.has(family)) return;
  const files = Object.values(FILES[family]);
  await Promise.all(files.map(async (file) => {
    if (pdfMake.virtualfs.existsSync(file)) return;
    const res = await fetch(`/fonts/pdf/${file}`);
    if (!res.ok) throw new Error(`font ${file} ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    pdfMake.virtualfs.writeFileSync(file, btoa(bin), 'base64');
  }));
  loaded.add(family);
}

/**
 * Fits the photo to the frame the template gives it, cropped from the centre rather
 * than squashed, which is what object-fit: cover does on the sheet. A PDF has no
 * border radius either, so the round frame is cut here with the same pass.
 */
function fit(src: string, ratio: number, round: boolean, px = 360): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = px;
      const h = Math.round(px / ratio);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (!g) { resolve(src); return; }
      if (round) { g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); g.closePath(); g.clip(); }
      // the largest centred rectangle of the source that carries the frame's ratio
      const srcRatio = img.width / img.height;
      let sw = img.width;
      let sh = img.height;
      if (srcRatio > ratio) sw = img.height * ratio;
      else sh = img.width / ratio;
      g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

const has = (s: string) => s.trim().length > 0;

export async function downloadPdf(r: Resume): Promise<void> {
  const t = TEMPLATES[r.settings.template] ?? TEMPLATES.classic;
  const prose = t.proseFont ?? t.font;
  const width = PAGE_W - t.pad[0] * MM * 2;
  const colour = (k: Ink | 'rule'): string => (k === 'ink' ? t.ink : k === 'mut' ? t.mut : k === 'accent' ? t.accent : t.rule);

  const { default: pdfMake } = await import('pdfmake/build/pdfmake');
  await loadFamily(pdfMake, t.font);
  if (t.proseFont) await loadFamily(pdfMake, t.proseFont);
  pdfMake.setFonts(Object.fromEntries(([t.font, prose] as FontName[]).map((f) => [f, FILES[f]])));

  const lh = +(t.lh / NATURAL).toFixed(4);
  const line = (colr: string, top = 0, bottom = 0) => ({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.7, lineColor: colr }],
    margin: [0, top, 0, bottom],
  });

  const content: any[] = [];

  // ---- the head
  const b = r.basics;
  const contact = [b.email, b.phone, b.location, ...b.links.map((l) => l.label || l.url)].filter(has);
  const contactText: any[] = [];
  contact.forEach((x, i) => {
    if (i) contactText.push({ text: ` ${t.contact.sep} `, color: colour(t.contact.sepColor) });
    contactText.push({ text: x });
  });
  const headStack: any[] = [
    { text: t.name.upper ? (b.name || 'Your name').toUpperCase() : b.name || 'Your name', font: t.font, fontSize: t.name.size, bold: t.name.bold, color: t.ink, characterSpacing: -0.3, lineHeight: 1.08 / NATURAL, margin: [0, 0, 0, t.gaps.name] },
  ];
  if (has(b.title)) headStack.push({ text: b.title, font: t.font, fontSize: t.role.size, italics: t.role.italic, bold: t.role.bold, color: colour(t.role.color), lineHeight: 1.2 / NATURAL, margin: [0, 0, 0, t.gaps.role] });
  if (contactText.length) headStack.push({ text: contactText, font: prose, fontSize: t.contact.size, color: t.contact.color, lineHeight: 1.35 / NATURAL });
  if (t.center) headStack.forEach((x) => { x.alignment = 'center'; });

  const photo = r.settings.showPhoto && b.photo ? b.photo : '';
  if (photo && t.photo === 'circle') {
    content.push({ image: await fit(photo, 1, true), width: 30 * MM, height: 30 * MM, alignment: 'center', margin: [0, 0, 0, pt(10)] });
    content.push(...headStack);
  } else if (photo) {
    const w = 26 * MM;
    const h = 32 * MM;
    content.push({ columns: [{ stack: headStack, width: '*' }, { image: await fit(photo, w / h, false), width: w, height: h }], columnGap: pt(14) });
  } else {
    content.push(...headStack);
  }
  if (t.headRule) content.push(line(t.headRule, t.gaps.headPad, t.gaps.head));
  else content.push({ canvas: [], margin: [0, 0, 0, t.gaps.head] });

  // ---- sections
  let firstSection = true;
  const heading = (label: string) => {
    const out: any[] = [];
    const top = firstSection ? 0 : t.gaps.h2Top;
    firstSection = false;
    if (t.h2.rule === 'above') out.push(line(t.rule, top, pt(5)));
    out.push({
      text: t.h2.upper ? label.toUpperCase() : label,
      font: t.font, fontSize: t.h2.size, bold: t.h2.bold, color: colour(t.h2.color), lineHeight: 1.2 / NATURAL,
      margin: [0, t.h2.rule === 'above' ? 0 : top, 0, t.h2.rule === 'below' ? pt(3) : t.gaps.h2Bottom],
      alignment: 'left',
    });
    if (t.h2.rule === 'below') out.push(line(t.rule, 0, t.gaps.h2Bottom));
    return out;
  };

  const indent = t.item.dates === 'gutter' ? (t.item.gutter ?? 0) : 0;

  const entry = (e: { title: string; org: string; dates: string; bullets: string[]; env: string }) => {
    const title = { text: e.title, font: t.font, fontSize: t.item.size, bold: t.item.bold, color: t.ink, lineHeight: 1.25 / NATURAL };
    const org = { text: e.org, font: prose, fontSize: t.fs, italics: t.item.orgItalic, bold: t.item.orgBold, color: colour(t.item.orgColor), lineHeight: 1.3 / NATURAL, margin: [0, 0, 0, t.gaps.org] };
    const dates = { text: e.dates, font: prose, fontSize: t.fs - 0.8, italics: t.item.datesItalic, color: colour(t.item.datesColor), alignment: t.item.dates === 'right' ? 'right' : 'left' };
    const head = t.item.employerFirst && has(e.org)
      ? [{ ...org, bold: true, italics: false, fontSize: t.item.size, color: t.ink, margin: [0, 0, 0, 0] }, { ...title, bold: false }]
      : [title, ...(has(e.org) ? [org] : [])];

    const body: any[] = [];
    if (e.bullets.filter(has).length) {
      body.push({ ul: e.bullets.filter(has).map((x) => ({ text: x, font: prose, fontSize: t.fs, color: t.ink, lineHeight: lh, margin: [0, 0, 0, pt(2.5)] })), markerColor: colour(t.bullet), margin: [0, 0, 0, 0] });
    }
    if (has(e.env)) body.push({ text: [{ text: 'Environment: ', bold: true }, { text: e.env }], font: prose, fontSize: t.fs - 0.7, color: t.mut, lineHeight: lh, margin: [0, pt(3), 0, 0] });

    if (t.item.dates === 'gutter') {
      return { columns: [{ width: indent, text: e.dates, font: prose, fontSize: t.fs - 0.5, color: colour(t.item.datesColor), lineHeight: 1.25 / NATURAL }, { width: '*', stack: [...head, ...body] }], columnGap: 0, margin: [0, 0, 0, t.gaps.item], unbreakable: true };
    }
    return {
      stack: [
        { columns: [{ width: '*', stack: head.slice(0, 1) }, { width: 'auto', ...dates }], columnGap: 12 },
        ...head.slice(1), ...body,
      ],
      margin: [0, 0, 0, t.gaps.item], unbreakable: true,
    };
  };

  const block = (nodes: any[]) => (indent ? nodes.map((n) => ({ ...n, margin: [indent, ...(Array.isArray(n.margin) ? n.margin.slice(1) : [0, 0, 0])] })) : nodes);

  const part: Record<string, any[]> = {};
  if (has(b.summary)) part.summary = [...heading('Professional Summary'), ...block([{ text: b.summary, font: prose, fontSize: t.fs, color: t.ink, lineHeight: lh, margin: [0, 0, 0, t.gaps.para] }])];

  const skills = r.skills.filter((s) => has(s.items));
  if (skills.length) {
    part.skills = [...heading('Skills'), ...block(skills.map((s) => ({
      text: [...(has(s.label) ? [{ text: `${s.label}: `, bold: true }] : []), { text: s.items }],
      font: prose, fontSize: t.fs, color: t.ink, lineHeight: lh, margin: [0, 0, 0, t.gaps.skill],
    })))];
  }

  const roles = (list: Role[]) => list.map(entry);
  const exp = r.experience.filter((e) => has(e.title) || has(e.org));
  if (exp.length) part.experience = [...heading('Experience'), ...roles(exp)];

  const proj = r.projects.filter((p) => has(p.name));
  if (proj.length) part.projects = [...heading('Selected Projects'), ...proj.map((p) => entry({ title: p.name, org: p.subtitle, dates: p.meta, bullets: p.bullets, env: p.env }))];

  const edu = r.education.filter((e) => has(e.degree) || has(e.school));
  if (edu.length) part.education = [...heading('Education'), ...edu.map((e) => entry({ title: e.degree, org: e.school, dates: e.dates, bullets: has(e.detail) ? [e.detail] : [], env: '' }))];

  if (has(r.languages)) part.languages = [...heading('Languages'), ...block([{ text: r.languages, font: prose, fontSize: t.fs, color: t.ink, lineHeight: lh }])];

  // The order the sheet uses, so the file matches the preview line for line.
  const order = r.settings.template === 'open'
    ? ['summary', 'education', 'projects', 'skills', 'experience', 'languages']
    : ['summary', 'skills', 'experience', 'projects', 'education', 'languages'];
  for (const key of order) if (part[key]) content.push(...part[key]);

  const stem = `${(b.name || 'Resume').replace(/[^A-Za-z0-9]+/g, '')}_Resume.pdf`;
  const pad = t.pad[0] * MM;
  const doc = {
    info: { title: `${b.name || 'Resume'}, ${b.title || 'resume'}`, author: b.name || '' },
    pageSize: 'A4' as const,
    pageMargins: [pad, t.pad[1] * MM, pad, t.pad[1] * MM] as [number, number, number, number],
    defaultStyle: { font: prose, fontSize: t.fs, lineHeight: lh, color: t.ink },
    content,
  };
  await pdfMake.createPdf(doc).download(stem);
}
