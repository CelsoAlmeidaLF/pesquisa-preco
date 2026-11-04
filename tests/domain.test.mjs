/** Tests / tests/domain.test.mjs: rules checked against what DIEESE and FipeZAP published. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { basketCost, basketLines, neededMinimumWage, priceRange, wagePercent, workTime } from '../src/domain/BasketCalculator.js';
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

test('municípios de SP: sem preço de cesta inventado', () => {
  const withBasket = SAO_PAULO_MUNICIPALITIES.filter(m => m.basket);
  assert.deepEqual(withBasket.map(m => m.municipality).sort(), ['Campinas', 'São Paulo']);
  assert.equal(withBasket.find(m => m.municipality === 'Campinas').basket.comparable, false);
  const sorocaba = SAO_PAULO_MUNICIPALITIES.find(m => m.municipality === 'Sorocaba');
  assert.equal(sorocaba.intermediateRegion, 'Sorocaba');
});

test('CSV usa ponto e vírgula, vírgula decimal e neutraliza fórmula', () => {
  const csv = toCsv([['a;b', 1.5, '=SOMA(A1)', null]]);
  assert.equal(csv, '﻿"a;b";1,5;\'=SOMA(A1);\r\n');
});
