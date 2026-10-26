# Translate Projects React

Translate the [i18next](https://www.i18next.com/) JSON files of your React app into other languages with one command. You write the texts in one language (for example `public/locales/es/translation.json`) and `translate-projects-react` creates `public/locales/en/translation.json`, `public/locales/fr/translation.json`, … with the same keys and structure, translated by [Translate Projects](https://translateprojects.dev).

📖 **Documentation:** [doc.translateprojects.dev/docs/frameworks-javascript/react](https://doc.translateprojects.dev/docs/frameworks-javascript/react)

- Runs as a Node.js script (locally or in CI); nothing is added to your app bundle.
- Optional **scanner**: collects the texts from `t('...')` and `<Trans>` in your code, so you don't have to write the source JSON by hand.
- **Cache**: only new or changed texts are sent; a run with no changes makes a single request.
- **Typed keys** (optional): `useTypedTranslation` makes TypeScript reject keys that don't exist.

## Requirements

- **Node.js 20 or newer** to run the translation script (`--env-file` needs 20.6+).
- A React app using **i18next** and **react-i18next** (the generated files are standard i18next JSON).
- A **Translate Projects** account with a project ([register](https://translateprojects.dev/accounts/register/)):
  - an **API token** of that project, created in the project's **Tokens API** page (_Crear Nuevo Token_);
  - an **AI provider, model and AI API key** set in the project's settings. Without them only texts the project or the network already know can be translated, and the rest come back missing (see [errors](#common-errors)).

## Installation

```bash
npm install translate-projects-react
# if your app does not have them yet:
npm install i18next react-i18next i18next-http-backend
```

## Quick start

### 1. Set `TRANSLATE_PROJECTS_API_KEY`

Put the project's API token in a `.env` file at the root of your app and keep that file out of git:

```bash
# .env
TRANSLATE_PROJECTS_API_KEY=your-project-api-token
```

```bash
echo ".env" >> .gitignore
```

`translateProject` reads `TRANSLATE_PROJECTS_API_KEY` from the environment when you don't pass `apiKey`. In CI, define it as a secret environment variable instead of a file.

### 2. Write the source texts

Create the file for your source language. Keys can be nested; the values are what gets translated:

```json
// public/locales/es/translation.json
{
  "Inscribe a tu equipo": "Inscribe a tu equipo",
  "torneo": {
    "titulo": "Torneo relámpago",
    "goles": "{{count}} goles"
  }
}
```

Or skip this step and enable the [scanner](#scanner).

### 3. Create the translation script

```js
// translate.mjs
import { translateProject } from 'translate-projects-react';

await translateProject({
  sourceLang: 'es',
  targetLangs: ['en', 'pt-BR', 'fr'],
  outputDir: './public/locales', // default
  // apiKey: '...',              // optional, defaults to TRANSLATE_PROJECTS_API_KEY
  // scanner: true,              // optional, see "Scanner"
});
```

Use the `.mjs` extension (or `import` in a project with `"type": "module"`, like Vite). If you prefer CommonJS, name it `translate.cjs` and use `const { translateProject } = require('translate-projects-react')`.

Add a script to `package.json`:

```json
{
  "scripts": {
    "translate": "node --env-file=.env translate.mjs"
  }
}
```

### 4. Run it

```bash
npm run translate
```

It exits with code **0** when every language was written and **1** if anything failed, so it can run in CI. The promise resolves to `true` or `false`; the library never calls `process.exit`.

### 5. Load the translations in React

```ts
// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: 'es',
    fallbackLng: 'es',
    ns: ['translation'],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
  });

export default i18n;
```

Import `./i18n` once in `src/main.tsx` and use `t()` or `<Trans>` in your components:

```tsx
import { Trans, useTranslation } from 'react-i18next';

export function Home() {
  const { t } = useTranslation();
  return (
    <>
      <h1>{t('torneo.titulo')}</h1>
      <Trans>Inscribe a tu equipo</Trans>
    </>
  );
}
```

## Options

| Option        | Type                               | Default                                  | Description                                                                                                                                                                                                         |
| ------------- | ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceLang`  | `string`                           | — (required)                             | Language your texts are written in, e.g. `'es'`. Its folder is `<outputDir>/<sourceLang>`.                                                                                                                          |
| `targetLangs` | `string[]`                         | — (required, non-empty)                  | Languages to generate, e.g. `['en', 'pt-BR', 'fr']`. Don't include `sourceLang`.                                                                                                                                    |
| `apiKey`      | `string`                           | `process.env.TRANSLATE_PROJECTS_API_KEY` | API token of your Translate Projects project.                                                                                                                                                                       |
| `outputDir`   | `string`                           | `'./public/locales'`                     | Folder that contains one subfolder per language. Relative to where you run the command.                                                                                                                             |
| `scanner`     | `boolean \| { sourceDir: string }` | `false`                                  | Build `<outputDir>/<sourceLang>/translation.json` from your code. `true` scans `./src`.                                                                                                                             |
| `force`       | `boolean`                          | `false`                                  | Ask the server for every language even if the cache says it is up to date (e.g. after fixing translations in the dashboard). Tip: `force: process.argv.includes('--force')` and run `npm run translate -- --force`. |

Language codes are the ones Translate Projects knows (`en`, `fr`, `de`, `pt-BR`, …). An unknown code fails with `El idioma de destino no existe`.

### Environment variables

| Variable                     | Description                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `TRANSLATE_PROJECTS_API_KEY` | API token used when `apiKey` is not passed.                                   |
| `TRANSLATE_PROJECTS_API_URL` | Other backend (staging, local). Default: `https://api.translateprojects.dev`. |

## Generated files

Every `.json` file inside `<outputDir>/<sourceLang>/`, subfolders included, gets a copy per target language at the same relative path:

```
public/locales/
├── es/                      ← source (you edit these)
│   ├── translation.json
│   └── admin/users.json
├── en/                      ← generated
│   ├── translation.json
│   └── admin/users.json
├── pt-BR/ …                 ← generated
└── fr/ …                    ← generated
```

- Same keys, same nesting, same order; only the values are translated. Interpolations such as `{{count}}` are kept.
- The files in the source folder are never modified (except `translation.json` when the scanner is on).
- Generated files are **rewritten on every run**. Don't edit them by hand; change the source text instead.
- If a language fails, its existing file is left as it was.

### Scanner

With `scanner: true` (or `scanner: { sourceDir: './app' }`), the script reads every `.js`, `.jsx`, `.ts` and `.tsx` file and writes the texts it finds to `<outputDir>/<sourceLang>/translation.json` before translating:

```jsx
t('Welcome to my app');                         // key and value: "Welcome to my app"
<Trans>Hello world</Trans>                      // key and value: "Hello world"
<Trans i18nKey="greeting">Hello world</Trans>   // key "greeting", value "Hello world"
```

- The text itself is the key, so `t('Welcome to my app')` works in the source language even before translating.
- Ignored: strings of 1–2 characters, paths and URLs (`/…`, `./…`), template literals with variables (``t(`Hi ${name}`)``) and module-like strings (`foo.bar`).
- `translation.json` is **replaced** on every run with what the scanner finds; put hand-written texts in another file of the same folder (e.g. `common.json`).

## Cache

Each run sends the API one request with a hash of every source file. Then:

| Situation                             | What happens                                                             |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Nothing changed                       | No upload, no translation. Generated files are rewritten from the cache. |
| A source file changed                 | Only that file is uploaded and translated again.                         |
| You added a language to `targetLangs` | Only the new language is requested.                                      |
| A language came back incomplete       | That language is requested again on the next run.                        |
| You deleted a generated file          | It is written again from the cache, without requests.                    |

Texts the project already translated are reused by the backend: only new texts reach the AI.

The local cache is a file per machine, grouped by the folder where you run the command (run it always from your app's root):

- Linux / macOS: `~/.config/translate-projects-core/cache.json`
- Windows: `%APPDATA%\translate-projects-core\cache.json`

**Force a full sync** by deleting that file:

```bash
rm ~/.config/translate-projects-core/cache.json
```

The next run uploads every file and downloads every language again. It does not re-translate texts the project already has; the backend returns the stored translations. In CI the cache usually starts empty, so each run does a full sync.

## Common errors

API errors are printed with their code and message (the message can be in your source language). Every failure ends the run with exit code 1; warnings alone don't.

| What you see                                                                                                                                                                  | Cause                                                                                    | Fix                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Error apiKey is required (set TRANSLATE_PROJECTS_API_KEY)`                                                                                                                   | The variable is not loaded.                                                              | Check `.env` and run with `node --env-file=.env …`, or export the variable / CI secret. No request is made.                                  |
| `API Error (401): UNAUTHORIZED: Token no válido`, then `Could not validate file changes with the API`                                                                         | Wrong, deleted or disabled token.                                                        | Copy an active token from the project's **Tokens API** page.                                                                                 |
| `Configura el modelo y la API key de IA del proyecto…` (warning), then `N text(s) came back without translation in en`, then `Translation failed for: en (…): N untranslated` | The project has no AI key (`MISSING_API_KEY`): only already known texts were translated. | Set the AI provider, model and API key in the project settings and run again; the missing texts are requested automatically.                 |
| `N text(s) came back without translation in fr (0 not in the previous file either)` (warning only, exit 0)                                                                    | Partial answer, but the previous file had those texts.                                   | Nothing: the earlier translations are kept. The language is requested again on the next run.                                                 |
| `Warning: Server unavailable (502, attempt 1/3). Retrying...`                                                                                                                 | Temporary backend error (429, 502, 503, 504, 524, network or 60 s timeout).              | Each request is tried up to 3 times. If it still fails you get `Translation failed for: fr (…)`; the other languages are written, run again. |
| `API Error (400): INVALID_INPUT: El idioma de destino no existe`, then `Translation failed for: xx (…)`                                                                       | Unknown code in `targetLangs`.                                                           | Use a supported code (`pt-BR`, not `pt_BR`).                                                                                                 |
| `LANGUAGE_DISABLED`                                                                                                                                                           | That language is disabled in the project.                                                | Enable it in the project or remove it from `targetLangs`.                                                                                    |
| `Invalid JSON file: public/locales/es/translation.json`                                                                                                                       | Syntax error in a source file.                                                           | Fix the JSON; nothing was overwritten.                                                                                                       |
| `Could not validate file changes with the API` with `fetch failed`                                                                                                            | No connection to `api.translateprojects.dev` (offline, proxy, DNS).                      | Check the network or `TRANSLATE_PROJECTS_API_URL`.                                                                                           |
| `No progress received in 300s, giving up`                                                                                                                                     | A task stayed queued in the backend.                                                     | Run again; finished languages are cached.                                                                                                    |
| `require is not defined in ES module scope`                                                                                                                                   | `require` in a `.js` file of a `"type": "module"` project.                               | Use `translate.mjs` with `import`, or rename the file to `translate.cjs`.                                                                    |

## Typed keys (optional)

```tsx
import { useTypedTranslation } from 'translate-projects-react/hooks';
import es from '../public/locales/es/translation.json';

const { t } = useTypedTranslation<typeof es>();

t('torneo.titulo'); // ✅ autocompleted
t('torneo.titel'); // ❌ TypeScript error
```

Needs `"resolveJsonModule": true` in `tsconfig.json`. `translate-projects-react/hooks` is an ES module meant for bundlers (Vite, Next.js, webpack), not for `require` in plain Node.

## Utilities

The helpers the script uses are exported from `translate-projects-react/utils` (`flattenJson`, `unflattenJson`, `transpile`, …):

```js
import { flattenJson, unflattenJson } from 'translate-projects-react/utils';

const json = { 'v1.0': 'Version 1.0', menu: { home: 'Home' } };
flattenJson(json); // { 'v1.0': 'Version 1.0', 'menu.home': 'Home' }
unflattenJson(flattenJson(json), '.', json); // back to the original shape
```

## Development

```bash
npm install
npm test   # builds, then runs node:test against a local mock of the API (no AI)
```

This package needs `translate-projects-core@^0.0.11`. Until that version is on npm, `npm install` fails with `notarget`; install against the local core instead:

```bash
npm install --no-save ../core
```

The tests cover extraction, sync, cache, subfolders, parallel languages and API errors (invalid token, 4xx/5xx, partial answers, tasks that never finish) against a local mock of the API. One more test uses the real backend and spends AI; it only runs when asked:

```bash
REAL_BACKEND=1 TRANSLATE_PROJECTS_API_KEY=... npm test
```

`npm publish` runs the build and the tests first (`prepublishOnly`).

## Support

If you have any questions, need help, or want to contribute, feel free to reach out:

- **Website**: [neiderruiz.com](https://neiderruiz.com)
- **GitHub**: [@neiderruiz](https://github.com/neiderruiz)
- **Twitter**: [@neiderruiz](https://x.com/neiderruiz_)
- **YouTube**: [Neider Ruiz](https://youtube.com/@neiderruiz)

## Support the Project

If you find this project useful, consider buying me a coffee to help me keep improving it. Your support means a lot! ☕

[![Buy me a coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=neiderruiz&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/neiderruiz)
