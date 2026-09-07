/* Downloads a PDF for each template and checks it matches the preview: the same
   number of pages the sheet needs on screen, and a real text layer.
   Usage: node tests/pdf.mjs <url> [templates] [resume.pdf] */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:4331/';
const tpls = (process.argv[3] || 'classic,editorial,signal,mono,portrait,open,compact').split(',');
const source = process.argv[4];
mkdirSync('/tmp/pdfout', { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url, { waitUntil: 'networkidle' });
if (source) {
  await p.setInputFiles('[data-file="pdf"]', source);
  await p.waitForFunction(() => document.querySelector('#f-name')?.value?.length > 3, null, { timeout: 20000 });
} else {
  await p.click('[data-action="sample"]');
}
await p.waitForTimeout(600);

let fails = 0;
for (const tpl of tpls) {
  await p.click('[data-step="template"]'); await p.waitForTimeout(200);
  await p.click(`button.tpl[data-tpl="${tpl}"]`); await p.waitForTimeout(400);
  // what the preview needs: the sheet is 210mm wide, so its height in mm says how many A4 pages it takes
  const onScreen = await p.evaluate(() => {
    const el = document.querySelector('#sheet');
    const mm = el.getBoundingClientRect().width / (el.offsetWidth || 1); // scale factor of the zoom
    const heightMm = (el.scrollHeight / el.offsetWidth) * 210;
    return { pages: Math.max(1, Math.ceil((heightMm - 1) / 297)), heightMm: Math.round(heightMm), mm };
  });
  await p.click('[data-step="export"]'); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-action="pdf"]')]);
  const path = `/tmp/pdfout/${tpl}.pdf`;
  await dl.saveAs(path);
  const buf = readFileSync(path);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buf) }).promise;
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join(' ');
  const ok = doc.numPages === onScreen.pages && text.length > 200;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${tpl.padEnd(10)} preview ${onScreen.heightMm}mm = ${onScreen.pages}p, pdf ${doc.numPages}p, ${String(Math.round(buf.length / 1024)).padStart(3)}KB, text ${text.length}`);
}
if (errs.length) { console.log('ERRORS: ' + errs.join(' | ')); fails++; }
await b.close();
console.log(fails ? `${fails} template(s) do not match the preview` : 'every template matches the preview');
process.exit(fails ? 1 : 0);
