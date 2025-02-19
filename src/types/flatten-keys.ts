export type FlattenKeys<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${FlattenKeys<T[K]>}`;
    }[keyof T & string]
  : '';
