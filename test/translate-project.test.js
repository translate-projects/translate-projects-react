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

const TRANSLATIONS = '/v1/translations/';
const LOAD_SOURCES = '/v1/translations/load-sources';

const source = {
  'Inscribe a tu equipo': 'Inscribe a tu equipo',
  'v1.0': 'Versión 1.0',
  torneo: { titulo: 'Torneo relámpago', goles: '{{count}} goles' },
};

const makeProject = (files = { 'translation.json': source }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-react-project-'));
  fs.mkdirSync(path.join(dir, 'public/locales/es'), { recursive: true });
  for (const [name, json] of Object.entries(files))
    writeLang(dir, 'es', json, name);
  // isolated HOME so the translate-projects cache never touches the real one
  fs.mkdirSync(path.join(dir, 'home'));
  return dir;
};

const langFile = (dir, lang, name = 'translation.json') =>
  path.join(dir, `public/locales/${lang}/${name}`);

const writeLang = (dir, lang, json, name) => {
  fs.mkdirSync(path.dirname(langFile(dir, lang, name)), { recursive: true });
  fs.writeFileSync(
    langFile(dir, lang, name),
    typeof json === 'string' ? json : JSON.stringify(json)
  );
};

const readLang = (dir, lang, name) =>
  JSON.parse(fs.readFileSync(langFile(dir, lang, name), 'utf8'));

