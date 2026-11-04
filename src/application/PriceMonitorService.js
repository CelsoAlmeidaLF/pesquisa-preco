/**
 * Application / src/application/PriceMonitorService.js
 * Use cases of the app. Receives the datasets by injection and returns plain view models.
 */
import { basketCost, basketLines, ITEM_CATALOG, neededMinimumWage, priceRange, wagePercent, workTime } from '../domain/BasketCalculator.js?v=20261104-1639';
import { COMMERCIAL_MAX_AREA, estimateProperty } from '../domain/RealEstateCalculator.js?v=20261104-1639';

const normalize = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const byName = (a, b, key) => a[key].localeCompare(b[key], 'pt-BR');

const CAPITAL_SORTERS = {
  'basket-desc': (a, b) => b.publishedTotal - a.publishedTotal,
  'basket-asc': (a, b) => a.publishedTotal - b.publishedTotal,
  'name-asc': (a, b) => byName(a, b, 'state'),
  'change-desc': (a, b) => b.twelveMonthChange - a.twelveMonthChange,
};

export class PriceMonitorService {
  constructor({ basket, realEstate, municipalities, sources }) {
    this.basket = basket;
    this.realEstate = realEstate;
    this.municipalities = municipalities;
    this.sources = sources;
    this.citiesByCode = new Map(realEstate.cities.map(city => [city.ibgeCode, city]));
  }

  capitals({ query = '', sort = 'basket-desc' } = {}) {
    const term = normalize(query);
    const sorter = CAPITAL_SORTERS[sort] ?? CAPITAL_SORTERS['basket-desc'];
    return this.basket.capitals
      .filter(c => !term || normalize(`${c.capital} ${c.state} ${c.uf} ${c.macroRegion}`).includes(term))
      .map(c => ({
        ...c,
        wagePercent: wagePercent(c.publishedTotal, this.basket.minimumWage),
        workTime: workTime(c.publishedTotal, this.basket.minimumWage),
      }))
      .sort(sorter);
  }

  overview() {
    const sorted = this.capitals({ sort: 'basket-desc' });
    const total = sorted.reduce((sum, c) => sum + c.publishedTotal, 0);
    return {
      period: this.basket.period,
      highest: sorted[0],
      lowest: sorted[sorted.length - 1],
      average: total / sorted.length,
      neededWage: neededMinimumWage(sorted[0].publishedTotal),
      neededWageMultiple: this.basket.neededWageMultiple,
      minimumWage: this.basket.minimumWage,
      market: this.realEstate.national,
    };
  }

  /** Beans and flour differ by region, so each type is compared only with itself. */
  itemRanking() {
    const groups = [];
    for (const item of ITEM_CATALOG) {
      const typeKey = { beans: 'beansType', flour: 'flourType' }[item.key];
      const types = typeKey ? [...new Set(this.basket.capitals.map(c => c[typeKey]))].sort() : [null];
      for (const type of types) {
        const entries = this.basket.capitals
          .filter(c => c.prices[item.key] != null && (!type || c[typeKey] === type))
          .map(c => ({ capital: c.capital, uf: c.uf, price: c.prices[item.key] }));
        groups.push({ ...item, label: !type ? item.label : item.key === 'flour' ? `${item.label} de ${type}` : `${item.label} ${type}`, ...priceRange(entries) });
      }
    }
    return groups;
  }

  basketBreakdown(ibgeCode) {
    const capital = this.basket.capitals.find(c => c.ibgeCode === ibgeCode);
    if (!capital) throw new RangeError('Capital não encontrada');
    const quantities = this.basket.quantities[capital.decreeRegion];
    return {
      capital,
      lines: basketLines(capital.prices, quantities),
      calculatedTotal: basketCost(capital.prices, quantities),
      publishedTotal: capital.publishedTotal,
    };
  }

  spMunicipalities({ query = '', region = 'ALL' } = {}) {
    const term = normalize(query);
    return this.municipalities
      .filter(m => (region === 'ALL' || m.intermediateRegion === region)
        && (!term || normalize(`${m.municipality} ${m.intermediateRegion} ${m.immediateRegion}`).includes(term)))
      .map(m => ({ ...m, market: this.citiesByCode.get(m.ibgeCode) ?? null }));
  }

  spRegions() {
    return [...new Set(this.municipalities.map(m => m.intermediateRegion))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  realEstateCities({ query = '', segment = 'residential', sort = 'sale-desc' } = {}) {
    const term = normalize(query);
    const saleKey = `${segment}Sale`;
    const rentKey = `${segment}Rent`;
    const descending = (key) => (a, b) => (b[key] ?? -1) - (a[key] ?? -1);
    const sorters = {
      'sale-desc': descending(saleKey),
      'rent-desc': descending(rentKey),
      'yield-desc': descending(`${segment}Yield`),
      'name-asc': (a, b) => byName(a, b, 'city'),
    };
    return this.realEstate.cities
      .filter(c => c[saleKey] != null || c[rentKey] != null)
      .filter(c => !term || normalize(`${c.city} ${c.state} ${c.uf} ${c.macroRegion}`).includes(term))
      .sort(sorters[sort] ?? sorters['sale-desc']);
  }

  estimate({ ibgeCode, segment, area }) {
    const city = this.citiesByCode.get(ibgeCode);
    if (!city) throw new RangeError('Cidade não encontrada');
    return {
      city,
      area,
      exceedsCommercialSample: segment === 'commercial' && area > COMMERCIAL_MAX_AREA,
      publishedYield: city[`${segment}Yield`],
      ...estimateProperty({ salePerM2: city[`${segment}Sale`], rentPerM2: city[`${segment}Rent`], area }),
    };
  }
}
