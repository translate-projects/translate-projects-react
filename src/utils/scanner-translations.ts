import { TypeListLang } from 'translate-projects-core/types';
import { Logger } from 'translate-projects-core/utils';
import { transpile } from './transpile';

type ScannerTranslationsOptions = {
  outputDir: string;
  sourceLang: TypeListLang;
  scanner: any;
};

// transpile() writes <outputDir>/<sourceLang>/translation.json itself
export const scannerTranslations = async ({
  outputDir,
  scanner,
  sourceLang,
}: ScannerTranslationsOptions) => {
  await Logger.info(`🔍 Scanning files for translation keys...\n`);

  return transpile({
    outputDir,
    sourceLang,
    sourceDir: typeof scanner === 'object' ? scanner.sourceDir : './src',
  });
};
