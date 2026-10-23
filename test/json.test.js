const test = require('node:test');
const assert = require('node:assert');
const {
  assignValuesFlatten,
  compareKeysArrayLangs,
  flattenJson,
  unflattenJson,
} = require('../dist/utils');

test('flattenJson flattens nested objects and trims', () => {
  assert.deepStrictEqual(
    flattenJson({ a: { b: { c: ' hola ' } }, ' d ': 'x' }),
    { 'a.b.c': 'hola', d: 'x' }
  );
});

test('flattenJson does not crash on non-text values', () => {
  assert.deepStrictEqual(
    flattenJson({ n: 42, ok: true, nada: null, list: ['uno', 'dos'] }),
    { n: '42', ok: 'true', 'list.0': 'uno', 'list.1': 'dos' }
  );
});

test('round trip keeps nesting, dotted keys and arrays', () => {
  const original = {
    'v1.0': 'Versión 1.0',
    'Hola. ¿Qué tal?': 'Hola. ¿Qué tal?',
    torneo: { titulo: 'Torneo', reglas: ['Regla 1', 'Regla 2'] },
  };
  assert.deepStrictEqual(
    unflattenJson(flattenJson(original), '.', original),
    original
  );
});

test('unflattenJson without structure splits on dots, keeps keys with spaces', () => {
  assert.deepStrictEqual(unflattenJson({ 'a.b': '1', 'c d.e': '2' }), {
    a: { b: '1' },
    'c d.e': '2',
  });
});

test('unflattenJson with structure drops leaves that have no value', () => {
  assert.deepStrictEqual(
    unflattenJson({ 'a.b': 'B' }, '.', { a: { b: 'b', c: 'c' } }),
    { a: { b: 'B' } }
  );
});

test('assignValuesFlatten maps text keys by hash and path keys as they are', async () => {
  const { generateHashText } = require('translate-projects-core/utils');
  const original = { 'Hola mundo': 'Hola mundo', 'menu.inicio': 'Inicio' };
  const api = {
    [await generateHashText('Hola mundo')]: 'Hello world',
    'menu.inicio': 'Home',
  };
  assert.deepStrictEqual(await assignValuesFlatten(original, api), {
    'Hola mundo': 'Hello world',
    'menu.inicio': 'Home',
  });
});

test('compareKeysArrayLangs reports keys missing in the second array', () => {
  assert.deepStrictEqual(compareKeysArrayLangs(['a', 'b'], ['b', 'a', 'c']), {
    areEqual: true,
    missingInArr2: [],
  });
  assert.deepStrictEqual(compareKeysArrayLangs(['a', 'b'], ['a']), {
    areEqual: false,
    missingInArr2: ['b'],
  });
});
