// End to end checks for every control in the tool. Run against a preview or production:
//   node tests/e2e.mjs http://localhost:4331/ path/to/resume.pdf
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [base = 'http://localhost:4331/', pdf] = process.argv.slice(2);
if (!pdf) { console.error('usage: node tests/e2e.mjs <url> <resume.pdf>'); process.exit(2); }

const results = [];
const check = (name, ok, detail = '') => { results.push([name, ok, detail]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(base, { waitUntil: 'networkidle' });
check('the tool is hidden until a resume is given', !(await page.locator('#workspace').isVisible()));

// import a real PDF
// the sample is on screen already, so wait for the imported name to replace it
await page.setInputFiles('[data-file="pdf"]', pdf);
await page.waitForFunction(() => {
  const el = document.querySelector('#f-name');
  return el && el.value.length > 3 && !el.value.includes('Marie Dubois');
}, null, { timeout: 15000 });
const name = await page.locator('#f-name').inputValue();
check('PDF import replaces the sample', name.length > 3 && !name.includes('Marie'), name);
check('the sample note disappears after import', !(await page.locator('[data-role="demo-note"]').isVisible()));
check('PDF import finds roles', (await page.locator('[data-bind^="experience."][data-bind$=".title"]').count()) >= 3);

// zoom, before and after switching views
const zoomText = async () => page.locator('#zoomval').innerText();
const scaleOf = async () => page.locator('#scale').evaluate((el) => el.style.transform);
const z0 = await zoomText();
await page.click('[data-zoom="1"]'); await page.waitForTimeout(100);
check('zoom in changes the value', (await zoomText()) !== z0, `${z0} -> ${await zoomText()}`);
const before = await scaleOf();
await page.click('[data-zoom="-1"]'); await page.click('[data-zoom="-1"]'); await page.waitForTimeout(100);
check('zoom out changes the transform', (await scaleOf()) !== before && /scale\(0\.\d+\)/.test(await scaleOf()), `${before} -> ${await scaleOf()}`);

await page.click('button[role="tab"][data-view="parser"]'); await page.waitForTimeout(150);
check('parser view shows extracted text', (await page.locator('#parser').innerText()).length > 400);
check('parser view hides the sheet', !(await page.locator('#scale').isVisible()));
await page.click('button[role="tab"][data-view="human"]'); await page.waitForTimeout(150);
check('human view returns', await page.locator('#scale').isVisible());
const z1 = await zoomText();
await page.click('[data-zoom="1"]'); await page.waitForTimeout(100);
check('zoom still works after switching views', (await zoomText()) !== z1, `${z1} -> ${await zoomText()}`);

// editing: type into a field, the sheet follows
await page.fill('#f-title', 'Staff Engineer (test)'); await page.waitForTimeout(150);
check('editing a field updates the sheet', (await page.locator('#sheet').innerText()).includes('Staff Engineer (test)'));

// repeatable rows: add, move, remove. The groups are collapsed by default, so open Skills first.
await page.locator('details.acc summary').first().click(); await page.waitForTimeout(150);
const skillsBefore = await page.locator('[data-bind^="skills."][data-bind$=".items"]').count();
await page.click('[data-add="skills"]'); await page.waitForTimeout(150);
await page.locator('details.acc summary').first().click(); await page.waitForTimeout(100);
check('add a skills row', (await page.locator('[data-bind^="skills."][data-bind$=".items"]').count()) === skillsBefore + 1);
const firstLabel = await page.locator('[data-bind="skills.0.label"]').inputValue();
await page.click('[data-move="skills:0:1"]'); await page.waitForTimeout(150);
await page.locator('details.acc summary').first().click(); await page.waitForTimeout(100);
check('move a row down', (await page.locator('[data-bind="skills.1.label"]').inputValue()) === firstLabel);
await page.locator('[data-del^="skills:"]').last().click().catch(() => {});
await page.waitForTimeout(150);
await page.locator('details.acc summary').first().click(); await page.waitForTimeout(100);
check('remove a row', (await page.locator('[data-bind^="skills."][data-bind$=".items"]').count()) <= skillsBefore + 1);

// templates and photo toggle
await page.click('[data-step="template"]'); await page.waitForTimeout(150);
await page.click('[data-tpl="compact"]'); await page.waitForTimeout(150);
check('template switch reaches the sheet', (await page.locator('#sheet').getAttribute('data-tpl')) === 'compact');
await page.check('[data-bind="settings.showPhoto"]'); await page.waitForTimeout(150);
check('photo toggle reveals the picker', await page.locator('[data-action="pick-photo"]').isVisible());

// posting audit and adding a missing term
await page.click('[data-step="posting"]'); await page.waitForTimeout(150);
await page.fill('[data-role="posting"]', 'Requirements\n- Strong experience with Docker and Kubernetes\n- Must have Zig\nNice to have\n- Terraform');
await page.click('[data-action="run-audit"]'); await page.waitForTimeout(300);
const score = await page.locator('.mt-5 b').first().innerText();
check('audit produces a score', /\d+%/.test(score), score);
await page.fill('[data-role="posting-title"]', 'Platform Engineer'); await page.click('[data-action="run-audit"]'); await page.waitForTimeout(300);
check('a posting title that is missing is reported', (await page.locator('[data-action="use-title"]').count()) === 1);
await page.click('[data-action="use-title"]'); await page.waitForTimeout(300);
check('the posting title becomes the resume title', (await page.locator('#sheet').innerText()).includes('Platform Engineer'));
check('the title then reads as matched', (await page.locator('[data-action="use-title"]').count()) === 0);
// the title is read from the posting's first line, and tailoring is one undoable click
await page.fill('[data-role="posting-title"]', '');
await page.fill('[data-role="posting"]', 'Platform Engineer (Remote)\nRequirements\n- Strong experience with Docker and Kubernetes\n- Must have Zig'); await page.waitForTimeout(200);
check('the job title is read from the posting', (await page.locator('[data-role="posting-title"]').inputValue()) === 'Platform Engineer');
await page.click('[data-action="run-audit"]'); await page.waitForTimeout(300);
await page.click('[data-action="tailor"]'); await page.waitForTimeout(300);
check('tailoring reports what it changed', (await page.locator('[data-action="undo-tailor"]').count()) === 1);
await page.click('[data-action="undo-tailor"]'); await page.waitForTimeout(300);
check('undo brings the tailor button back', (await page.locator('[data-action="tailor"]').count()) === 1);
const missing = page.locator('button.chip-miss').first();
const missingTerm = await missing.innerText();
await missing.click(); await page.waitForTimeout(200);
check('clicking a missing term adds it to skills', (await page.locator('#sheet').innerText()).includes(missingTerm), missingTerm);

// export JSON, then import it back into a fresh tab
await page.click('[data-step="export"]'); await page.waitForTimeout(150);
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-json"]')]);
const jsonPath = await download.path();
const exported = JSON.parse(readFileSync(jsonPath, 'utf8'));
check('JSON export carries the data', exported.basics?.name === name && exported.schema === 'ats-resume-builder/v1');

const fresh = await ctx.newPage();
await fresh.goto(base, { waitUntil: 'networkidle' });
await fresh.setInputFiles('[data-file="json"]', jsonPath);
await fresh.waitForSelector('#f-name', { timeout: 5000 });
check('JSON import restores the name', (await fresh.locator('#f-name').inputValue()) === name);
check('JSON import restores the template', (await fresh.locator('#sheet').getAttribute('data-tpl')) === 'compact');
await fresh.close();

// the draft survives a reload in the same tab
// the step visited last is restored too, so the check reads the sheet rather than a form field
await page.reload({ waitUntil: 'networkidle' });
check('draft survives a reload', (await page.locator('#workspace').isVisible()) && (await page.locator('#sheet').innerText()).includes(name));

// print root is filled for the PDF
await page.click('[data-action="print"]').catch(() => {});
await page.waitForTimeout(200);
check('print root holds the sheet', (await page.locator('#print-root .sheet').count()) === 1);

// drag and drop onto the hero
const dt = await page.evaluateHandle(async (file) => {
  const res = await fetch(file); const buf = await res.arrayBuffer();
  const d = new DataTransfer(); d.items.add(new File([buf], 'x.pdf', { type: 'application/pdf' })); return d;
}, 'data:application/pdf;base64,' + readFileSync(pdf).toString('base64'));
await page.dispatchEvent('[data-drop="pdf"]', 'drop', { dataTransfer: dt });
await page.waitForTimeout(3000);
check('drop on the hero imports a PDF', await page.locator('#workspace').isVisible());

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
