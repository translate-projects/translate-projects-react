import * as fs from 'fs';
import * as path from 'path';
import { FilePathData, TypeListLang } from 'translate-projects-core/types';
import {
  assignHashKeysJson,
  Logger,
  makeTranslations,
  readJsonFile,
  updateFileCache,
} from 'translate-projects-core/utils';
import { assignValuesFlatten } from './assign-values-flatten';
import { compareKeysArrayLangs } from './compare-keys-array-langs';
import { flattenJson } from './flatten-json';
import { unflattenJson } from './unflatten-json';

type SyncTranslationsLangOptions = {
  apiKey: string;
  filesCache: Record<string, string>;
  filesPath: Record<string, FilePathData>;
  sourceLang: TypeListLang;
  targetLangs: TypeListLang[];
  outputDir: string;
};

export const syncTranslationsLangs = async ({
  filesPath,
  targetLangs,
  sourceLang,
  apiKey,
  outputDir,
}: SyncTranslationsLangOptions) => {
  const items = Object.entries(filesPath);

  // end sycn files data
  for (const [key, item] of items) {
    const json_base = readJsonFile(item.path);
    const jsonData = flattenJson(json_base);

    const jsonFlatten = await assignHashKeysJson(jsonData);

    for (const locale of targetLangs) {
      let translations: any = {};
      if (locale === sourceLang) {
        translations = item.sources;

        await updateFileCache({
          fileHash: key,
          translations: { [locale]: translations },
        });
      }

      if (sourceLang !== locale) {
        const { areEqual } = compareKeysArrayLangs(
          Object.keys(jsonFlatten ?? {}),
          Object.keys(item.translations[locale] ?? {})
        );

        if (item.translations[locale] && item.in_cache && areEqual) {
          if (Object.keys(item.translations[locale]).length) {
            translations = item.translations[locale];
          }
        }

        if (!item.translations[locale] || !item.in_cache || !areEqual) {
          if (Object.keys(jsonFlatten).length) {
            await Logger.info(`Syncing translations (${locale}) ... \n`);

            translations = await makeTranslations({
              sourceLang,
              targetLang: locale,
              apiKey,
              route_file: item.path,
              cache_hash: item.cache_hash,
            });

            await updateFileCache({
              fileHash: key,
              translations: { [locale]: translations },
            });
          }
        }
      }
      const folderLang = path.join(outputDir, locale);

      if (!fs.existsSync(folderLang)) {
        await Logger.info(`📂 Creating output directory... \n`);
        fs.mkdirSync(folderLang, { recursive: true });
      }

      const addvaluesFlatten = await assignValuesFlatten(
        jsonData,
        translations
      );

      const dataSave = unflattenJson(addvaluesFlatten);

      const itemPath = path.basename(item.path);

      const outputFilePath = path.join(folderLang, itemPath);

      fs.writeFileSync(outputFilePath, JSON.stringify(dataSave, null, 2));

      await Logger.success(
        `Translation completed: ${locale.toUpperCase()} 📄 -> 📁 \`${outputFilePath}\`\n`
      );
    }
  }
};