// Runs translateProject in its own process, like a user's translate.js
const run = (dir, apiUrl, options = {}, timeoutMs = 30000, env = {}) =>
  new Promise((resolve, reject) => {
    const opts = {
      sourceLang: 'es',
      targetLangs: ['en'],
      apiKey: 'test-key',
      outputDir: './public/locales',
      ...options,
    };
    const script = `require(${JSON.stringify(DIST)}).translateProject(${JSON.stringify(opts)})
      .then((ok) => console.log('RESULT=' + ok))`;
    const child = spawn(process.execPath, ['-e', script], {
      cwd: dir,
      env: {
        ...process.env,
        HOME: path.join(dir, 'home'),
        TRANSLATE_PROJECTS_API_URL: apiUrl,
        ...env,
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

const mock = async (t, opts) => {
  const api = await startMockApi(opts);
  t.after(() => api.close());
  return api;
};

test('translates every language, keeps the structure and exits 0 on its own', async (t) => {
  const api = await mock(t);
  const dir = makeProject();

  const { code, output } = await run(dir, api.url, {
    targetLangs: ['en', 'fr', 'pt-BR'],
  });

  assert.strictEqual(code, 0, output);
  assert.match(output, /RESULT=true/);
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
  assert.strictEqual(api.count(LOAD_SOURCES), 1);
  assert.strictEqual(api.count(TRANSLATIONS), 3);
  assert.ok(api.state.requests.every((r) => r.auth === 'Token test-key'));
});

test('scanner: extracts t() and <Trans> texts, sends them and writes the translations', async (t) => {
  const api = await mock(t);
  const dir = makeProject({});
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(
    path.join(dir, 'src/App.jsx'),
    `export default () => <p title={t('Bienvenido a Playfut')}>{t("Reserva tu cancha")}<Trans>Juega con amigos</Trans></p>;`
  );

  const { code, output } = await run(dir, api.url, { scanner: true });

  assert.strictEqual(code, 0, output);
  const texts = [
    'Bienvenido a Playfut',
    'Reserva tu cancha',
    'Juega con amigos',
  ];
  assert.deepStrictEqual(
    Object.values(api.state.sources).sort(),
    [...texts].sort()
  );
  assert.deepStrictEqual(
    readLang(dir, 'en'),
    Object.fromEntries(texts.map((s) => [s, `[en] ${s}`]))
  );
});

test('languages are translated in parallel (at most 3 at a time)', async (t) => {
  const api = await mock(t, { taskMs: 300 });
  const dir = makeProject();

  const { code, output } = await run(dir, api.url, {
    targetLangs: ['en', 'fr', 'pt-BR', 'de', 'it'],
  });

  assert.strictEqual(code, 0, output);
  assert.strictEqual(api.state.maxRunning, 3);
});

test('cache: a second run with no changes sends and translates nothing', async (t) => {
  const api = await mock(t);
  const dir = makeProject();

  assert.strictEqual(
    (await run(dir, api.url, { targetLangs: ['en', 'fr'] })).code,
    0
  );
  fs.rmSync(path.join(dir, 'public/locales/en'), { recursive: true });
  const second = await run(dir, api.url, { targetLangs: ['en', 'fr'] });

  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.count(LOAD_SOURCES), 1);
  assert.strictEqual(api.count(TRANSLATIONS), 2);
  assert.strictEqual(readLang(dir, 'en')['v1.0'], '[en] Versión 1.0');
});

test('cache: only the file that changed is synced and translated again', async (t) => {
  const api = await mock(t);
  const dir = makeProject({
    'translation.json': source,
    'common.json': { guardar: 'Guardar' },
  });

  assert.strictEqual((await run(dir, api.url)).code, 0);
  writeLang(
    dir,
    'es',
    { guardar: 'Guardar', cancelar: 'Cancelar' },
    'common.json'
  );
  const second = await run(dir, api.url);

  assert.strictEqual(second.code, 0, second.output);
  const routes = (p) =>
    api.state.requests
      .filter((r) => r.path === p)
      .map((r) => path.basename(r.q.route_file));
  assert.deepStrictEqual(routes(LOAD_SOURCES).sort(), [
    'common.json',
    'common.json',
    'translation.json',
  ]);
  assert.deepStrictEqual(routes(TRANSLATIONS).sort(), [
    'common.json',
    'common.json',
    'translation.json',
  ]);
  assert.deepStrictEqual(readLang(dir, 'en', 'common.json'), {
    guardar: '[en] Guardar',
    cancelar: '[en] Cancelar',
  });
});

test('apiKey defaults to the TRANSLATE_PROJECTS_API_KEY environment variable', async (t) => {
  const api = await mock(t);
  const dir = makeProject();

  const { code, output } = await run(
    dir,
    api.url,
    { apiKey: undefined },
    30000,
    {
      TRANSLATE_PROJECTS_API_KEY: 'test-key',
    }
  );

  assert.strictEqual(code, 0, output);
  assert.ok(api.state.requests.every((r) => r.auth === 'Token test-key'));
});

test('partial translation is retried on the next run once the AI key is set', async (t) => {
  const untranslatable = ['Versión 1.0'];
  const api = await mock(t, { untranslatable });
  const dir = makeProject();

  const first = await run(dir, api.url);
  assert.strictEqual(first.code, 1);
  assert.match(
    first.output,
    /MISSING_API_KEY|Configura el modelo y la API key/
  );
  assert.strictEqual(readLang(dir, 'en')['v1.0'], undefined);

  untranslatable.length = 0; // the user configures the project's AI key
  const second = await run(dir, api.url);

  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.count(TRANSLATIONS), 2);
  assert.strictEqual(readLang(dir, 'en')['v1.0'], '[en] Versión 1.0');
});

test('cache: adding a language requests only that language', async (t) => {
  const api = await mock(t);
  const dir = makeProject();

  assert.strictEqual(
    (await run(dir, api.url, { targetLangs: ['en'] })).code,
    0
  );
  const second = await run(dir, api.url, { targetLangs: ['en', 'fr'] });

  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.count(LOAD_SOURCES), 1);
  assert.strictEqual(api.count(TRANSLATIONS, 'en'), 1);
  assert.strictEqual(api.count(TRANSLATIONS, 'fr'), 1);
  assert.strictEqual(
    readLang(dir, 'fr').torneo.titulo,
    '[fr] Torneo relámpago'
  );
});

test('JSON files in subfolders keep their folder in every language', async (t) => {
  const api = await mock(t);
  const dir = makeProject({
    'translation.json': source,
    'admin/users.json': { titulo: 'Usuarios' },
  });

  const { code, output } = await run(dir, api.url, {
    targetLangs: ['en', 'fr'],
  });

  assert.strictEqual(code, 0, output);
  assert.deepStrictEqual(readLang(dir, 'fr', 'admin/users.json'), {
    titulo: '[fr] Usuarios',
  });
  assert.ok(!fs.existsSync(langFile(dir, 'fr', 'users.json')));
  assert.ok(!fs.existsSync(langFile(dir, 'es', 'users.json')));
  assert.strictEqual(
    readLang(dir, 'en').torneo.titulo,
    '[en] Torneo relámpago'
  );
});

test('missing apiKey fails before any request', async (t) => {
  const api = await mock(t);
  const dir = makeProject();

  const { code, output } = await run(dir, api.url, { apiKey: '' });

  assert.strictEqual(code, 1);
  assert.match(output, /apiKey is required/);
  assert.strictEqual(api.state.requests.length, 0);
});

test('invalid token exits 1 with the API message and leaves the files alone', async (t) => {
  const api = await mock(t);
  const dir = makeProject();
  writeLang(dir, 'en', { 'v1.0': 'Version 1.0 (old)' });

  const { code, output } = await run(dir, api.url, { apiKey: 'wrong-key' });

  assert.strictEqual(code, 1);
  assert.match(output, /RESULT=false/);
  assert.match(output, /Token no válido/);
  assert.deepStrictEqual(readLang(dir, 'en'), { 'v1.0': 'Version 1.0 (old)' });
  assert.deepStrictEqual(readLang(dir, 'es'), source);
});

test('a 503 is retried and the run still succeeds', async (t) => {
  const api = await mock(t, {
    failures: [
      {
        path: TRANSLATIONS,
        status: 503,
        times: 1,
        code: 'SERVICE_UNAVAILABLE',
      },
    ],
  });
  const dir = makeProject();

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 0, output);
  assert.strictEqual(api.count(TRANSLATIONS), 2);
  assert.strictEqual(
    readLang(dir, 'en').torneo.titulo,
    '[en] Torneo relámpago'
  );
});

test('a 4xx on one language exits 1, writes the others and keeps the old file', async (t) => {
  const api = await mock(t, {
    failures: [
      {
        path: TRANSLATIONS,
        status: 400,
        lang: 'fr',
        code: 'LANGUAGE_DISABLED',
      },
    ],
  });
  const dir = makeProject();
  writeLang(dir, 'fr', { 'v1.0': 'Version 1.0 (fr ancien)' });

  const { code, output } = await run(dir, api.url, {
    targetLangs: ['en', 'fr'],
  });

  assert.strictEqual(code, 1);
  assert.match(output, /mock 400 fr/);
  assert.match(output, /Translation failed for: fr/);
  assert.doesNotMatch(output, /timeout error/i);
  assert.deepStrictEqual(readLang(dir, 'fr'), {
    'v1.0': 'Version 1.0 (fr ancien)',
  });
  assert.strictEqual(
    readLang(dir, 'en').torneo.titulo,
    '[en] Torneo relámpago'
  );
});

test('a 500 on the translations GET exits 1 and keeps the old file', async (t) => {
  const api = await mock(t);
  const dir = makeProject();
  assert.strictEqual((await run(dir, api.url)).code, 0);
  const before = readLang(dir, 'en');

  writeLang(dir, 'es', { ...source, nuevo: 'Texto nuevo' });
  api.failNext({ path: '/v1/translations/language-project', status: 500 });
  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 1, output);
  assert.match(output, /Translation failed for: en/);
  assert.deepStrictEqual(readLang(dir, 'en'), before);
});

