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
  apiKey: string;
  scanner?:
    | {
        sourceDir: string;
      }
    | boolean;
};

export const translateProject = async ({
  targetLangs,
  sourceLang,
  apiKey,
  outputDir = './public/locales',
  scanner = false,
}: TranslateProjectOptions) => {
  if (!sourceLang) {
    await Logger.error(`Error sourceLang is required`);
    return;
  }

  await Logger.success(`🚀 Starting translation process...\n`);

  const folderLangBase = path.join(outputDir, sourceLang);

  if (!fs.existsSync(folderLangBase)) {
    await Logger.info(
      `📂 Creating folder for language ${sourceLang.toUpperCase()}...**\n`
    );
    fs.mkdirSync(folderLangBase, { recursive: true });
  }

  if (scanner) {
    await scannerTranslations({
      folderLangBase,
      outputDir,
      scanner,
      sourceLang,
    });
  }

  await Logger.info(`Loading translation data...\n`);

  try {
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

    process.exit(0);
  } catch (error: any) {
    Logger.error(`\n🛑 **Error:** ${error.message}`);
    Logger.error(
      '⏳ A timeout error has occurred. We are working to resolve it. Please try again later.\n'
    );
  }
};
