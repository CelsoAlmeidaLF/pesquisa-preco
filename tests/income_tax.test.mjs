/** Tests / tests/income_tax.test.mjs: IRPF table lag and tax chain (spec novos-calculos-macro 3.3, cases validated by Daniel on 19/11/2026). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bracketLag, compareWithCorrectedTable, correctedBands, grossForBase, monthlyTax, reduction2026, roundCents, socialSecurity } from '../src/domain/IncomeTaxCalculator.js';
import { PriceMonitorService } from '../src/application/PriceMonitorService.js';
import { VendorParameters } from '../src/infrastructure/VendorParameters.js';
import { BASKET_DATA } from '../src/infrastructure/data/BasketData.js';
import { REAL_ESTATE_DATA } from '../src/infrastructure/data/RealEstateData.js';

const parameters = new VendorParameters();
const ON = '2026-06-01'; // law in force: Lei 15.191 table and Lei 15.270 reduction
const law = parameters.value('tabela_irpf_mensal', ON);
const inssBands = parameters.value('tabela_inss_empregado', ON).faixas;
const cents = value => Math.round(value * 100);
const service = new PriceMonitorService({ basket: BASKET_DATA, realEstate: REAL_ESTATE_DATA, municipalities: [], sources: { files: [] } });

// Fictitious table of the spec (tests the algorithm without depending on the legal values)
const FICTITIOUS = [{ ate: 2000, aliquota: 0, deduzir: 0 }, { ate: 3000, aliquota: 0.10, deduzir: 200 }, { ate: null, aliquota: 0.20, deduzir: 500 }];

test('monthlyTax: casos T1 a T4 da spec com a tabela fictícia', () => {
  assert.equal(monthlyTax(1500, FICTITIOUS).tax, 0);
  assert.equal(monthlyTax(2500, FICTITIOUS).tax, 50);
  assert.equal(monthlyTax(4000, FICTITIOUS).tax, 300);
  assert.deepEqual([monthlyTax(1500, FICTITIOUS).bracket, monthlyTax(2500, FICTITIOUS).bracket, monthlyTax(4000, FICTITIOUS).bracket], [0, 1, 2]);
});

test('monthlyTax: T3, na fronteira as duas faixas dão o mesmo (continuidade)', () => {
  assert.equal(monthlyTax(3000, FICTITIOUS).tax, 100);
  assert.equal(3000 * FICTITIOUS[2].aliquota - FICTITIOUS[2].deduzir, 100);
});

test('monthlyTax: T5, base negativa e entradas inválidas lançam RangeError', () => {
  assert.throws(() => monthlyTax(-1, FICTITIOUS), RangeError);
  assert.throws(() => monthlyTax(Number.NaN, FICTITIOUS), RangeError);
  assert.throws(() => monthlyTax(Infinity, FICTITIOUS), RangeError);
  assert.throws(() => monthlyTax('100', FICTITIOUS), RangeError);
  assert.throws(() => monthlyTax(100, []), RangeError);
  assert.throws(() => monthlyTax(5000, [{ ate: 2000, aliquota: 0, deduzir: 0 }]), RangeError, 'sem faixa aberta no fim');
});

test('monthlyTax: o imposto nunca fica negativo e a tabela real é contínua nos limites', () => {
  assert.equal(monthlyTax(0, law.faixas).tax, 0);
  for (let i = 1; i < law.faixas.length; i++) {
    const limit = law.faixas[i - 1].ate;
    const below = monthlyTax(limit, law.faixas).tax;
    const above = monthlyTax(limit + 0.001, law.faixas).tax;
    assert.ok(Math.abs(above - below) < 0.01, `limite ${limit}: ${below} x ${above}`);
  }
});

test('bracketLag: T6, inflação 1,5, correção 1,2 e isenção 2.000 dão defasagem de 25% e isenção de 2.500', () => {
  const { valor, formulaExata, avisos } = bracketLag({ inflationFactor: 1.5, correctionFactor: 1.2, exemptionLimit: 2000 });
  assert.ok(Math.abs(valor.lagPct - 25) < 1e-9);
  assert.ok(Math.abs(valor.correctedExemption - 2500) < 1e-9);
  assert.ok(Math.abs(valor.factor - 1.25) < 1e-12);
  assert.equal(formulaExata, true);
  assert.deepEqual(avisos, []);
});

test('bracketLag: correção igual à inflação não deixa defasagem; fatores inválidos lançam RangeError', () => {
  assert.equal(bracketLag({ inflationFactor: 2, correctionFactor: 2, exemptionLimit: 100 }).valor.lagPct, 0);
  for (const args of [{ inflationFactor: 0, correctionFactor: 1, exemptionLimit: 1 }, { inflationFactor: 1, correctionFactor: -1, exemptionLimit: 1 },
    { inflationFactor: Number.NaN, correctionFactor: 1, exemptionLimit: 1 }, { inflationFactor: 1, correctionFactor: 1, exemptionLimit: 0 }]) {
    assert.throws(() => bracketLag(args), RangeError);
  }
});

test('socialSecurity: progressivo, arredonda só no total e para no teto', () => {
  assert.equal(cents(socialSecurity(2000, inssBands)), 15569);
  assert.equal(cents(socialSecurity(6000, inssBands)), 64151);
  assert.equal(cents(socialSecurity(10000, inssBands)), 98809);
  assert.equal(socialSecurity(10000, inssBands), socialSecurity(8475.55, inssBands), 'acima do teto não cobra mais');
  assert.equal(socialSecurity(0, inssBands), 0);
  assert.throws(() => socialSecurity(-1, inssBands), RangeError);
});

test('reduction2026: zera o imposto até R$ 5.000 brutos, decai até R$ 7.350 e some depois', () => {
  const rule = law.reducao;
  assert.equal(reduction2026(5000, 312.89, rule), 312.89);
  assert.equal(reduction2026(3000, 50, rule), 50);
  assert.ok(Math.abs(reduction2026(6000, 564.85, rule) - 179.75) < 0.0005, 'exemplo da Receita: 978,62 − 0,133145 × 6.000 = 179,75');
  assert.equal(reduction2026(6000, 100, rule), 100, 'nunca maior que o imposto');
  assert.ok(reduction2026(7350, 884.13, rule) < 0.01);
  assert.equal(reduction2026(7350.01, 884.13, rule), 0);
  assert.throws(() => reduction2026(-1, 0, rule), RangeError);
  assert.throws(() => reduction2026(1000, -1, rule), RangeError);
});

test('tabela corrigida: limites e parcelas multiplicados pelo fator, ao centavo (valores do Daniel)', () => {
  const index = parameters.value('ipca_numero_indice', ON);
  const exemption = parameters.value('irpf_isencao_mensal', ON);
  const lag = bracketLag({ inflationFactor: index['2025-12'] / index['1995-12'], correctionFactor: exemption / parameters.value('irpf_isencao_mensal', '1996-01-01'), exemptionLimit: exemption });
  assert.ok(Math.abs(lag.valor.lagPct - 120.48) < 0.005, `defasagem ${lag.valor.lagPct}`);
  assert.equal(roundCents(lag.valor.correctedExemption), 5355.09);
  const corrected = correctedBands(law.faixas, lag.valor.factor);
  assert.deepEqual(corrected.map(b => b.ate), [5355.09, 6232.28, 8270.42, 10284.82, null]);
  assert.deepEqual(corrected.map(b => b.deduzir), [0, 401.63, 869.06, 1489.34, 2003.59]);
  assert.deepEqual(corrected.map(b => b.aliquota), law.faixas.map(b => b.aliquota));
  assert.throws(() => correctedBands(law.faixas, 0), RangeError);
});

// T7 (official): Daniel's cases, in cents: [gross, inss, base, tax 2026, corrected tax, monthly difference, annual difference]
const OFFICIAL_CASES = [
  [200000, 15569, 139280, 0, 0, 0, 0],
  [400000, 36860, 339280, 0, 0, 0, 0],
  [500000, 50151, 439280, 0, 0, 0, 0],
  [600000, 64151, 535849, 38510, 26, 38484, 461808],
  [735000, 83051, 651949, 88413, 10886, 77527, 930324],
  [1000000, 98809, 901191, 156955, 53834, 103121, 1237452],
  [2000000, 98809, 1901191, 431955, 322469, 109486, 1313832],
];

for (const [gross, inss, base, tax2026, correctedTax, monthly, annual] of OFFICIAL_CASES) {
  test(`T7 oficial: salário bruto de R$ ${gross / 100} confere com a conta do Daniel`, () => {
    const { personal } = service.incomeTaxLag({ grossIncome: gross / 100, untilMonth: '2025-12', on: ON });
    const v = personal.valor;
    assert.deepEqual([cents(v.inss), cents(v.base), cents(v.tax2026), cents(v.correctedTax), cents(v.monthlyDifference), cents(v.annualDifference)],
      [inss, base, tax2026, correctedTax, monthly, annual]);
  });
}

test('salário abaixo do desconto simplificado tem base zero e não paga nada', () => {
  const chain = compareWithCorrectedTable({ grossIncome: 300, law, inssBands, lagFactor: 2.2 });
  assert.deepEqual([chain.deduction, chain.base, chain.tax2026, chain.correctedTax, chain.monthlyDifference], [300, 0, 0, 0, 0]);
});

test('T7: até R$ 5.000 a base usa o desconto simplificado; de R$ 6.000 em diante, o INSS', () => {
  const chain = gross => compareWithCorrectedTable({ grossIncome: gross, law, inssBands, lagFactor: 2.2 });
  assert.equal(chain(2000).usesSimplifiedDiscount, true);
  assert.equal(chain(5000).deduction, 607.20);
  assert.equal(chain(6000).usesSimplifiedDiscount, false);
  assert.equal(chain(6000).deduction, 641.51);
  assert.throws(() => chain(-1), RangeError);
});

test('o exemplo da Receita (R$ 6.000): imposto pela tabela 564,85, redução 179,75, imposto 385,10', () => {
  const { personal } = service.incomeTaxLag({ grossIncome: 6000, on: ON });
  assert.deepEqual([personal.valor.tableTax, personal.valor.reduction, personal.valor.tax2026], [564.85, 179.75, 385.1]);
});

test('com a tabela corrigida ninguém paga mais do que paga hoje, de R$ 100 a R$ 30.000 brutos', () => {
  for (let gross = 100; gross <= 30000; gross += 137) {
    const { personal } = service.incomeTaxLag({ grossIncome: gross, on: ON });
    assert.ok(personal.valor.monthlyDifference >= 0, `bruto ${gross}: diferença ${personal.valor.monthlyDifference}`);
  }
});

test('grossForBase: a isenção corrigida em salário bruto fica ~R$ 5.996 (19,92% acima de R$ 5.000)', () => {
  const gross = grossForBase(5355.09, { inssBands, simplifiedDiscount: law.descontoSimplificado });
  assert.ok(Math.abs(gross - 5996.04) <= 0.011, `bruto equivalente ${gross}`);
  assert.ok(Math.abs((gross / 5000 - 1) * 100 - 19.92) < 0.01);
});

test('serviço: defasagem de dez/1995 a dez/2025 é 120,48% e a isenção corrigida, R$ 5.355,09 (selo exato)', () => {
  const { lag, personal } = service.incomeTaxLag({ untilMonth: '2025-12', on: ON });
  assert.ok(Math.abs(lag.valor.lagPct - 120.48) < 0.005);
  assert.equal(lag.correctedExemption, 5355.09);
  assert.equal(lag.selo, 'estimativa', 'decidido pelo Celso em 19/11/2026: a defasagem é estimativa');
  assert.match(lag.avisos[0], /depende da base e do método.*157%/);
  assert.equal(personal, null);
  assert.deepEqual(lag.insumos.map(i => i.id), ['ipca_numero_indice', 'irpf_isencao_mensal', 'irpf_isencao_mensal']);
  assert.match(lag.base, /Lei 15\.270 não entra/);
  assert.equal(lag.effective.currentGross, 5000);
});

test('serviço: até out/2026 a defasagem passa de 129% (IPCA de 519%, isenção corrigida ~R$ 5.574)', () => {
  const { lag } = service.incomeTaxLag({ untilMonth: '2026-10', on: ON });
  assert.ok(lag.valor.lagPct > 129 && lag.valor.lagPct < 130, `${lag.valor.lagPct}`);
  assert.ok(Math.abs(lag.correctedExemption - 5574.48) < 0.02);
  assert.deepEqual(service.lagMonths(ON).map(m => m.value), ['2025-12', '2026-10']);
});

test('serviço: a comparação pessoal é estimativa enquanto a tabela do INSS estiver a confirmar', () => {
  const { lag, personal } = service.incomeTaxLag({ grossIncome: 6000, on: ON });
  assert.equal(lag.selo, 'estimativa');
  assert.equal(personal.selo, 'estimativa');
  assert.ok(personal.insumos.some(i => i.id === 'tabela_inss_empregado' && i.status === 'a-confirmar'));
});

test('serviço: mesmo com todos os números confirmados, defasagem e comparação seguem estimativa (método)', () => {
  const confirmed = new VendorParameters({
    vigencia: (id, d) => parameters.validity(id, d), valor: (id, d) => parameters.value(id, d),
    insumo: (id, d) => ({ ...parameters.input(id, d), status: 'confirmado' }), selo: (i, e) => parameters.seal(i, e),
  });
  const confirmedService = new PriceMonitorService({ basket: BASKET_DATA, realEstate: REAL_ESTATE_DATA, municipalities: [], sources: { files: [] }, parameters: confirmed });
  const confirmedResult = confirmedService.incomeTaxLag({ grossIncome: 6000, on: ON });
  assert.deepEqual([confirmedResult.lag.selo, confirmedResult.personal.selo], ['estimativa', 'estimativa']);
});

test('serviço (RN-M01): lê a lei da data pedida; em 2025 não há redução nem tabela do INSS', () => {
  const { lag } = service.incomeTaxLag({ on: '2025-06-15' });
  assert.equal(lag.currentExemption, 2428.80);
  assert.equal(lag.effective, null);
  assert.throws(() => service.incomeTaxLag({ grossIncome: 6000, on: '2025-06-15' }), /INSS/);
  const old = service.incomeTaxLag({ on: '2024-06-15' });
  assert.equal(old.lag.currentExemption, 2259.20, 'em jun/2024 a isenção era R$ 2.259,20');
  assert.equal(old.lag.correctedBands, null, 'sem tabela do IRPF cadastrada para 2024, a defasagem sai e a tabela corrigida não');
  assert.throws(() => service.incomeTaxLag({ grossIncome: 6000, on: '2024-06-15' }), /IRPF/);
});

test('serviço: mês sem número-índice, salário negativo ou não finito lançam RangeError', () => {
  assert.throws(() => service.incomeTaxLag({ untilMonth: '2030-01', on: ON }), RangeError);
  assert.throws(() => service.incomeTaxLag({ untilMonth: '1995-12', on: ON }), RangeError);
  assert.throws(() => service.incomeTaxLag({ grossIncome: -1, on: ON }), RangeError);
  assert.throws(() => service.incomeTaxLag({ grossIncome: Number.NaN, on: ON }), RangeError);
});

test('privacidade: o salário digitado não vai para o armazenamento do navegador', () => {
  const written = [];
  const original = globalThis.localStorage;
  globalThis.localStorage = { setItem: (...args) => written.push(args), getItem: () => null, removeItem() {} };
  try {
    service.incomeTaxLag({ grossIncome: 6000, on: ON });
  } finally {
    if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original;
  }
  assert.deepEqual(written, []);
});
