import { validateChangesFiles } from 'translate-projects-core';
import { FilePathData, TypeListLang } from 'translate-projects-core/types';
import {
  assignHashKeysJson,
  Logger,
  readJsonFile,
  syncResources,
  updateFileCache,
} from 'translate-projects-core/utils';
import { flattenJson } from './flatten-json';

type SyncResourcesTranslateOptions = {
  apiKey: string;
  filesCache: Record<string, string>;
  filesPath: Record<string, FilePathData>;
  sourceLang: TypeListLang;
};

export const syncResourcesTranslate = async ({
  apiKey,
  filesCache,
  filesPath,
  sourceLang,
}: SyncResourcesTranslateOptions) => {
  const result = await validateChangesFiles({
    apiKey,
    data: filesCache,
  });

  if (!result) {
    throw new Error('Could not validate file changes with the API');
  }

  const changed = result.data ?? {};

  for (const fileHash of Object.keys(filesPath)) {
    filesPath[fileHash].in_cache = Boolean(!changed[fileHash]);
  }

  // sycn files data
  const items = Object.entries(filesPath);

  for (const [key, item] of items) {
    // if any file in cache
    if (item.in_cache && Object.keys(item.sources).length) {
      continue;
    }

    const json = readJsonFile(item.path);
    if (!json) throw new Error(`Invalid JSON file: ${item.path}`);

    const jsonData = flattenJson(json);

    const jsonFlatten = await assignHashKeysJson(jsonData);

    if (!Object.keys(jsonFlatten).length) {
      await Logger.info(`❌ No se encontraron claves en ${item.path}. \n`);
      continue;
    }

    await Logger.info(
      `🔄 Syncing (${Object.keys(jsonFlatten).length}) - ${item.path}... \n`
    );

    const synced = await syncResources({
      sourceLang,
      data: jsonFlatten,
      typeProject: 'react',
      apiKey,
      route_file: item.path,
      cache_hash: item.cache_hash,
    });

    // syncResources returns null when the API or the task fails
    if (synced === null) {
      throw new Error(`Could not sync sources of ${item.path}`);
    }

    await updateFileCache({
      fileHash: key,
      sources: jsonFlatten,
    });
  }
};
