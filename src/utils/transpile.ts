import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import { TypeListLang } from 'translate-projects-core/types';
import { Logger } from 'translate-projects-core/utils';

export type TypeTranspileConfig = {
  sourceDir: string;
  outputDir: string;
  sourceLang: TypeListLang;
};

export const transpile = async ({
  sourceDir = './src',
  outputDir = './public/locales',
  sourceLang = 'en',
}: TypeTranspileConfig) => {
  // Results that will store the detected translation keys
  const translations: Record<string, string> = {};

  const regexTFunction =
    /(?:^|[\s\(\)\[\]\{\},;=!&|]|\.)\s*t\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*?)\1\s*(?:,\s*(?:\{[\s\S]*?\}|\[[\s\S]*?\]))?\s*\)/g;

  // Regular expression to capture content inside <Trans> tags, regardless of line breaks
  const regexTransComponent = /<Trans[^>]*>([\s\S]*?)<\/Trans>/g;

  // Regular expression to find <Trans> elements that have 'i18nKey'
  const regexTransWithKey =
    /<Trans[^>]*i18nKey=['"`]([^'`"]*)['"`][^>]*>([\s\S]*?)<\/Trans>/g;

  glob.sync(`${sourceDir}/**/*.{js,jsx,ts,tsx}`).forEach((file) => {
    // Skip if it's a directory
    if (fs.statSync(file).isDirectory()) return;

    const content = fs.readFileSync(file, 'utf-8');

    let match;
    // First, process t() function calls
    while ((match = regexTFunction.exec(content)) !== null) {
      let cleanKey = match[2].trim();

      // Filter very short keys, URLs, file paths, and technical strings
      const shouldSkip =
        cleanKey.length <= 2 || // Very short keys like "a", "-", ":"
        cleanKey.startsWith('/') || // URLs and paths
        cleanKey.startsWith('.') || // Relative paths and CSS classes
        cleanKey.includes('${') || // Template literals with variables
        (cleanKey.match(/^[a-z_]+$/) && cleanKey.length < 4) || // Very short technical variables
        cleanKey.match(/^\w+\.\w+/); // Module paths

      if (cleanKey && !translations[cleanKey] && !shouldSkip) {
        translations[cleanKey] = cleanKey;
      }
    }

    // First, process <Trans> elements with an explicit i18nKey
    while ((match = regexTransWithKey.exec(content)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/\s+/g, ' ');

      if (key && !translations[key]) {
        translations[key] = value || key;
      }
    }

    // Then, process other <Trans> elements that do NOT have an i18nKey
    while ((match = regexTransComponent.exec(content)) !== null) {
      const value = match[1].trim().replace(/\s+/g, ' ');

      // Only add if it's not already in the translations object as a value
      if (value && !Object.values(translations).includes(value)) {
        translations[value] = value;
      }
    }
  });

  const outputFilePath = path.join(outputDir, sourceLang, 'translation.json');

  // Make sure the language folder exists
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });

  fs.writeFileSync(outputFilePath, JSON.stringify(translations, null, 2));

  await Logger.success(
    `Translations extracted and saved to: ${outputFilePath}`
  );

  return translations;
};
