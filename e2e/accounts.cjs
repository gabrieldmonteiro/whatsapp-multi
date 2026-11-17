/* global document */
// Account/view flow e2e against the BUILT app, isolated userData. Never logs into WhatsApp.
// Usage: node e2e/accounts.cjs [screenshotDir]
const { _electron } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');

const shotDir = process.argv[2] || os.tmpdir();
const step = async (name, fn) => {
  try {
    const ev = await fn();
    console.log(`PASS ${name} ${ev ?? ''}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    throw e;
  }
};

(async () => {
  const root = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wam-e2e-'));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [root, `--user-data-dir=${tmp}`],
    timeout: 30000,
  });
  const consoleErrors = [];
  let page;
  const views = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().flatMap((w) =>
        w.contentView.children.map((v) => ({
          url: v.webContents.getURL(),
          ua: v.webContents.getUserAgent(),
          visible: v.getVisible(),
        })),
      ),
    );
  const waitViews = async (pred, ms = 30000) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) {
      v = await views();
      if (pred(v)) return v;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`views timeout: ${JSON.stringify(v)}`);
  };
  const activeLabel = () =>
    page.evaluate(
      () =>
        document.querySelector('button[aria-current="true"]')?.getAttribute('aria-label') ?? null,
    );
  const addAccount = async (name, first) => {
    await page
      .getByRole('button', {
        name: first ? 'Adicionar primeira conta' : '+ Adicionar conta',
        exact: true,
      })
      .click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nome').fill(name);
    await dlg.getByRole('button', { name: 'Criar conta' }).click();
    await dlg.waitFor({ state: 'detached' });
  };
  const menuFor = async (name, item) => {
    await page.locator(`button[aria-label="Ações para ${name}"]`).click();
    await page.getByRole('menuitem', { name: item }).click();
  };
  const isActive = (n) => page.locator(`button[aria-label^="${n}"][aria-current="true"]`);

  try {
    page = await app.firstWindow();
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    await page.waitForLoadState('load');

    await step('userData isolated', async () => {
      const p = await app.evaluate(({ app }) => app.getPath('userData'));
      assert.equal(path.resolve(p).toLowerCase(), path.resolve(tmp).toLowerCase());
      return p;
    });
    await step('empty state', async () => {
      await page.getByText('Nenhuma conta ainda').waitFor({ timeout: 10000 });
      assert.equal((await views()).length, 0);
    });
    await step('add Test A -> active + view loads whatsapp', async () => {
      await addAccount('Test A', true);
      await isActive('Test A').waitFor({ timeout: 10000 });
      const v = await waitViews((vs) => vs.some((x) => /whatsapp\.com/.test(x.url)));
      const w = v.find((x) => /whatsapp\.com/.test(x.url));
      assert.ok(!/Electron/i.test(w.ua), `UA has Electron: ${w.ua}`);
      return `url=${w.url} ua=${w.ua.slice(0, 90)}`;
    });
    await step('add Test B -> active, second view', async () => {
      await addAccount('Test B', false);
      await isActive('Test B').waitFor({ timeout: 10000 });
      const v = await waitViews((vs) => vs.length >= 2);
      assert.ok(
        v.every((x) => !/Electron/i.test(x.ua)),
        'UA has Electron',
      );
      return JSON.stringify(v.map((x) => [x.url, x.visible]));
    });
    await step('switch by click', async () => {
      await page.locator('button[aria-label^="Test A"]').first().click();
      await isActive('Test A').waitFor({ timeout: 5000 });
      return `visible=${JSON.stringify((await waitViews((vs) => vs.filter((x) => x.visible).length === 1, 8000)).map((x) => x.visible))}`;
    });
    await step('Ctrl+2 / Ctrl+1 (renderer focus)', async () => {
      await page.locator('button[aria-label^="Test A"]').first().focus();
      await page.keyboard.press('Control+2');
      await isActive('Test B').waitFor({ timeout: 5000 });
      await page.keyboard.press('Control+1');
      await isActive('Test A').waitFor({ timeout: 5000 });
    });
    await step('Ctrl+2 with focus inside WhatsApp view', async () => {
      await waitViews((vs) => vs.some((x) => x.visible), 8000);
      const ok = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        const v = w.contentView.children.find((c) => c.getVisible());
        v?.webContents.focus();
        return !!v;
      });
      assert.ok(ok, 'no visible account view');
      await new Promise((r) => setTimeout(r, 500));
      await page.keyboard.press('Control+2');
      await isActive('Test B').waitFor({ timeout: 5000 });
    });
    await step('rename Test B -> Test C', async () => {
      await menuFor('Test B', 'Renomear');
      const dlg = page.getByRole('dialog');
      await dlg.getByLabel('Nome').fill('Test C');
      await dlg.getByRole('button', { name: 'Salvar' }).click();
      await dlg.waitFor({ state: 'detached' });
      await page.locator('button[aria-label^="Test C"]').first().waitFor({ timeout: 5000 });
      assert.equal(await page.locator('button[aria-label^="Test B"]').count(), 0);
    });
    await step('accounts.json metadata only', async () => {
      const raw = fs.readFileSync(path.join(tmp, 'accounts.json'), 'utf8');
      JSON.parse(raw);
      assert.ok(!/cookie|token|password|message/i.test(raw), 'suspicious content');
      return raw.replace(/\s+/g, ' ').slice(0, 700);
    });
    await step('remove Test C with confirm (cancel first)', async () => {
      await menuFor('Test C', 'Remover conta');
      const dlg = page.getByRole('dialog');
      await dlg.getByRole('button', { name: 'Cancelar' }).click();
      await dlg.waitFor({ state: 'detached' });
      assert.equal(
        await page.locator('button[aria-label^="Test C"]').count(),
        1,
        'cancel removed it',
      );
      await menuFor('Test C', 'Remover conta');
      await dlg.getByRole('button', { name: 'Remover', exact: true }).click();
      await dlg.waitFor({ state: 'detached' });
      await page.waitForFunction(
        () => !document.querySelector('button[aria-label^="Test C"]'),
        null,
        {
          timeout: 5000,
        },
      );
      assert.equal(await page.locator('button[aria-label^="Test A"]').count(), 1);
      const v = await waitViews((vs) => vs.length === 1);
      return `views left=${v.length}, active=${await activeLabel()}`;
    });
    await step('accounts.json after remove', async () => {
      return fs
        .readFileSync(path.join(tmp, 'accounts.json'), 'utf8')
        .replace(/\s+/g, ' ')
        .slice(0, 500);
    });
    await page.screenshot({ path: path.join(shotDir, 'accounts-final.png') });
    await step('no renderer console errors', async () => {
      assert.deepEqual(consoleErrors, []);
    });
  } finally {
    try {
      if (page) await page.screenshot({ path: path.join(shotDir, 'accounts-final.png') });
    } catch {
      // screenshot is best-effort
    }
    if (consoleErrors.length) console.log('CONSOLE ERRORS:', consoleErrors);
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error('accounts e2e FAIL:', e.message);
  process.exit(1);
});
