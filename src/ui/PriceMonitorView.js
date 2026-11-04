/**
 * UI / src/ui/PriceMonitorView.js
 * Renders the tabs. Every value that comes from data goes through escapeHtml.
 */
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const wholeCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const NO_DATA = '<span class="no-data">sem dado</span>';
const BAR_LIMIT = 10;
const SEGMENT_LABEL = { residential: 'residencial', commercial: 'comercial' };

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => (value == null ? NO_DATA : currency.format(value));
const wholeMoney = value => (value == null ? NO_DATA : wholeCurrency.format(value));
const percent = value => (value == null ? NO_DATA : `${decimal.format(value)}%`);
const signedPercent = value => (value == null ? NO_DATA : `${value > 0 ? '+' : ''}${decimal.format(value)}%`);
const perSquareMeter = text => `${text}<small>/m²</small>`;
const time = ({ hours, minutes }) => `${hours}h${String(minutes).padStart(2, '0')}`;

function tile(label, value, detail = '') {
  return `<div class="glass-panel tile"><span class="tile-label">${escapeHtml(label)}</span><strong class="tile-value">${value}</strong>${detail ? `<span class="tile-detail">${escapeHtml(detail)}</span>` : ''}</div>`;
}

function table(columns, rows, empty = 'Nada encontrado com esse filtro.') {
  const head = columns.map(c => `<th scope="col"${c.numeric ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`).join('');
  const body = rows.length
    ? rows.map(row => `<tr>${columns.map((c, i) => `<td data-label="${escapeHtml(c.label)}"${c.numeric ? ' class="num"' : ''}>${c.cell(row, i)}</td>`).join('')}</tr>`).join('')
    : `<tr class="empty-row"><td colspan="${columns.length}">${escapeHtml(empty)}</td></tr>`;
  return `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}

function bars(items, format) {
  const max = Math.max(...items.map(item => item.value), 0);
  if (!items.length) return '<p class="panel-sub">Nada encontrado com esse filtro.</p>';
  return items.map(item => `
    <div class="bar-row" title="${escapeHtml(item.label)}: ${escapeHtml(format(item.value))}">
      <span class="bar-label">${escapeHtml(item.label)}</span>
      <span class="bar-track"><i class="bar-fill ${item.className ?? ''}" style="--bar:${(item.value / max * 100).toFixed(2)}%"></i></span>
      <span class="bar-value">${escapeHtml(format(item.value))}</span>
    </div>`).join('');
}

export class PriceMonitorView {
  constructor(service, doc = document) {
    this.service = service;
    this.doc = doc;
    this.segment = 'residential';
    this.$ = id => doc.getElementById(id);
  }

  start() {
    const { sources, basket } = this.service;
    this.doc.querySelectorAll('[data-bind="period"]').forEach(el => { el.textContent = basket.period; });
    this.doc.querySelectorAll('[data-bind="collectedAt"]').forEach(el => {
      el.textContent = sources.collectedAt.split('-').reverse().join('/');
    });
    this.renderOverview();
    this.renderCapitals();
    this.fillCapitalSelects();
    this.renderBreakdown();
    this.renderCustomWage();
    this.fillRegionSelect();
    this.renderMunicipalities();
    this.fillEstimateCities();
    this.renderRealEstate();
    this.renderHashes();
    this.bindEvents();
  }

  bindEvents() {
    this.$('capitalSearch').addEventListener('input', () => this.renderCapitals());
    this.$('capitalSort').addEventListener('change', () => this.renderCapitals());
    this.$('breakdownCapital').addEventListener('change', () => this.renderBreakdown());
    this.$('customWageCapital').addEventListener('change', () => this.renderCustomWage());
    this.$('customWageInput').addEventListener('input', () => this.renderCustomWage());
    this.$('municipalitySearch').addEventListener('input', () => this.renderMunicipalities());
    this.$('municipalityRegion').addEventListener('change', () => this.renderMunicipalities());
    this.$('estateSearch').addEventListener('input', () => this.renderRealEstate());
    this.$('estateSort').addEventListener('change', () => this.renderRealEstate());
    this.$('estimateCity').addEventListener('change', () => this.renderEstimate());
    this.$('estimateArea').addEventListener('input', () => this.renderEstimate());
    this.doc.querySelectorAll('[data-segment]').forEach(button => button.addEventListener('click', () => {
      this.segment = button.dataset.segment;
      this.doc.querySelectorAll('[data-segment]').forEach(b => {
        const active = b === button;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      this.fillEstimateCities();
      this.renderRealEstate();
    }));
  }

  renderOverview() {
    const o = this.service.overview();
    this.$('basketTiles').innerHTML = [
      tile('Cesta mais cara', money(o.highest.publishedTotal), `${o.highest.capital} (${o.highest.uf})`),
      tile('Cesta mais barata', money(o.lowest.publishedTotal), `${o.lowest.capital} (${o.lowest.uf})`),
      tile('Média das 27 capitais', money(o.average), 'Média simples, calculada aqui'),
      tile('Salário mínimo necessário', money(o.neededWage), `${decimal.format(o.neededWageMultiple)} vezes o mínimo de ${currency.format(o.minimumWage)}`),
    ].join('');
    const m = o.market;
    this.$('marketTiles').innerHTML = [
      tile('Compra residencial', perSquareMeter(wholeMoney(m.residentialSale)), `${signedPercent(m.residentialSaleChange12m)} em 12 meses`),
      tile('Aluguel residencial', perSquareMeter(money(m.residentialRent)), `${signedPercent(m.residentialRentChange12m)} em 12 meses`),
      tile('Compra comercial', perSquareMeter(wholeMoney(m.commercialSale)), `${signedPercent(m.commercialSaleChange12m)} em 12 meses`),
      tile('Aluguel comercial', perSquareMeter(money(m.commercialRent)), `${signedPercent(m.commercialRentChange12m)} em 12 meses`),
    ].join('');
    const place = entry => `${escapeHtml(entry.capital)} (${escapeHtml(entry.uf)})`;
    this.$('itemTable').innerHTML = table([
      { label: 'Item', cell: r => `<strong>${escapeHtml(r.label)}</strong>` },
      { label: 'Unidade', cell: r => escapeHtml(r.unit) },
      { label: 'Menor preço', numeric: true, cell: r => money(r.lowest.price) },
      { label: 'Onde', cell: r => place(r.lowest) },
      { label: 'Média', numeric: true, cell: r => money(r.average) },
      { label: 'Maior preço', numeric: true, cell: r => money(r.highest.price) },
      { label: 'Onde ', cell: r => place(r.highest) },
      { label: 'Capitais', numeric: true, cell: r => r.count },
    ], this.service.itemRanking());
  }

  renderCapitals() {
    const capitals = this.service.capitals({ query: this.$('capitalSearch').value, sort: this.$('capitalSort').value });
    this.lastCapitals = capitals;
    this.$('capitalBars').innerHTML = bars(
      capitals.map(c => ({ label: `${c.capital} (${c.uf})`, value: c.publishedTotal, className: `region-${c.decreeRegion}` })),
      value => currency.format(value),
    );
    this.$('capitalTable').innerHTML = table([
      { label: 'Estado', cell: c => `<strong>${escapeHtml(c.state)} (${escapeHtml(c.uf)})</strong>` },
      { label: 'Capital', cell: c => escapeHtml(c.capital) },
      { label: 'Arroz (kg)', numeric: true, cell: c => money(c.prices.rice) },
      { label: 'Feijão (kg)', numeric: true, cell: c => `${money(c.prices.beans)} <small>${escapeHtml(c.beansType)}</small>` },
      { label: 'Café (kg)', numeric: true, cell: c => money(c.prices.coffee) },
      { label: 'Carne (kg)', numeric: true, cell: c => money(c.prices.meat) },
      { label: 'Pão (kg)', numeric: true, cell: c => money(c.prices.bread) },
      { label: 'Leite (L)', numeric: true, cell: c => money(c.prices.milk) },
      { label: 'Cesta', numeric: true, cell: c => `<strong>${money(c.publishedTotal)}</strong>` },
      { label: '12 meses', numeric: true, cell: c => signedPercent(c.twelveMonthChange) },
      { label: '% do mínimo líquido', numeric: true, cell: c => percent(c.wagePercent) },
      { label: 'Tempo de trabalho', numeric: true, cell: c => time(c.workTime) },
    ], capitals);
  }

  fillCapitalSelects() {
    const options = this.service.capitals({ sort: 'name-asc' })
      .map(c => [c.capital, c])
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([, c]) => `<option value="${c.ibgeCode}"${c.capital === 'São Paulo' ? ' selected' : ''}>${escapeHtml(c.capital)} (${escapeHtml(c.uf)})</option>`);
    this.$('breakdownCapital').innerHTML = options.join('');
    this.$('customWageCapital').innerHTML = options.join('');
  }

  renderBreakdown() {
    const b = this.service.basketBreakdown(Number(this.$('breakdownCapital').value));
    const label = line => {
      if (line.key === 'beans') return `Feijão ${b.capital.beansType}`;
      if (line.key === 'flour') return `Farinha de ${b.capital.flourType}`;
      return line.label;
    };
    this.$('breakdownTable').innerHTML = table([
      { label: 'Item', cell: l => `<strong>${escapeHtml(label(l))}</strong>` },
      { label: 'Quantidade', numeric: true, cell: l => `${String(l.quantity).replace('.', ',')} ${escapeHtml(l.unit === '900 ml' ? '× 900 ml' : l.unit === 'dúzia' ? 'dúzias' : l.unit)}` },
      { label: 'Preço médio', numeric: true, cell: l => money(l.price) },
      { label: 'Custo', numeric: true, cell: l => money(l.cost) },
    ], b.lines);
    const difference = Math.abs(b.calculatedTotal - b.publishedTotal);
    this.$('breakdownNote').textContent = `Soma calculada: ${currency.format(b.calculatedTotal)}. Total publicado: ${currency.format(b.publishedTotal)}.`
      + (difference > 0 ? ` A diferença de ${currency.format(difference)} é arredondamento: o preço publicado tem só duas casas.` : '')
      + ` Região ${b.capital.decreeRegion} do Decreto-Lei 399.`;
  }

  renderCustomWage() {
    const input = this.$('customWageInput');
    const [min, max] = [Number(input.min), Number(input.max)];
    const wage = input.value === '' ? Number.NaN : Number(input.value);
    if (!(wage >= min && wage <= max)) {
      this.$('customWageTiles').innerHTML = '';
      this.$('customWageNote').textContent = `Preencha sua renda mensal líquida com um valor entre ${wholeCurrency.format(min)} e ${wholeCurrency.format(max)} para ver o resultado.`;
      return;
    }
    const p = this.service.customPurchasingPower({ capitalCode: Number(this.$('customWageCapital').value), monthlyWage: wage });
    this.$('customWageTiles').innerHTML = [
      tile('Tempo de trabalho', time(p.workTime), 'Jornada de 220 horas por mês'),
      tile('Dias de trabalho (jornada 8h)', oneDecimal.format(p.workDays)),
      tile('Comprometi\u00ADmento da renda', percent(p.shareOfWage), `Sobre ${currency.format(p.monthlyWage)} por mês`),
      tile('Custo da cesta', money(p.basketValue), `${p.capital.capital} (${p.capital.uf}), ${this.service.basket.period}`),
    ].join('');
    this.$('customWageNote').textContent = (p.shareOfWage > 100 ? 'A cesta custa mais do que a renda informada. ' : '')
      + 'Conta feita com a sua renda líquida, para uma pessoa adulta. A tabela acima usa o salário mínimo bruto para o tempo de trabalho, por isso os números não são comparáveis. O valor digitado não sai do seu aparelho.';
  }

  fillRegionSelect() {
    this.$('municipalityRegion').innerHTML = '<option value="ALL">Todas as regiões</option>'
      + this.service.spRegions().map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }

  renderMunicipalities() {
    const rows = this.service.spMunicipalities({ query: this.$('municipalitySearch').value, region: this.$('municipalityRegion').value });
    this.lastMunicipalities = rows;
    this.$('municipalityCount').textContent = `${rows.length} municípios`;
    const basket = m => {
      if (!m.basket) return NO_DATA;
      const badge = m.basket.comparable ? '' : ` <small>${escapeHtml(m.basket.period)}, pesquisa local</small>`;
      return `${money(m.basket.value)}${badge}`;
    };
    this.$('municipalityTable').innerHTML = table([
      { label: 'Município', cell: m => `<strong>${escapeHtml(m.municipality)}</strong> <small>IBGE ${m.ibgeCode}</small>` },
      { label: 'Região intermediária', cell: m => escapeHtml(m.intermediateRegion) },
      { label: 'Cesta', numeric: true, cell: basket },
      { label: 'Compra res. (m²)', numeric: true, cell: m => wholeMoney(m.market?.residentialSale) },
      { label: 'Aluguel res. (m²)', numeric: true, cell: m => money(m.market?.residentialRent) },
      { label: 'Compra com. (m²)', numeric: true, cell: m => wholeMoney(m.market?.commercialSale) },
      { label: 'Aluguel com. (m²)', numeric: true, cell: m => money(m.market?.commercialRent) },
    ], rows);
  }

  fillEstimateCities() {
    const select = this.$('estimateCity');
    const previous = Number(select.value);
    const cities = this.service.realEstateCities({ segment: this.segment, sort: 'name-asc' });
    const selected = cities.some(c => c.ibgeCode === previous) ? previous : cities.find(c => c.city === 'São Paulo').ibgeCode;
    select.innerHTML = cities.map(c => `<option value="${c.ibgeCode}"${c.ibgeCode === selected ? ' selected' : ''}>${escapeHtml(c.city)} (${escapeHtml(c.uf)})</option>`).join('');
  }

  renderRealEstate() {
    const segment = this.segment;
    const cities = this.service.realEstateCities({ query: this.$('estateSearch').value, segment, sort: this.$('estateSort').value });
    this.lastCities = cities;
    const saleKey = `${segment}Sale`;
    const rentKey = `${segment}Rent`;
    const top = key => [...cities].filter(c => c[key] != null).sort((a, b) => b[key] - a[key]).slice(0, BAR_LIMIT)
      .map(c => ({ label: `${c.city} (${c.uf})`, value: c[key], className: 'estate' }));
    this.$('saleBarsTitle').textContent = `Compra ${SEGMENT_LABEL[segment]}: maiores preços por m²`;
    this.$('rentBarsTitle').textContent = `Aluguel ${SEGMENT_LABEL[segment]}: maiores preços por m²`;
    this.$('saleBars').innerHTML = bars(top(saleKey), value => wholeCurrency.format(value));
    this.$('rentBars').innerHTML = bars(top(rentKey), value => currency.format(value));
    this.$('estateCount').textContent = `${cities.length} cidades com dado ${SEGMENT_LABEL[segment]}`;
    this.$('estateTable').innerHTML = table([
      { label: 'Cidade', cell: c => `<strong>${escapeHtml(c.city)} (${escapeHtml(c.uf)})</strong>` },
      { label: 'Região', cell: c => escapeHtml(c.macroRegion) },
      { label: 'Compra (m²)', numeric: true, cell: c => wholeMoney(c[saleKey]) },
      { label: 'Compra 12 meses', numeric: true, cell: c => signedPercent(c[`${saleKey}Change12m`]) },
      { label: 'Aluguel (m²/mês)', numeric: true, cell: c => money(c[rentKey]) },
      { label: 'Aluguel 12 meses', numeric: true, cell: c => signedPercent(c[`${rentKey}Change12m`]) },
      { label: 'Rentabilidade (ano)', numeric: true, cell: c => percent(c[`${segment}Yield`]) },
    ], cities);
    this.renderEstimate();
  }

  renderEstimate() {
    const area = Number(this.$('estimateArea').value);
    if (!Number.isFinite(area) || area <= 0) {
      this.$('estimateTiles').innerHTML = '';
      this.$('estimateNote').textContent = 'Informe uma área maior que zero.';
      return;
    }
    const e = this.service.estimate({ ibgeCode: Number(this.$('estimateCity').value), segment: this.segment, area });
    this.$('estimateTiles').innerHTML = [
      tile('Compra', wholeMoney(e.purchase)),
      tile('Aluguel por mês', money(e.monthlyRent)),
      tile('Anos de aluguel para somar a compra', e.yearsOfRent == null ? NO_DATA : oneDecimal.format(e.yearsOfRent)),
      tile('Rentabilidade do aluguel', percent(e.publishedYield), 'Ao ano, publicada pelo FipeZAP'),
    ].join('');
    this.$('estimateNote').textContent = e.exceedsCommercialSample
      ? 'Atenção: o FipeZAP Comercial mede salas de até 200 m². Acima disso, a estimativa perde a base.'
      : '';
  }

  renderHashes() {
    this.$('hashTable').innerHTML = table([
      { label: 'Arquivo', cell: f => `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.file)}</a>` },
      { label: 'SHA-256', cell: f => `<span class="mono hash">${escapeHtml(f.sha256)}</span>` },
    ], this.service.sources.files);
  }

  /** Rows of the CSV for the open tab: same filters as the screen. */
  csvFor(tabId) {
    if (tabId === 'tabCapitais') {
      return { name: 'cesta-capitais-set2026.csv', rows: [
        ['Código IBGE', 'Estado', 'UF', 'Capital', 'Região', 'Região do Decreto-Lei 399', 'Carne', 'Leite', 'Feijão', 'Tipo de feijão', 'Arroz', 'Farinha', 'Tipo de farinha', 'Batata', 'Tomate', 'Pão', 'Café', 'Banana', 'Açúcar', 'Óleo', 'Manteiga', 'Cesta', 'Variação em 12 meses (%)', '% do mínimo líquido', 'Tempo de trabalho'],
        ...this.lastCapitals.map(c => [c.ibgeCode, c.state, c.uf, c.capital, c.macroRegion, c.decreeRegion, c.prices.meat, c.prices.milk, c.prices.beans, c.beansType, c.prices.rice, c.prices.flour, c.flourType, c.prices.potato, c.prices.tomato, c.prices.bread, c.prices.coffee, c.prices.banana, c.prices.sugar, c.prices.oil, c.prices.butter, c.publishedTotal, c.twelveMonthChange, c.publishedWagePercent, time(c.workTime)]),
      ] };
    }
    if (tabId === 'tabMunicipios') {
      return { name: 'municipios-sp-set2026.csv', rows: [
        ['Código IBGE', 'Município', 'Região intermediária', 'Região imediata', 'Cesta', 'Período da cesta', 'Fonte da cesta', 'Compra residencial (R$/m²)', 'Aluguel residencial (R$/m²)', 'Compra comercial (R$/m²)', 'Aluguel comercial (R$/m²)'],
        ...this.lastMunicipalities.map(m => [m.ibgeCode, m.municipality, m.intermediateRegion, m.immediateRegion, m.basket?.value, m.basket?.period, m.basket?.source, m.market?.residentialSale, m.market?.residentialRent, m.market?.commercialSale, m.market?.commercialRent]),
      ] };
    }
    if (tabId === 'tabImoveis') {
      const s = this.segment;
      return { name: `imoveis-${SEGMENT_LABEL[s]}-set2026.csv`, rows: [
        ['Código IBGE', 'Cidade', 'UF', 'Região', 'Compra (R$/m²)', 'Compra em 12 meses (%)', 'Aluguel (R$/m²)', 'Aluguel em 12 meses (%)', 'Rentabilidade ao ano (%)'],
        ...this.lastCities.map(c => [c.ibgeCode, c.city, c.uf, c.macroRegion, c[`${s}Sale`], c[`${s}SaleChange12m`], c[`${s}Rent`], c[`${s}RentChange12m`], c[`${s}Yield`]]),
      ] };
    }
    if (tabId === 'tabFontes') {
      return { name: 'fontes-sha256.csv', rows: [['Arquivo', 'URL', 'SHA-256'], ...this.service.sources.files.map(f => [f.file, f.url, f.sha256])] };
    }
    return { name: 'itens-capitais-set2026.csv', rows: [
      ['Item', 'Unidade', 'Menor preço', 'Capital do menor preço', 'Média simples', 'Maior preço', 'Capital do maior preço', 'Capitais'],
      ...this.service.itemRanking().map(r => [r.label, r.unit, r.lowest.price, `${r.lowest.capital} (${r.lowest.uf})`, r.average, r.highest.price, `${r.highest.capital} (${r.highest.uf})`, r.count]),
    ] };
  }
}
