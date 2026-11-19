/** Tests / tests/parameters.test.mjs: common parameter module in the 8.6 (ADR-001): adapter, domain constants, Python build rule. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASKETS_PER_FAMILY, DAILY_WORK_HOURS, FOOD_BUDGET_SHARE, MONTHLY_WORK_HOURS, NET_WAGE_FACTOR } from '../src/domain/BasketCalculator.js';
import { VendorParameters } from '../src/infrastructure/VendorParameters.js';
import { BASKET_DATA } from '../src/infrastructure/data/BasketData.js';
import { SOURCES_DATA } from '../src/infrastructure/data/SourcesData.js';

const parameters = new VendorParameters();
const PERIOD_END = '2026-09-30';
const root = new URL('..', import.meta.url);
const buildScript = fileURLToPath(new URL('scripts/build_data.py', root));
const casesFile = fileURLToPath(new URL('vendor/stk-gov/stk-gov-parametros-casos.json', root));
const python = spawnSync('python3', ['--version']).status === 0;

test('adaptador: valor, vigência, insumo e selo vêm do módulo comum', () => {
  assert.equal(parameters.value('salario_minimo', PERIOD_END), 1621);
  assert.equal(parameters.validity('salario_minimo', PERIOD_END).fonte.url.startsWith('https://'), true);
  assert.deepEqual(parameters.input('salario_minimo', PERIOD_END), { id: 'salario_minimo', valor: 1621, tipo: 'oficial', status: 'confirmado', periodo: '2026-01-01' });
  assert.equal(parameters.seal([parameters.input('salario_minimo', PERIOD_END)]), 'exato');
  assert.equal(parameters.seal([parameters.input('jornada_mensal_horas', PERIOD_END)]), 'estimativa', 'a-confirmar rebaixa o selo');
  assert.throws(() => parameters.value('nao_existe'), /desconhecido/);
});

test('constantes do domínio da cesta batem com os parâmetros (sem número duplicado divergente)', () => {
  assert.equal(NET_WAGE_FACTOR, parameters.value('dieese_fator_salario_liquido', PERIOD_END));
  assert.equal(MONTHLY_WORK_HOURS, parameters.value('jornada_mensal_horas', PERIOD_END));
  assert.equal(DAILY_WORK_HOURS, parameters.value('jornada_diaria_horas', PERIOD_END));
  assert.equal(BASKETS_PER_FAMILY, parameters.value('cestas_por_familia', PERIOD_END));
  assert.equal(FOOD_BUDGET_SHARE, parameters.value('participacao_alimentacao_orcamento', PERIOD_END));
});

test('salário mínimo dos dados gerados é o vigente na data do período da cesta, não o de hoje (RN-M01)', () => {
  assert.equal(BASKET_DATA.minimumWage, parameters.value('salario_minimo', PERIOD_END));
  assert.notEqual(BASKET_DATA.minimumWage, parameters.value('salario_minimo', '2025-09-30'), 'em set/2025 o mínimo era outro');
});

test('prova de origem registra os parâmetros que o build usou, com fonte e data', () => {
  const used = Object.fromEntries(SOURCES_DATA.parameters.map(p => [p.id, p]));
  assert.deepEqual(Object.keys(used).sort(), ['cestas_por_familia', 'dieese_fator_salario_liquido', 'jornada_mensal_horas', 'participacao_alimentacao_orcamento', 'salario_minimo']);
  assert.equal(used.salario_minimo.value, 1621);
  assert.equal(used.salario_minimo.status, 'confirmado');
  assert.ok(SOURCES_DATA.parameters.every(p => p.source && p.referenceDate && ['oficial', 'estimativa'].includes(p.kind)));
});

test('build_data.py não tem mais 0.925, 220, 0.3571 nem salário mínimo escritos à mão', () => {
  const code = readFileSync(buildScript, 'utf8').split('\n').filter(line => !line.trim().startsWith('#') && !line.trim().startsWith('"""'));
  const text = code.join('\n');
  assert.doesNotMatch(text, /0\.925|\b220\b|0\.3571|1621/);
});

test('build Python: casos de vigência compartilhados com o JS passam', { skip: !python }, () => {
  const result = spawnSync('python3', ['-I', '-c', `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('build_data', sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
cases = json.load(open(sys.argv[2], encoding='utf-8'))['casos']
m.check_vigencia_cases(cases)
m.load_parameters()
print(len(cases), m.MINIMUM_WAGE, m.NET_WAGE_FACTOR, m.MONTHLY_WORK_HOURS, m.BASKETS_PER_FAMILY, m.FOOD_BUDGET_SHARE)
`, buildScript, casesFile], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '8 1621.0 0.925 220 3 0.3571');
});

test('build Python: regra de vigência que diverge do JS para o build', { skip: !python }, () => {
  const result = spawnSync('python3', ['-I', '-c', `
import importlib.util, sys
spec = importlib.util.spec_from_file_location('build_data', sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
try:
    m.check_vigencia_cases([{'nome': 'caso errado', 'vigencias': [{'valor': 1, 'vigenteDesde': '2026-01-01', 'vigenteAte': None}], 'data': '2026-06-01', 'esperado': 2}])
except m.SourceError as error:
    print('PAROU:', error)
`, buildScript], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PAROU: Regra de vigência diverge do JS no caso "caso errado"/);
});

test('build Python: período sem vigência do parâmetro para o build (RN-M01)', { skip: !python }, () => {
  const result = spawnSync('python3', ['-I', '-c', `
import importlib.util, sys
spec = importlib.util.spec_from_file_location('build_data', sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.PERIOD_END = '2020-01-01'
try:
    m.load_parameters()
except m.SourceError as error:
    print('PAROU:', error)
`, buildScript], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PAROU: Parâmetro salario_minimo sem vigência em 2020-01-01/);
});
