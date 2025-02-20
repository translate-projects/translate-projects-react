export const compareKeysArrayLangs = (arr1: string[], arr2: string[]) => {
  const set2 = new Set(arr2);
  const missingInArr2 = arr1.filter((item) => !set2.has(item));

  return {
    areEqual: missingInArr2.length === 0,
    missingInArr2,
  };
};