test('a task that never reaches 100 % exits 1 instead of hanging', async (t) => {
  const api = await mock(t, { stallLangs: ['fr'] });
  const dir = makeProject();

  const { code, output } = await run(dir, api.url, {
    targetLangs: ['en', 'fr'],
  });

  assert.strictEqual(code, 1);
  assert.match(output, /Translation failed for: fr/);
  assert.ok(!fs.existsSync(langFile(dir, 'fr')));
  assert.ok(fs.existsSync(langFile(dir, 'en')));
});

test('partial response (MISSING_API_KEY) warns, writes what came back and exits 1', async (t) => {
  const api = await mock(t, { untranslatable: ['Versión 1.0'] });
  const dir = makeProject();

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 1);
  assert.match(output, /1 text\(s\) came back without translation in en/);
  assert.match(output, /en \(.*\): 1 untranslated/);
  const en = readLang(dir, 'en');
  assert.strictEqual(en['v1.0'], undefined);
  assert.strictEqual(en.torneo.titulo, '[en] Torneo relámpago');
});

test('partial response keeps the earlier translation instead of dropping it', async (t) => {
  const api = await mock(t, { untranslatable: ['Versión 1.0'] });
  const dir = makeProject();
  writeLang(dir, 'en', { 'v1.0': 'Version 1.0 (old)' });

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 0, output);
  assert.match(
    output,
    /1 text\(s\) came back without translation in en \(0 not in the previous file/
  );
  assert.strictEqual(readLang(dir, 'en')['v1.0'], 'Version 1.0 (old)');
  assert.strictEqual(
    readLang(dir, 'en').torneo.titulo,
    '[en] Torneo relámpago'
  );
});

test('an invalid source JSON exits 1 and is not overwritten', async (t) => {
  const api = await mock(t);
  const dir = makeProject();
  writeLang(dir, 'es', '{ "roto": ', 'translation.json');

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 1);
  assert.match(output, /Invalid JSON file/);
  assert.strictEqual(
    fs.readFileSync(langFile(dir, 'es'), 'utf8'),
    '{ "roto": '
  );
});

test('an unreachable API exits 1 instead of hanging', async () => {
  const dir = makeProject();
  const { code, output } = await run(dir, 'http://127.0.0.1:1');
  assert.strictEqual(code, 1);
  assert.match(output, /Could not validate file changes/);
});
