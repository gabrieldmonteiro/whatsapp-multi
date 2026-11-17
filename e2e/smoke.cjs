// Launches the BUILT app (run `npm run build` first) and checks the preload bridge.
const { _electron } = require('playwright-core');
const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');

(async () => {
  const root = path.resolve(__dirname, '..');
  // Isolated userData so a running instance (single-instance lock) doesn't interfere.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wam-smoke-'));
  process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [root, `--user-data-dir=${tmp}`],
    timeout: 30000,
  });
  const errors = [];
  app.process().stderr.on('data', (d) => {
    const s = String(d);
    if (/preload-error|Unable to load preload|Cannot find module/i.test(s)) errors.push(s.trim());
  });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.waitForLoadState('load');
    assert.equal(await page.evaluate(() => typeof window.api), 'object', 'window.api missing');
    const version = await page.evaluate(() => window.api.app.getVersion());
    const locale = await page.evaluate(() => window.api.app.getLocale());
    assert.match(version, /^\d+\.\d+\.\d+/);
    assert.ok(typeof locale === 'string' && locale.length > 0);
    const shape = await page.evaluate(() => ({
      list: typeof window.api.accounts.list,
      on: typeof window.api.on,
      states: typeof window.api.view.getStates,
    }));
    assert.deepEqual([shape.list, shape.on, shape.states], ['function', 'function', 'function']);
    assert.ok(Array.isArray(await page.evaluate(() => window.api.accounts.list())));
    assert.ok(Array.isArray(await page.evaluate(() => window.api.view.getStates())));
    assert.equal(await page.evaluate(() => typeof require), 'undefined', 'node leaked');
    assert.ok(page.url().startsWith('app://renderer/'), `unexpected URL ${page.url()}`);
    assert.deepEqual(errors, []);
    console.log(`smoke ok: version=${version} locale=${locale} url=${page.url()}`);
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error('smoke FAIL:', e.message);
  process.exit(1);
});
