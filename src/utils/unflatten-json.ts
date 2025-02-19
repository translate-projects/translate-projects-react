import { TypeJson } from 'translate-projects-core/types';

export const unflattenJson = (
  flattenedJson: TypeJson,
  separator: string = '.'
): TypeJson => {
  const result: TypeJson = {};

  for (const key in flattenedJson) {
    if (flattenedJson.hasOwnProperty(key)) {
      const value = flattenedJson[key];

      if (key.includes(' ')) {
        result[key] = value;
        continue;
      }

      const keys = key.split(separator);
      let current = result;

      keys.forEach((part, index) => {
        if (index === keys.length - 1) {
          current[part] = value;
        } else {
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      });
    }
  }

  return result;
};
