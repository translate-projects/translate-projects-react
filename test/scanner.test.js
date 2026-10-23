const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { transpile, scannerTranslations } = require('../dist/utils');

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-react-scan-'));
  const src = path.join(dir, 'src');
  fs.mkdirSync(path.join(src, 'components'), { recursive: true });
  fs.writeFileSync(
    path.join(src, 'App.tsx'),
    `export const App = () => (
      <div title={t("Bienvenido a Playfut")}>
        {t('Inscribe a tu equipo')}
        {t('a')}
        {t('/ruta/archivo')}
        {t(\`Hola \${name}\`)}
        <Trans>Juega   con
          tus amigos</Trans>
        <Trans i18nKey="perfil.editar">Editar perfil</Trans>
      </div>
    );`
  );
  fs.writeFileSync(
    path.join(src, 'components', 'Menu.jsx'),
    `const items = [t('Cerrar sesión', { count: 1 })];`
  );
  return { dir, src, out: path.join(dir, 'public', 'locales') };
};

const expected = {
  'Bienvenido a Playfut': 'Bienvenido a Playfut',
  'Inscribe a tu equipo': 'Inscribe a tu equipo',
  'Cerrar sesión': 'Cerrar sesión',
  'perfil.editar': 'Editar perfil',
  'Juega con tus amigos': 'Juega con tus amigos',
};

test('transpile extracts t() and <Trans> keys into the language folder', async () => {
  const { src, out } = setup();
  const result = await transpile({
    sourceDir: src,
    outputDir: out,
    sourceLang: 'es',
  });
  assert.deepStrictEqual(result, expected);
  const file = JSON.parse(
    fs.readFileSync(path.join(out, 'es', 'translation.json'), 'utf8')
  );
  assert.deepStrictEqual(file, expected);
});

test('scannerTranslations scans scanner.sourceDir and returns the keys', async () => {
  const { src, out } = setup();
  const result = await scannerTranslations({
    outputDir: out,
    sourceLang: 'es',
    scanner: { sourceDir: src },
  });
  assert.deepStrictEqual(result, expected);
  assert.ok(fs.existsSync(path.join(out, 'es', 'translation.json')));
});
