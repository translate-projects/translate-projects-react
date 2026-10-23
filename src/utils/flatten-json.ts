import { TypeJson } from 'translate-projects-core/types';

export const flattenJson = (
  inputJson: TypeJson,
  parentKey: string = '',
  result: TypeJson = {}
): TypeJson => {
  for (const key in inputJson) {
    if (inputJson.hasOwnProperty(key)) {
      const currentKey = parentKey ? `${parentKey}.${key}` : key;
      const value = inputJson[key];

      if (value === null || value === undefined) continue;

      // arrays flatten by index (list.0, list.1) like nested objects
      if (typeof value === 'object') {
        flattenJson(value, currentKey, result);
      } else {
        result[currentKey.trim()] = String(value).trim();
      }
    }
  }
  return result;
};
