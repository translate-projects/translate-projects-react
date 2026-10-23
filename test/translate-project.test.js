const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startMockApi } = require('./helpers/mock-api');

const DIST = path.resolve(__dirname, '../dist');

// Older cores ignore TRANSLATE_PROJECTS_API_URL and would hit the real API
const coreApi = path.join(
  path.dirname(require.resolve('translate-projects-core')),
  'utils/api.js'
);
if (!('API_BASE_URL' in require(coreApi))) {
  throw new Error(
    'translate-projects-core is too old: link ../core (see README)'
  );
}

const source = {
  'Inscribe a tu equipo': 'Inscribe a tu equipo',
  'v1.0': 'Versión 1.0',
  torneo: { titulo: 'Torneo relámpago', goles: '{{count}} goles' },
};

const makeProject = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-react-project-'));
  fs.mkdirSync(path.join(dir, 'public/locales/es'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'public/locales/es/translation.json'),
    JSON.stringify(source)
  );
  // isolated HOME so the translate-projects cache never touches the real one
  fs.mkdirSync(path.join(dir, 'home'));
  return dir;
};

// Runs translateProject in its own process, like a user's translate.js
const run = (dir, apiUrl, targetLangs, timeoutMs = 20000) =>
  new Promise((resolve, reject) => {
    const script = `require(${JSON.stringify(DIST)}).translateProject({
      sourceLang: 'es', targetLangs: ${JSON.stringify(targetLangs)},
      apiKey: 'test-key', outputDir: './public/locales' })`;
    const child = spawn(process.execPath, ['-e', script], {
      cwd: dir,
      env: {
        ...process.env,
        HOME: path.join(dir, 'home'),
        TRANSLATE_PROJECTS_API_URL: apiUrl,
      },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `translateProject did not exit in ${timeoutMs} ms:\n${output}`
        )
      );
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });

const readLang = (dir, lang) =>
  JSON.parse(
    fs.readFileSync(
      path.join(dir, `public/locales/${lang}/translation.json`),
      'utf8'
    )
  );

test('translates every language, keeps the structure and exits 0 on its own', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeProject();

  const { code, output } = await run(dir, api.url, ['en', 'fr', 'pt-BR']);

  assert.strictEqual(code, 0, output);
  for (const lang of ['en', 'fr', 'pt-BR']) {
    assert.deepStrictEqual(readLang(dir, lang), {
      'Inscribe a tu equipo': `[${lang}] Inscribe a tu equipo`,
      'v1.0': `[${lang}] Versión 1.0`,
      torneo: {
        titulo: `[${lang}] Torneo relámpago`,
        goles: `[${lang}] {{count}} goles`,
      },
    });
  }
  assert.strictEqual(api.count('/v1/translations/load-sources'), 1);
  assert.strictEqual(api.count('/v1/translations/'), 3);
});

test('languages are translated in parallel (at most 3 at a time)', async (t) => {
  const api = await startMockApi({ taskMs: 300 });
  t.after(() => api.close());
  const dir = makeProject();

  const { code, output } = await run(dir, api.url, [
    'en',
    'fr',
    'pt-BR',
    'de',
    'it',
  ]);

  assert.strictEqual(code, 0, output);
  assert.strictEqual(api.state.maxRunning, 3);
});

test('second run with no changes uses the cache and calls no translation', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeProject();

  assert.strictEqual((await run(dir, api.url, ['en'])).code, 0);
  fs.rmSync(path.join(dir, 'public/locales/en'), { recursive: true });
  const second = await run(dir, api.url, ['en']);

  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.count('/v1/translations/'), 1);
  assert.strictEqual(readLang(dir, 'en')['v1.0'], '[en] Versión 1.0');
});

test('a failed language exits 1 with the real error and writes no empty file', async (t) => {
  const api = await startMockApi({ failLangs: ['fr'] });
  t.after(() => api.close());
  const dir = makeProject();

  const { code, output } = await run(dir, api.url, ['en', 'fr']);

  assert.strictEqual(code, 1);
  assert.match(output, /mock refuses fr/);
  assert.match(output, /Translation failed for: fr/);
  assert.doesNotMatch(output, /timeout error/i);
  assert.ok(
    !fs.existsSync(path.join(dir, 'public/locales/fr/translation.json'))
  );
  assert.strictEqual(
    readLang(dir, 'en').torneo.titulo,
    '[en] Torneo relámpago'
  );
});

test('an unreachable API exits 1 instead of hanging', async () => {
  const dir = makeProject();
  const { code, output } = await run(dir, 'http://127.0.0.1:1', ['en']);
  assert.strictEqual(code, 1);
  assert.match(output, /Could not validate file changes/);
});
