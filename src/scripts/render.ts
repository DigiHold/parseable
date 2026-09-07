import type { Resume } from './types';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const has = (s: string) => s.trim().length > 0;

/** Renders the sheet. Section order is the order an ATS reads, so it is also the order that scores. */
export function renderSheet(r: Resume): string {
  const b = r.basics;
  const sep = r.settings.template === 'editorial' || r.settings.template === 'portrait' ? '\u00b7' : '|';
  const contact = [b.email, b.phone, b.location, ...b.links.map((l) => l.label || l.url)]
    .filter(has)
    .map((x) => `<span>${esc(x)}</span>`)
    .join(`<span class="sep">${sep}</span>`);

  const photo = r.settings.showPhoto && b.photo
    ? `<img class="s-photo" src="${b.photo}" alt="${esc(b.name)}">`
    : '';

  const out: string[] = [];
  out.push(`<header class="s-head"><div class="s-head-txt">
    <h1 class="s-name">${esc(b.name || 'Your name')}</h1>
    ${has(b.title) ? `<p class="s-role">${esc(b.title)}</p>` : ''}
    ${contact ? `<p class="s-contact">${contact}</p>` : ''}
  </div>${photo}</header>`);

  if (has(b.summary)) {
    out.push(`<section><h2>Professional Summary</h2><p class="s-summary">${esc(b.summary)}</p></section>`);
  }

  const skills = r.skills.filter((s) => has(s.items));
  if (skills.length) {
    out.push(`<section><h2>Skills</h2>${skills
      .map((s) => `<p class="s-skill">${has(s.label) ? `<b>${esc(s.label)}:</b> ` : ''}${esc(s.items)}</p>`)
      .join('')}</section>`);
  }

  const exp = r.experience.filter((e) => has(e.title) || has(e.org));
  if (exp.length) {
    out.push(`<section><h2>Experience</h2>${exp.map(item).join('')}</section>`);
  }

  const proj = r.projects.filter((p) => has(p.name));
  if (proj.length) {
    out.push(`<section><h2>Selected Projects</h2>${proj
      .map((p) => item({ title: p.name, org: p.subtitle, dates: p.meta, bullets: p.bullets, env: p.env }))
      .join('')}</section>`);
  }

  const edu = r.education.filter((e) => has(e.degree) || has(e.school));
  if (edu.length) {
    out.push(`<section><h2>Education</h2>${edu
      .map((e) => item({ title: e.degree, org: e.school, dates: e.dates, bullets: has(e.detail) ? [e.detail] : [], env: '' }))
      .join('')}</section>`);
  }

  if (has(r.languages)) {
    out.push(`<section><h2>Languages</h2><p>${esc(r.languages)}</p></section>`);
  }

  return out.join('');
}

function item(e: { title: string; org: string; dates: string; bullets: string[]; env: string }): string {
  const list = e.bullets.filter(has);
  return `<div class="s-item">
    <div class="s-item-head"><p class="s-item-title">${esc(e.title)}</p>${
      has(e.dates) ? `<span class="s-item-dates">${esc(e.dates)}</span>` : ''
    }</div>
    ${has(e.org) ? `<p class="s-item-org">${esc(e.org)}</p>` : ''}
    ${list.length ? `<ul>${list.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    ${has(e.env) ? `<p class="s-env"><b>Environment:</b> ${esc(e.env)}</p>` : ''}
  </div>`;
}

/**
 * Approximates the plain text an ATS pulls out of the PDF. It walks the rendered
 * DOM in order and keeps only block boundaries, which is what a text extractor does.
 * Styling, colour and position are all dropped, exactly as they are dropped by a parser.
 */
export function renderParserText(sheetEl: HTMLElement): string {
  const lines: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) lines[lines.length - 1] = ((lines[lines.length - 1] || '') + ' ' + t).trim();
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'IMG') return; // a parser sees nothing in an image
    const block = /^(DIV|P|H1|H2|H3|UL|LI|SECTION|HEADER)$/.test(el.tagName);
    if (block) lines.push('');
    el.childNodes.forEach(walk);
    if (block) lines.push('');
  };
  walk(sheetEl);
  return lines
    .map((l) => l.trim())
    .filter((l, i, a) => l.length > 0 || (i > 0 && a[i - 1].length > 0))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
