import * as fs from "fs";
import { getTranslationsApi } from "translate-projects-core";
import { generateHashText } from "translate-projects-core/utils";
import { ConfigOptions } from "../types";
import { assignValuesFlatten } from "./assign-values-flatten";
import { countTranslations } from "./count-translations";
import { flattenJson } from "./flatten-json";
import { transpile } from "./transpile";
import { unflattenJson } from "./unflatten-json";

export const translateProject = async ({
  targetLangs,
  jsonBase,
  sourceLang,
  apiKey,
  outputDir = './public/locales',
  scanner = false,
}: ConfigOptions) => {

  console.log(`\n🌍🚀 **Starting translation process...**\n`);

  let jsonBaseList = jsonBase;

  if (scanner) {
    console.log(`🔍 **Scanning files for translation keys...**\n`);
    jsonBaseList = await transpile({
      outputDir,
      sourceLang,
      sourceDir: typeof scanner === 'object' ? scanner.sourceDir : './src'
    });
  }
  if (!jsonBaseList) {
    console.log("🚨 Don't forget to add your translation base or enable the scanner");
    console.log(`
      # Import your translation base
      import en from '../public/locales/en/translation.json' assert { type: 'json' };

      translateProject({
          jsonBase: en,
          scanner: false,
          sourceLang: 'es',
          targetLangs: ['es', 'en'],
          apiKey: 'your-api-key',
      });  
    `);

    return;
  }

  console.log(`📦 **Loading translation data...**\n`);

  try {
    const totalTranslations = targetLangs?.length || 0;
    console.log(`✅ **Total languages to translate:** ${totalTranslations}\n`);

    const totalEntries = countTranslations(jsonBaseList);
    console.log(`📄 **Total entries in the source file (${sourceLang}.json):** ${totalEntries}\n`);

    const jsonFlatten = flattenJson(jsonBaseList);
    const jsonSend: any = {};

    console.log(`🔑 **Generating unique identifiers for each entry...**\n`);
    for (const key in jsonFlatten) {
      jsonSend[await generateHashText(jsonFlatten[key])] = jsonFlatten[key];
    }

    for (const language of targetLangs || []) {
      if (language === sourceLang) continue;

      console.log(`🌎 **Processing language:** ${language.toUpperCase()} \n`);

      const data = await getTranslationsApi({
        data: jsonSend,
        sourceLang,
        targetLang: language,
        typeProject: 'react',
        apiKey: apiKey,
        route_file: `translation.json`
      });

      // Create output directories if they don't exist
      if (!fs.existsSync(outputDir)) {
        console.log(`📂 **Creating output directory...**\n`);
        fs.mkdirSync(outputDir, { recursive: true });
      }

      if (!fs.existsSync(`${outputDir}/${language}`)) {
        console.log(`📂 **Creating folder for language ${language.toUpperCase()}...**\n`);
        fs.mkdirSync(`${outputDir}/${language}`, { recursive: true });
      }

      const addvaluesFlatten = await assignValuesFlatten(jsonFlatten, data);

      const dataSave = unflattenJson(addvaluesFlatten);

      fs.writeFileSync(
        `${outputDir}/${language}/translation.json`,
        JSON.stringify(dataSave, null, 2)
      );

      console.log(`✅ **Translation completed:** ${language.toUpperCase()} 📄 -> 📁 \`${outputDir}/${language}/translation.json\`\n`);
    }

    console.log(`🎉 **Translation process successfully completed.** 🚀🎯\n`);

  } catch (error: any) {
    console.error(`\n🛑 **Error:** ${error.message}`);
    console.error("⏳ A timeout error has occurred. We are working to resolve it. Please try again later.\n");
  }
};
