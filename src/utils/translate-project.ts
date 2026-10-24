import * as fs from 'fs';
import * as path from 'path';
import { TypeListLang } from 'translate-projects-core/types';
import { Logger, processDirectoryCache } from 'translate-projects-core/utils';
import { scannerTranslations } from './scanner-translations';
import { syncResourcesTranslate } from './sync-resources-translate';
import { syncTranslationsLangs } from './sync-translations-langs';

export type TranslateProjectOptions = {
  outputDir: string;
  sourceLang: TypeListLang;
  targetLangs: TypeListLang[];
  /** defaults to the TRANSLATE_PROJECTS_API_KEY environment variable */
  apiKey?: string;
  scanner?:
    | {
        sourceDir: string;
      }
    | boolean;
};

export const translateProject = async ({
  targetLangs,
  sourceLang,
  apiKey = process.env.TRANSLATE_PROJECTS_API_KEY,
  outputDir = './public/locales',
  scanner = false,
}: TranslateProjectOptions) => {
  const invalid = !sourceLang
    ? 'sourceLang is required'
    : !apiKey
      ? 'apiKey is required (set TRANSLATE_PROJECTS_API_KEY)'
      : !Array.isArray(targetLangs) || !targetLangs.length
        ? 'targetLangs must be a non-empty array'
        : null;

  if (invalid || !apiKey) {
    await Logger.error(`Error ${invalid}`);
    process.exitCode = 1;
    return false;
  }

  await Logger.success(`🚀 Starting translation process...\n`);

  const folderLangBase = path.join(outputDir, sourceLang);

  if (!fs.existsSync(folderLangBase)) {
    await Logger.info(
      `📂 Creating folder for language ${sourceLang.toUpperCase()}...**\n`
    );
    fs.mkdirSync(folderLangBase, { recursive: true });
  }

  try {
    if (scanner) {
      await scannerTranslations({
        outputDir,
        scanner,
        sourceLang,
      });
    }

    await Logger.info(`Loading translation data...\n`);

    const { filesCache, filesPath } = await processDirectoryCache({
      dir: folderLangBase,
      allowedExtensions: ['.json'], // only process .json files
    });

    const totalTranslations = targetLangs?.length || 0;

    await Logger.success(
      `Total languages to translate: ${totalTranslations}\n`
    );
    // get all translations and sync resources
    await syncResourcesTranslate({
      apiKey,
      filesCache,
      filesPath,
      sourceLang,
    });

    await syncTranslationsLangs({
      apiKey,
      filesCache,
      filesPath,
      outputDir,
      sourceLang,
      targetLangs,
    });

    return true;
  } catch (error: any) {
    await Logger.error(`\n🛑 **Error:** ${error?.message ?? error}\n`);
    // non-zero exit for CI, without killing the caller's process
    process.exitCode = 1;
    return false;
  }
};
