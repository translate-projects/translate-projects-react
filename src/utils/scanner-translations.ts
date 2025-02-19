import * as fs from 'fs';
import * as path from 'path';
import { TypeListLang } from 'translate-projects-core/types';
import { Logger } from 'translate-projects-core/utils';
import { transpile } from './transpile';

type ScannerTranslationsOptions = {
  outputDir: string;
  sourceLang: TypeListLang;
  scanner: any;
  folderLangBase: string;
};

export const scannerTranslations = async ({
  outputDir,
  scanner,
  sourceLang,
  folderLangBase,
}: ScannerTranslationsOptions) => {
  await Logger.info(`🔍 Scanning files for translation keys...\n`);

  const transpileResult = await transpile({
    outputDir,
    sourceLang,
    sourceDir: typeof scanner === 'object' ? scanner.sourceDir : './src',
  });

  if (!fs.existsSync(outputDir)) {
    await Logger.info(`📂 Creating output directory...\n`);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!fs.existsSync(folderLangBase)) {
    await Logger.info(
      `📂 **Creating folder for language ${sourceLang.toUpperCase()}...**\n`
    );
    fs.mkdirSync(folderLangBase, { recursive: true });
  }
  const file_save = path.join(folderLangBase, 'translation.json');

  fs.writeFileSync(file_save, JSON.stringify(transpileResult, null, 2));
};
