import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const url = process.argv[2] || 'http://localhost:4331/';
const tpls = process.argv[3] ? process.argv[3].split(',') : ['classic'];
mkdirSync('/tmp/pdfout', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url, { waitUntil: 'networkidle' });
await p.click('[data-action="sample"]'); await p.waitForTimeout(600);
for (const tpl of tpls) {
  await p.click('[data-step="template"]'); await p.waitForTimeout(200);
  await p.click(`button.tpl[data-tpl="${tpl}"]`); await p.waitForTimeout(300);
  await p.click('[data-step="export"]'); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-action="pdf"]')]);
  const path = `/tmp/pdfout/${tpl}.pdf`;
  await dl.saveAs(path);
  const buf = readFileSync(path);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  const text = (await page.getTextContent()).items.map((i) => i.str).join(' ').replace(/\s+/g, ' ');
  console.log(`${tpl.padEnd(10)} name="${dl.suggestedFilename()}" ${String(Math.round(buf.length/1024)).padStart(4)}KB pages=${doc.numPages} textLayer=${text.length > 200} hasName=${text.includes('Marie Dubois')} hasSkill=${/Kubernetes/.test(text)}`);
}
console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no page errors');
await b.close();
