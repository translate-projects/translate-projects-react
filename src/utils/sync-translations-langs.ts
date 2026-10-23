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

// shortcut: fixed limit; the backend queues tasks (worker concurrency=1) and a
// queued task gets no progress for up to 120 s, so keep it low until that changes
const MAX_PARALLEL_LANGS = 3;

const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
};

export const syncTranslationsLangs = async ({
  filesPath,
  targetLangs,
  sourceLang,
  apiKey,
  outputDir,
}: SyncTranslationsLangOptions) => {
  const items = Object.entries(filesPath);
  const failed: string[] = [];

  for (const [key, item] of items) {
    const json_base = readJsonFile(item.path);
    if (!json_base) throw new Error(`Invalid JSON file: ${item.path}`);

    const jsonData = flattenJson(json_base);

    const jsonFlatten = await assignHashKeysJson(jsonData);

    const isCached = (locale: TypeListLang) =>
      Boolean(item.translations[locale]) &&
      Boolean(item.in_cache) &&
      compareKeysArrayLangs(
        Object.keys(jsonFlatten ?? {}),
        Object.keys(item.translations[locale] ?? {})
      ).areEqual;

    const toFetch = Object.keys(jsonFlatten).length
      ? targetLangs.filter((l) => l !== sourceLang && !isCached(l))
      : [];

    // translation tasks run in parallel, cache and file writes stay sequential
    const fetched = await mapLimit(
      toFetch,
      MAX_PARALLEL_LANGS,
      async (locale) => {
        await Logger.info(`Syncing translations (${locale}) ... \n`);
        return makeTranslations({
          sourceLang,
          targetLang: locale,
          apiKey,
          route_file: item.path,
          cache_hash: item.cache_hash,
        });
      }
    );

    for (const locale of targetLangs) {
      let translations: any = {};

      if (locale === sourceLang) {
        translations = item.sources;
      } else if (toFetch.includes(locale)) {
        translations = fetched[toFetch.indexOf(locale)];
        // makeTranslations returns null when the API or the task fails
        if (translations === null) {
          failed.push(`${locale} (${item.path})`);
          continue;
        }
      } else if (Object.keys(item.translations[locale] ?? {}).length) {
        translations = item.translations[locale];
      }

      if (locale === sourceLang || toFetch.includes(locale)) {
        await updateFileCache({
          fileHash: key,
          translations: { [locale]: translations },
        });
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

      const dataSave = unflattenJson(addvaluesFlatten, '.', json_base);

      const itemPath = path.basename(item.path);

      const outputFilePath = path.join(folderLang, itemPath);

      fs.writeFileSync(outputFilePath, JSON.stringify(dataSave, null, 2));

      await Logger.success(
        `Translation completed: ${locale.toUpperCase()} 📄 -> 📁 \`${outputFilePath}\`\n`
      );
    }
  }

  if (failed.length) {
    throw new Error(`Translation failed for: ${failed.join(', ')}`);
  }
};
