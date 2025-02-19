import { TypeJson, TypeSimpleJson } from 'translate-projects-core/types';
import { generateHashText } from 'translate-projects-core/utils';

export const assignValuesFlatten = async (
  originalFlatten: TypeJson,
  apiResultJson: TypeSimpleJson
) => {
  const addvaluesFlatten: TypeJson = {};

  for (const key in originalFlatten) {
    const text_base = originalFlatten[key].trim();
    // generate key based on text
    let currentKey = await generateHashText(key);

    if ((await generateHashText(text_base)) !== currentKey) {
      // if key is not the same as text, add text to key
      currentKey = key;
    }

    const text = apiResultJson[currentKey];

    addvaluesFlatten[key] = text;
  }

  return addvaluesFlatten;
};
