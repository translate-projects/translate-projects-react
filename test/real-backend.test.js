// Real API, real AI tokens: runs only with REAL_BACKEND=1 and TRANSLATE_PROJECTS_API_KEY set.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const enabled =
  process.env.REAL_BACKEND === '1' && process.env.TRANSLATE_PROJECTS_API_KEY;

test(
  'translates 3 texts es -> en against the real backend',
  { skip: !enabled },
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-react-real-'));
    fs.mkdirSync(path.join(dir, 'public/locales/es'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'home'));
    fs.writeFileSync(
      path.join(dir, 'public/locales/es/translation.json'),
      JSON.stringify({
        'Inscribe a tu equipo': 'Inscribe a tu equipo',
        perfil: { editar: 'Editar perfil', cerrar: 'Cerrar sesión' },
      })
    );
    const script = `require(${JSON.stringify(path.resolve(__dirname, '../dist'))}).translateProject({
    sourceLang: 'es', targetLangs: ['en'], apiKey: process.env.TRANSLATE_PROJECTS_API_KEY,
    outputDir: './public/locales' })`;

    // throws (fails the test) on a non-zero exit
    execFileSync(process.execPath, ['-e', script], {
      cwd: dir,
      env: { ...process.env, HOME: path.join(dir, 'home') },
      timeout: 180000,
      stdio: 'inherit',
    });

    const en = JSON.parse(
      fs.readFileSync(
        path.join(dir, 'public/locales/en/translation.json'),
        'utf8'
      )
    );
    assert.deepStrictEqual(Object.keys(en), ['Inscribe a tu equipo', 'perfil']);
    assert.deepStrictEqual(Object.keys(en.perfil), ['editar', 'cerrar']);
    for (const text of [
      en['Inscribe a tu equipo'],
      en.perfil.editar,
      en.perfil.cerrar,
    ]) {
      assert.ok(typeof text === 'string' && text.length > 0);
    }
    assert.notStrictEqual(en.perfil.editar, 'Editar perfil');
  }
);
