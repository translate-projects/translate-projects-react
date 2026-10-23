import { TypeJson } from 'translate-projects-core/types';

/**
 * Rebuilds nested JSON from flat keys.
 * Pass `structure` (the original nested JSON) to follow its exact shape: keys
 * that contain dots ("v1.0") and arrays come back as they were. Without it,
 * keys are split on `separator`.
 */
export const unflattenJson = (
  flattenedJson: TypeJson,
  separator: string = '.',
  structure?: TypeJson
): TypeJson => {
  if (structure) return rebuild(structure, flattenedJson, '');

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

// Same key building as flattenJson, so every leaf finds its flat value
const rebuild = (node: any, flat: TypeJson, parentKey: string): any => {
  const out: any = Array.isArray(node) ? [] : {};

  for (const key in node) {
    if (!node.hasOwnProperty(key)) continue;
    const value = node[key];
    if (value === null || value === undefined) continue;

    const currentKey = parentKey ? `${parentKey}.${key}` : key;

    if (typeof value === 'object') {
      out[key] = rebuild(value, flat, currentKey);
    } else if (flat[currentKey.trim()] !== undefined) {
      out[key] = flat[currentKey.trim()];
    }
  }

  return out;
};
