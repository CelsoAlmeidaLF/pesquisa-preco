/** Tests / tests/preferences.test.mjs: preferences stay valid and the wage is only kept on request. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PreferencesService } from '../src/application/PreferencesService.js';
import { LocalPreferencesStore } from '../src/infrastructure/LocalPreferencesStore.js';

function fakeStorage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), data };
}

function setup() {
  const storage = fakeStorage();
  const preferences = new PreferencesService({
    store: new LocalPreferencesStore({ storage }),
    isCapital: code => code === 3550308,
    wageRange: { min: 100, max: 1000000 },
  });
  return { storage, preferences };
}

test('capital escolhida volta na próxima leitura', () => {
  const { preferences } = setup();
  preferences.setPreferredCapital(3550308);
  assert.equal(preferences.preferredCapital(), 3550308);
  preferences.setPreferredCapital(null);
  assert.equal(preferences.preferredCapital(), null);
});

test('capital desconhecida não é gravada, e a gravada à mão é ignorada', () => {
  const { preferences, storage } = setup();
  preferences.setPreferredCapital(123);
  assert.equal(storage.data.size, 0);
  storage.setItem('pesquisa-preco.capital', '999');
  assert.equal(preferences.preferredCapital(), null);
});

test('renda não é guardada sem a pessoa pedir', () => {
  const { preferences, storage } = setup();
  preferences.saveWage(3000);
  assert.equal(storage.data.size, 0);
  assert.equal(preferences.rememberedWage(), null);
});

test('com a opção ligada, guarda o que está na tela e o que for digitado depois', () => {
  const { preferences } = setup();
  preferences.setRememberWage(true, 3000);
  assert.equal(preferences.rememberedWage(), 3000);
  preferences.saveWage(4500);
  assert.equal(preferences.rememberedWage(), 4500);
});

test('opção ligada com o campo vazio: guarda a primeira renda válida', () => {
  const { preferences } = setup();
  preferences.setRememberWage(true, Number.NaN);
  assert.equal(preferences.isRememberingWage(), true);
  assert.equal(preferences.rememberedWage(), null);
  preferences.saveWage(50);
  assert.equal(preferences.rememberedWage(), null);
  preferences.saveWage(2000);
  assert.equal(preferences.rememberedWage(), 2000);
});

test('desligar a opção apaga a renda', () => {
  const { preferences, storage } = setup();
  preferences.setRememberWage(true, 3000);
  preferences.setRememberWage(false);
  assert.equal(storage.data.size, 0);
  assert.equal(preferences.isRememberingWage(), false);
});

test('armazenamento bloqueado não derruba o app', () => {
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
  const preferences = new PreferencesService({
    store: new LocalPreferencesStore({ storage: quebrado }),
    isCapital: () => true,
    wageRange: { min: 100, max: 1000000 },
  });
  preferences.setRememberWage(true, 3000);
  assert.equal(preferences.rememberedWage(), null);
});
