import {
  JsonBase,
  TypeListLang,
  TypeProject,
} from 'translate-projects-core/types';

export type ConfigOptions = {
  jsonBase: JsonBase;
  outputDir: string;
  sourceLang: TypeListLang;
  targetLangs: TypeListLang[];
  apiKey?: string;
  typeProject: TypeProject;
  scanner?:
    | {
        sourceDir: string;
      }
    | boolean;
};
