/* Imports one PDF through the page and checks that the reader filled the fields.
   Usage: node tests/fields.mjs <url> <pdf> [minRoles] */
import { chromium } from 'playwright';
const [url = 'http://localhost:4331/', pdf, minRoles = '1'] = process.argv.slice(2);
if (!pdf) { console.error('usage: node tests/fields.mjs <url> <pdf> [minRoles]'); process.exit(2); }
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.setInputFiles('[data-file="pdf"]', pdf);
await page.waitForFunction(() => !document.querySelector('[data-role="demo-note"]') || document.querySelector('[data-role="demo-note"]').hidden || !document.querySelector('#f-name') || document.querySelector('#f-name').value !== 'Marie Dubois', null, { timeout: 15000 });
await page.waitForTimeout(400);
const draft = JSON.parse(await page.evaluate(() => sessionStorage.getItem('parseable/draft') || '{}'));
const d = draft.data; const bsc = d.basics;
let fails = 0;
const check = (label, ok, value) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${value !== undefined ? `: ${String(value).slice(0, 90)}` : ''}`); if (!ok) fails++; };
check('name', bsc.name.trim().length > 3, bsc.name);
check('title', bsc.title.trim().length > 3, bsc.title);
check('email', /@/.test(bsc.email), bsc.email);
check('phone', (bsc.phone.match(/\d/g) || []).length >= 8, bsc.phone);
check('summary', bsc.summary.trim().length > 40, bsc.summary);
console.log(`      location: ${bsc.location || '(none in the file)'} | links: ${bsc.links.map((l) => l.label).join(', ') || '(none in the file)'}`);
check('skills rows', d.skills.length >= 1 && d.skills.every((s) => s.items.length > 1), d.skills.map((s) => `${s.label || 'Skills'} (${s.items.split(',').length})`).join(' / '));
check(`experience, at least ${minRoles}`, d.experience.length >= Number(minRoles), d.experience.map((e) => `${e.title} @ ${e.org || '?'} ${e.dates}`).join(' ; '));
check('every role has a title and dates', d.experience.every((e) => e.title && e.dates));
check('every role has text', d.experience.every((e) => e.bullets.length > 0 || e.org));
console.log(`      education: ${d.education.map((e) => `${e.degree} @ ${e.school} ${e.dates}`).join(' ; ') || '(none in the file)'}`);
console.log(`      languages: ${d.languages || '(none in the file)'}`);
check('no field carries a stray heading', ![bsc.summary, d.languages, ...d.skills.map((s) => s.items)].some((v) => /\b(experience|education|skills|languages?)\s*$/i.test(v)));
await b.close();
console.log(fails ? `${fails} field check(s) failed` : 'all field checks passed');
process.exit(fails ? 1 : 0);
