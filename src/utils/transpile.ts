import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import { TypeListLang } from "translate-projects-core/types";

export type TypeTranspileConfig = {
    sourceDir: string;
    outputDir: string;
    sourceLang: TypeListLang;
};

export const transpile = async ({
    sourceDir = './src',
    outputDir = './public/locales',
    sourceLang = 'en'
}: TypeTranspileConfig) => {
    // Results that will store the detected translation keys
    const translations: Record<string, string> = {};

    // Regular expression to capture `t()` function calls, including line breaks
    const regexTFunction = /t\(\s*(['"`])([\s\S]*?)\1\s*(?:,\s*(?:\{[\s\S]*?\}|\[[\s\S]*?\]))?\)/g;

    // Regular expression to capture content inside <Trans> tags, regardless of line breaks
    const regexTransComponent = /<Trans[^>]*>([\s\S]*?)<\/Trans>/g;

    // Regular expression to find <Trans> elements that have 'i18nKey'
    const regexTransWithKey = /<Trans[^>]*i18nKey=['"`]([^'`"]*)['"`][^>]*>([\s\S]*?)<\/Trans>/g;

    glob.sync(`${sourceDir}/**/*.{js,jsx,ts,tsx}`).forEach(async (file) => {
        const content = fs.readFileSync(file, 'utf-8');

        let match;
        // First, process t() function calls
        while ((match = regexTFunction.exec(content)) !== null) {
            let cleanKey = match[2].trim();

            if (cleanKey && !translations[cleanKey]) {
                translations[cleanKey] = cleanKey;
            }
        }

        // First, process <Trans> elements with an explicit i18nKey
        while ((match = regexTransWithKey.exec(content)) !== null) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/\s+/g, " ");

            if (key && !translations[key]) {
                translations[key] = value || key;
            }
        }

        // Then, process other <Trans> elements that do NOT have an i18nKey
        while ((match = regexTransComponent.exec(content)) !== null) {
            const value = match[1].trim().replace(/\s+/g, " ");

            // Only add if it's not already in the translations object as a value
            if (value && !Object.values(translations).includes(value)) {
                translations[value] = value;
            }
        }
    });

    // Make sure the output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFilePath = path.join(outputDir, `${sourceLang}/translation.json`);

    fs.writeFileSync(outputFilePath, JSON.stringify(translations, null, 2));
    console.log(`✅ Translations extracted and saved to: ${outputFilePath}`);

    return translations;
};
