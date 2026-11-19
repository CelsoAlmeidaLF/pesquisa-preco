/** Tests / tests/domain.test.mjs: rules checked against what DIEESE and FipeZAP published. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { basketCost, basketLines, customPurchasingPower, neededMinimumWage, priceRange, wagePercent, workTime } from '../src/domain/BasketCalculator.js';
import { describeBasket, describeEstate } from '../src/domain/MunicipalityCoverage.js';
import { estimateProperty } from '../src/domain/RealEstateCalculator.js';
import { PriceMonitorService } from '../src/application/PriceMonitorService.js';
import { toCsv } from '../src/infrastructure/CsvExporter.js';
import { BASKET_DATA } from '../src/infrastructure/data/BasketData.js';
import { REAL_ESTATE_DATA } from '../src/infrastructure/data/RealEstateData.js';
import { SAO_PAULO_MUNICIPALITIES } from '../src/infrastructure/data/SaoPauloData.js';
import { SOURCES_DATA } from '../src/infrastructure/data/SourcesData.js';

const service = new PriceMonitorService({ basket: BASKET_DATA, realEstate: REAL_ESTATE_DATA, municipalities: SAO_PAULO_MUNICIPALITIES, sources: SOURCES_DATA });
const capital = name => BASKET_DATA.capitals.find(c => c.capital === name);

test('são 27 capitais, uma por unidade da federação', () => {
  assert.equal(BASKET_DATA.capitals.length, 27);
  assert.equal(new Set(BASKET_DATA.capitals.map(c => c.uf)).size, 27);
});

test('quantidade x preço reproduz o total publicado nas 27 capitais (arredondamento de até R$ 0,20)', () => {
  for (const c of BASKET_DATA.capitals) {
    const total = basketCost(c.prices, BASKET_DATA.quantities[c.decreeRegion]);
    assert.ok(Math.abs(total - c.publishedTotal) <= 0.20, `${c.capital}: ${total} x ${c.publishedTotal}`);
  }
});

test('% do salário mínimo líquido e tempo de trabalho reproduzem a Tabela 1', () => {
  for (const c of BASKET_DATA.capitals) {
    assert.ok(Math.abs(wagePercent(c.publishedTotal, BASKET_DATA.minimumWage) - c.publishedWagePercent) <= 0.011, c.capital);
    const time = workTime(c.publishedTotal, BASKET_DATA.minimumWage);
    const minutes = time.hours * 60 + time.minutes;
    assert.ok(Math.abs(minutes - (c.publishedWorkHours * 60 + c.publishedWorkMinutes)) <= 1, c.capital);
  }
});

test('salário mínimo necessário reproduz o valor do DIEESE', () => {
  assert.equal(neededMinimumWage(capital('São Paulo').publishedTotal), 7750.01);
  assert.equal(BASKET_DATA.neededWage, 7750.01);
});

test('Norte e Nordeste não têm batata na cesta', () => {
  const lines = basketLines(capital('Aracaju').prices, BASKET_DATA.quantities[2]);
  assert.equal(lines.length, 12);
  assert.ok(!lines.some(line => line.key === 'potato'));
});

test('valores inválidos são recusados', () => {
  assert.throws(() => wagePercent(0, 1621), RangeError);
  assert.throws(() => workTime(100, -1), RangeError);
  assert.throws(() => neededMinimumWage(Number.NaN), RangeError);
  assert.throws(() => basketLines({ meat: null }, { meat: 6 }), RangeError);
  assert.throws(() => priceRange([]), RangeError);
  assert.throws(() => estimateProperty({ salePerM2: 1, rentPerM2: 1, area: 0 }), RangeError);
});

test('poder de compra: cálculo exato com a jornada padrão de 220 horas', () => {
  assert.deepEqual(customPurchasingPower(1000, 2200), {
    basketValue: 1000, monthlyWage: 2200, shareOfWage: 1000 / 2200 * 100, workTime: { hours: 100, minutes: 0 }, workDays: 12.5,
  });
  assert.deepEqual(customPurchasingPower(500, 2000).workTime, { hours: 55, minutes: 0 });
  assert.equal(customPurchasingPower(500, 2000).shareOfWage, 25);
});

test('poder de compra: minutos fracionados são truncados, como na tabela do DIEESE', () => {
  assert.deepEqual(customPurchasingPower(922.51, 3000).workTime, { hours: 67, minutes: 39 });
});

test('poder de compra: resultado exato não perde um minuto por ponto flutuante', () => {
  assert.deepEqual(customPurchasingPower(230, 100).workTime, { hours: 506, minutes: 0 });
  assert.deepEqual(workTime(230, 100), { hours: 506, minutes: 0 });
});

test('poder de compra: jornada mensal informada muda tempo e dias, não o percentual', () => {
  const result = customPurchasingPower(1000, 2000, 176);
  assert.deepEqual(result.workTime, { hours: 88, minutes: 0 });
  assert.equal(result.workDays, 11);
  assert.equal(result.shareOfWage, 50);
});

test('poder de compra: renda menor que a cesta passa de 100% e da jornada do mês', () => {
  const result = customPurchasingPower(900, 450);
  assert.equal(result.shareOfWage, 200);
  assert.deepEqual(result.workTime, { hours: 440, minutes: 0 });
  assert.equal(result.workDays, 55);
});

test('poder de compra: renda igual à cesta consome a jornada inteira', () => {
  const result = customPurchasingPower(800, 800);
  assert.equal(result.shareOfWage, 100);
  assert.deepEqual(result.workTime, { hours: 220, minutes: 0 });
  assert.equal(result.workDays, 27.5);
});

test('poder de compra: renda muito maior que a cesta dá poucos minutos', () => {
  const result = customPurchasingPower(1000, 1000000);
  assert.equal(result.shareOfWage, 0.1);
  assert.deepEqual(result.workTime, { hours: 0, minutes: 13 });
});

test('poder de compra: zero, negativos e não numéricos são recusados', () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '3000', null, undefined]) {
    assert.throws(() => customPurchasingPower(invalid, 3000), RangeError);
    assert.throws(() => customPurchasingPower(800, invalid), RangeError);
  }
  for (const invalid of [0, -220, Number.NaN, Number.POSITIVE_INFINITY, '220', null]) {
    assert.throws(() => customPurchasingPower(800, 3000, invalid), RangeError);
    assert.throws(() => workTime(800, 3000, invalid), RangeError);
  }
});

test('serviço de poder de compra usa o total publicado da capital escolhida', () => {
  const saoPaulo = capital('São Paulo');
  const result = service.customPurchasingPower({ capitalCode: saoPaulo.ibgeCode, monthlyWage: 3000 });
  assert.equal(result.capital, saoPaulo);
  assert.equal(result.basketValue, 922.51);
  assert.equal(result.monthlyWage, 3000);
  assert.deepEqual(result.workTime, { hours: 67, minutes: 39 });
});

test('serviço de poder de compra cai na primeira capital se o código não existir', () => {
  const first = BASKET_DATA.capitals[0];
  for (const capitalCode of [0, undefined, Number.NaN]) {
    const result = service.customPurchasingPower({ capitalCode, monthlyWage: 3000 });
    assert.equal(result.capital, first);
    assert.equal(result.basketValue, first.publishedTotal);
  }
});

test('serviço de poder de compra recusa renda inválida', () => {
  assert.throws(() => service.customPurchasingPower({ capitalCode: capital('São Paulo').ibgeCode, monthlyWage: 0 }), RangeError);
  assert.throws(() => service.customPurchasingPower({ capitalCode: capital('São Paulo').ibgeCode, monthlyWage: -3000 }), RangeError);
});

test('panorama aponta a cesta mais cara e a mais barata do relatório', () => {
  const overview = service.overview();
  assert.equal(overview.highest.capital, 'São Paulo');
  assert.equal(overview.highest.publishedTotal, 922.51);
  assert.equal(overview.lowest.capital, 'Aracaju');
  assert.equal(overview.lowest.publishedTotal, 587.76);
});

test('ranking separa feijão preto de carioca e farinha de trigo de mandioca', () => {
  const labels = service.itemRanking().map(item => item.label);
  for (const label of ['Feijão carioca', 'Feijão preto', 'Farinha de trigo', 'Farinha de mandioca']) assert.ok(labels.includes(label), label);
  assert.equal(service.itemRanking().find(i => i.label === 'Feijão preto').count, 5);
  assert.equal(service.itemRanking().find(i => i.label === 'Batata').count, 11);
});

test('busca ignora acentos e aceita a sigla', () => {
  assert.deepEqual(service.capitals({ query: 'sao luis' }).map(c => c.capital), ['São Luís']);
  assert.deepEqual(service.capitals({ query: 'zzz' }), []);
});

test('preços do FipeZAP batem com o texto do informe de setembro', () => {
  const sp = REAL_ESTATE_DATA.cities.find(c => c.city === 'São Paulo');
  assert.equal(sp.residentialRent, 65.78);
  assert.equal(sp.commercialSale, 10662);
  assert.equal(sp.commercialRent, 62.87);
  assert.equal(REAL_ESTATE_DATA.national.residentialRent, 54.77);
  assert.equal(REAL_ESTATE_DATA.national.commercialSale, 8846);
});

test('estimativa multiplica pelo m² e aceita cidade sem dado', () => {
  assert.deepEqual(estimateProperty({ salePerM2: 10000, rentPerM2: 50, area: 70 }), { purchase: 700000, monthlyRent: 3500, yearsOfRent: 700000 / 42000 });
  assert.deepEqual(estimateProperty({ salePerM2: 10000, rentPerM2: null, area: 70 }), { purchase: 700000, monthlyRent: null, yearsOfRent: null });
});

test('estimativa avisa quando a sala comercial passa de 200 m²', () => {
  const sp = REAL_ESTATE_DATA.cities.find(c => c.city === 'São Paulo');
  assert.equal(service.estimate({ ibgeCode: sp.ibgeCode, segment: 'commercial', area: 250 }).exceedsCommercialSample, true);
  assert.equal(service.estimate({ ibgeCode: sp.ibgeCode, segment: 'residential', area: 250 }).exceedsCommercialSample, false);
  assert.throws(() => service.estimate({ ibgeCode: 1, segment: 'residential', area: 50 }), RangeError);
});

test('filtro comercial mostra só as 10 cidades do FipeZAP Comercial', () => {
  assert.equal(service.realEstateCities({ segment: 'commercial' }).length, 10);
  assert.equal(service.realEstateCities({ segment: 'residential' }).length, 56);
});

const municipality = name => SAO_PAULO_MUNICIPALITIES.find(m => m.municipality === name);
const spRows = service.spMunicipalities();
const spRow = name => spRows.find(m => m.municipality === name);
const spCapitalTotal = capital('São Paulo').publishedTotal;

test('municípios de SP: são os 645 do IBGE, sem repetição e com região', () => {
  assert.equal(SAO_PAULO_MUNICIPALITIES.length, 645);
  assert.equal(new Set(SAO_PAULO_MUNICIPALITIES.map(m => m.ibgeCode)).size, 645);
  assert.ok(SAO_PAULO_MUNICIPALITIES.every(m => String(m.ibgeCode).startsWith('35') && m.intermediateRegion && m.immediateRegion));
  assert.equal(spRows.length, 645);
  assert.equal(municipality('Sorocaba').intermediateRegion, 'Sorocaba');
  assert.equal(municipality('Adamantina').intermediateRegion, 'Presidente Prudente');
});

test('municípios de SP: nenhum fica sem tipo, e real e referência nunca se misturam', () => {
  for (const m of SAO_PAULO_MUNICIPALITIES) {
    assert.ok(['real', 'reference'].includes(m.basketKind), m.municipality);
    // exatamente um dos dois: valor próprio ou referência
    assert.ok((m.basket == null) !== (m.basketReference == null), m.municipality);
    assert.equal(m.basketKind === 'real', m.basket != null, m.municipality);
    for (const segment of ['residential', 'commercial']) {
      const coverage = m.realEstate[segment];
      assert.ok(['real', 'reference'].includes(coverage.kind), `${m.municipality} ${segment}`);
      assert.equal(coverage.kind === 'real', coverage.originIbgeCode === m.ibgeCode, `${m.municipality} ${segment}`);
      assert.ok(['municipality', 'immediate', 'intermediate', 'capital'].includes(coverage.level));
      assert.equal(coverage.level === 'municipality', coverage.kind === 'real');
    }
  }
  assert.ok(spRows.every(row => ['real', 'reference'].includes(row.basketView.kind)));
});

test('municípios de SP: referência nunca é marcada como real nem como comparável', () => {
  const references = spRows.filter(r => r.basketView.kind === 'reference');
  assert.equal(references.length, 643);
  for (const r of references) {
    assert.equal(r.basketView.comparable, false);
    assert.equal(r.basketView.scope, 'capital');
    assert.equal(r.basketView.originCity, 'São Paulo');
    assert.match(r.basketView.label, /não é pesquisa do município/);
    assert.equal(r.basket, null);
  }
});

test('municípios de SP: referência da cesta é o valor do DIEESE da capital, sem conta', () => {
  for (const r of spRows.filter(row => row.basketView.kind === 'reference')) assert.equal(r.basketView.value, spCapitalTotal);
  assert.equal(spCapitalTotal, 922.51);
  assert.match(spRow('Adamantina').basketView.url, /dieese\.org\.br/);
});

test('municípios de SP: São Paulo e Campinas continuam com valor real', () => {
  assert.deepEqual(SAO_PAULO_MUNICIPALITIES.filter(m => m.basketKind === 'real').map(m => m.municipality).sort(), ['Campinas', 'São Paulo']);
  const campinas = spRow('Campinas').basketView;
  assert.equal(campinas.kind, 'real');
  assert.equal(campinas.value, 832.99);
  assert.equal(campinas.comparable, false);
  assert.equal(spRow('São Paulo').basketView.comparable, true);
  assert.equal(spRow('São Paulo').basketView.value, spCapitalTotal);
});

test('municípios de SP: imóvel real só onde o FipeZAP cobre, com o valor da própria cidade', () => {
  const fipezapSp = REAL_ESTATE_DATA.cities.filter(c => c.uf === 'SP');
  const realResidential = spRows.filter(r => r.estate.residential.kind === 'real');
  assert.deepEqual(realResidential.map(r => r.ibgeCode).sort(), fipezapSp.map(c => c.ibgeCode).sort());
  const sp = spRow('São Paulo').estate.residential;
  assert.equal(sp.sale, REAL_ESTATE_DATA.cities.find(c => c.city === 'São Paulo').residentialSale);
  assert.equal(sp.originCity, 'São Paulo');
  assert.equal(service.spCoverage().residentialReal, realResidential.length);
  assert.equal(service.spCoverage().total, 645);
});

test('municípios de SP: referência de imóvel segue imediata, intermediária e capital, com a origem', () => {
  const cities = new Map(REAL_ESTATE_DATA.cities.map(c => [c.ibgeCode, c]));
  const levelRank = { immediate: 0, intermediate: 1, capital: 2 };
  for (const m of SAO_PAULO_MUNICIPALITIES) {
    for (const segment of ['residential', 'commercial']) {
      const coverage = m.realEstate[segment];
      if (coverage.kind !== 'reference') continue;
      const origin = SAO_PAULO_MUNICIPALITIES.find(o => o.ibgeCode === coverage.originIbgeCode);
      const hasData = c => c[`${segment}Sale`] != null || c[`${segment}Rent`] != null;
      assert.ok(origin && hasData(cities.get(origin.ibgeCode)), `${m.municipality} ${segment}: origem com dado do FipeZAP`);
      assert.equal(coverage.originCity, origin.municipality);
      if (coverage.level === 'immediate') assert.equal(origin.immediateRegion, m.immediateRegion);
      if (coverage.level === 'intermediate') assert.equal(origin.intermediateRegion, m.intermediateRegion);
      if (coverage.level === 'capital') assert.equal(origin.municipality, 'São Paulo');
      // um nível mais próximo disponível não pode ter sido pulado
      const candidates = SAO_PAULO_MUNICIPALITIES.filter(o => o.ibgeCode !== m.ibgeCode && cities.has(o.ibgeCode) && hasData(cities.get(o.ibgeCode)));
      if (levelRank[coverage.level] > 0) assert.ok(!candidates.some(o => o.immediateRegion === m.immediateRegion), `${m.municipality} ${segment}: havia cidade na região imediata`);
      if (levelRank[coverage.level] > 1) assert.ok(!candidates.some(o => o.intermediateRegion === m.intermediateRegion), `${m.municipality} ${segment}: havia cidade na região intermediária`);
    }
  }
  // exemplos conferidos: Adolfo usa a cidade polo da sua região imediata; Adamantina cai na capital
  assert.deepEqual([spRow('Adolfo').estate.residential.kind, spRow('Adolfo').estate.residential.level, spRow('Adolfo').estate.residential.originCity], ['reference', 'immediate', 'São José do Rio Preto']);
  assert.equal(spRow('Adamantina').estate.residential.level, 'capital');
});

test('municípios de SP: cálculos derivados partem do valor mostrado, inclusive da referência', () => {
  const row = spRow('Adamantina');
  assert.equal(row.wagePercent, wagePercent(spCapitalTotal, BASKET_DATA.minimumWage));
  assert.deepEqual(row.workTime, workTime(spCapitalTotal, BASKET_DATA.minimumWage));
  const e = row.estate.residential;
  assert.equal(row.yearsOfRent, e.sale / (e.rent * 12));
});

test('municípios de SP: busca ignora acento e caixa, e a região filtra', () => {
  assert.deepEqual(service.spMunicipalities({ query: 'SAO JOSE DO RIO PRETO' }).map(m => m.municipality), ['São José do Rio Preto']);
  assert.ok(service.spMunicipalities({ query: 'ribeirao' }).some(m => m.municipality === 'Ribeirão Preto'));
  assert.deepEqual(service.spMunicipalities({ query: 'zzz' }), []);
  const region = service.spRegions()[0];
  const filtered = service.spMunicipalities({ region });
  assert.ok(filtered.length > 0 && filtered.every(m => m.intermediateRegion === region));
  assert.equal(service.spRegions().length, 11);
  assert.equal(service.spMunicipalities({ region: 'ALL' }).length, 645);
});

test('cobertura: dado incoerente é recusado, nunca vira real por engano', () => {
  const reference = municipality('Adamantina');
  assert.throws(() => describeBasket({ ...reference, basketKind: 'real' }), RangeError);
  assert.throws(() => describeBasket({ ...reference, basket: { value: 1, period: 'x', source: 'x', comparable: true } }), RangeError);
  assert.throws(() => describeEstate({ ...reference, realEstate: { residential: { ...reference.realEstate.residential, kind: 'real' } } }, 'residential', service.citiesByCode), RangeError);
  assert.throws(() => describeEstate({ ...reference, realEstate: {} }, 'residential', service.citiesByCode), RangeError);
  assert.throws(() => describeEstate({ ...reference, realEstate: { residential: { ...reference.realEstate.residential, originIbgeCode: 1 } } }, 'residential', service.citiesByCode), RangeError);
});

test('fontes: hash do arquivo de municípios do IBGE está registrado', () => {
  const entry = SOURCES_DATA.files.find(f => f.file === 'ibge/ibge_municipios_sp.json');
  assert.ok(entry && /^[0-9a-f]{64}$/.test(entry.sha256) && entry.url.includes('/estados/35/municipios'));
});

test('CSV usa ponto e vírgula, vírgula decimal e neutraliza fórmula', () => {
  const csv = toCsv([['a;b', 1.5, '=SOMA(A1)', null]]);
  assert.equal(csv, '﻿"a;b";1,5;\'=SOMA(A1);\r\n');
});
