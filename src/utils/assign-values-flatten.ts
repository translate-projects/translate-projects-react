import { TypeJson, TypeSimpleJson } from "translate-projects-core/types";
import { generateHashText } from "translate-projects-core/utils";

export const assignValuesFlatten = async (jsonFlatten: TypeJson, data: TypeSimpleJson) => {

    const addvaluesFlatten: TypeJson = {};
    for (const key in jsonFlatten) {
        if (data[await generateHashText(jsonFlatten[key])]) {
            addvaluesFlatten[key] = data[await generateHashText(jsonFlatten[key])];
        }
    }

    return addvaluesFlatten;

};  