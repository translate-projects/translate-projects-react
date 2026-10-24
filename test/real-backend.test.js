// Real API, real AI tokens: runs only with REAL_BACKEND=1 and TRANSLATE_PROJECTS_API_KEY set.
// Uses the "Pruebas paquetes" test project; the texts are tiny and usually already
// translated there, so a run costs cents at most.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const enabled =
  process.env.REAL_BACKEND === '1' && process.env.TRANSLATE_PROJECTS_API_KEY;

const LANGS = {
  en: [/good morning/i, /save/i, /thank/i],
  'pt-BR': [/bom dia/i, /salvar|guardar/i, /obrigad/i],
  fr: [/bonjour/i, /enregistrer|sauvegarder/i, /merci/i],
};

test(
  'es -> en, pt-BR, fr against the real backend; a second run translates nothing',
  { skip: !enabled, timeout: 600000 },
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-react-real-'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.mkdirSync(path.join(dir, 'home'));
    fs.writeFileSync(
      path.join(dir, 'src/App.jsx'),
      `export default () => <main><h1>{t('Buenos días')}</h1><button>{t('Guardar cambios')}</button><Trans>Muchas gracias</Trans></main>;`
    );
    const script = `require(${JSON.stringify(path.resolve(__dirname, '../dist'))}).translateProject({
      sourceLang: 'es', targetLangs: ${JSON.stringify(Object.keys(LANGS))},
      apiKey: process.env.TRANSLATE_PROJECTS_API_KEY, outputDir: './public/locales', scanner: true })`;

    const run = (label) => {
      const log = path.join(dir, `requests-${label}.txt`);
      const start = Date.now();
      // throws (fails the test) on a non-zero exit
      execFileSync(
        process.execPath,
        ['-r', path.join(__dirname, 'helpers/count-fetch.js'), '-e', script],
        {
          cwd: dir,
          env: { ...process.env, HOME: path.join(dir, 'home'), REQ_LOG: log },
          timeout: 300000,
          stdio: ['ignore', 'ignore', 'inherit'],
        }
      );
      const requests = fs.readFileSync(log, 'utf8').trim().split('\n');
      console.log(
        `# ${label}: ${Date.now() - start} ms, ${requests.length} requests`
      );
      requests.forEach((r) => console.log(`#   ${r}`));
      return requests;
    };

    const first = run('first');
    assert.ok(
      first.some((r) => r.startsWith('POST /v1/translations/load-sources'))
    );

    const texts = ['Buenos días', 'Guardar cambios', 'Muchas gracias'];
    for (const [lang, patterns] of Object.entries(LANGS)) {
      const file = path.join(dir, `public/locales/${lang}/translation.json`);
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.deepStrictEqual(Object.keys(json), texts, lang);
      texts.forEach((text, i) =>
        assert.match(json[text], patterns[i], `${lang}: ${json[text]}`)
      );
    }

    const second = run('second');
    assert.deepStrictEqual(
      second.map((r) => r.split(' ').slice(0, 2).join(' ')),
      ['POST /v1/translations/validate-changes-files']
    );
  }
);
