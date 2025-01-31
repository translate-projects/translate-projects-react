import { TypeJson } from "translate-projects-core/types";

export const flattenJson = (inputJson: TypeJson, parentKey: string = '', result: TypeJson = {}): TypeJson => {
    for (const key in inputJson) {
        if (inputJson.hasOwnProperty(key)) {
            const currentKey = parentKey ? `${parentKey}.${key}` : key;
            const value = inputJson[key];

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                flattenJson(value, currentKey, result);
            } else {
                result[currentKey] = value;
            }
        }
    }
    return result;
};