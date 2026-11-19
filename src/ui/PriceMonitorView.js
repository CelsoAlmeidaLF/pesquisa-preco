/**
 * UI / src/ui/PriceMonitorView.js
 * Renders the tabs. Every value that comes from data goes through escapeHtml.
 */
import { KIND } from '../domain/MunicipalityCoverage.js?v=20261119-1304';
import { SVG_ICONS } from './SvgIcons.js?v=20261119-1304';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const wholeCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const NO_DATA = '<span class="no-data">sem dado</span>';
const BAR_LIMIT = 10;
const MUNICIPALITY_PAGE_SIZE = 50;
const SEGMENT_LABEL = { residential: 'residencial', commercial: 'comercial' };

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => (value == null ? NO_DATA : currency.format(value));
const wholeMoney = value => (value == null ? NO_DATA : wholeCurrency.format(value));
const percent = value => (value == null ? NO_DATA : `${decimal.format(value)}%`);
const signedPercent = value => (value == null ? NO_DATA : `${value > 0 ? '+' : ''}${decimal.format(value)}%`);
const perSquareMeter = text => `${text}<small>/m²</small>`;
const round2 = value => Math.round(value * 100) / 100;
const time = ({ hours, minutes }) => `${hours}h${String(minutes).padStart(2, '0')}`;

function tile(label, value, detail = '') {
  return `<div class="glass-panel tile"><span class="tile-label">${escapeHtml(label)}</span><strong class="tile-value">${value}</strong>${detail ? `<span class="tile-detail">${escapeHtml(detail)}</span>` : ''}</div>`;
}

/** Label and value pairs stacked in one cell. */
const keyValue = pairs => pairs.map(([key, value]) => `<span class="kv"><span class="kv-key">${escapeHtml(key)}</span><span class="kv-value">${value}</span></span>`).join('');

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
    this.municipalityPage = 0;
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
    this.renderParameters();
    this.fillLagMonths();
    this.renderSalary();
    this.bindEvents();
  }

  bindEvents() {
    this.$('capitalSearch').addEventListener('input', () => this.renderCapitals());
    this.$('capitalSort').addEventListener('change', () => this.renderCapitals());
    this.$('breakdownCapital').addEventListener('change', () => this.renderBreakdown());
    this.$('customWageCapital').addEventListener('change', () => this.renderCustomWage());
    this.$('customWageInput').addEventListener('input', () => this.renderCustomWage());
    this.$('lagUntil').addEventListener('change', () => this.renderSalary());
    this.$('salaryGrossInput').addEventListener('input', () => this.renderSalary());
    this.$('municipalitySearch').addEventListener('input', () => this.renderMunicipalities({ resetPage: true }));
    this.$('municipalityRegion').addEventListener('change', () => this.renderMunicipalities({ resetPage: true }));
    this.$('municipalityPrev').addEventListener('click', () => this.goToMunicipalityPage(this.municipalityPage - 1));
    this.$('municipalityNext').addEventListener('click', () => this.goToMunicipalityPage(this.municipalityPage + 1));
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

  /** @returns {{code: number, label: string}[]} Capitals for the settings panel, same order as the selects */
  capitalChoices() {
    return [...this.$('breakdownCapital').options].map(o => ({ code: Number(o.value), label: o.textContent }));
  }

  /** @param {number|null} code null goes back to São Paulo, the app default */
  selectCapital(code) {
    const capital = code ?? this.service.capitals({ query: 'São Paulo' }).find(c => c.capital === 'São Paulo').ibgeCode;
    this.$('breakdownCapital').value = String(capital);
    this.$('customWageCapital').value = String(capital);
    const estimate = this.$('estimateCity');
    // Some capitals have no FipeZAP data: the estimate keeps the city it had
    if ([...estimate.options].some(o => Number(o.value) === capital)) estimate.value = String(capital);
    this.renderBreakdown();
    this.renderCustomWage();
    this.renderEstimate();
  }

  /** @returns {number} NaN when the field is empty */
  typedWage() {
    const { value } = this.$('customWageInput');
    return value === '' ? Number.NaN : Number(value);
  }

  /** @param {number} wage */
  fillWage(wage) {
    this.$('customWageInput').value = String(wage);
    this.renderCustomWage();
  }

  /** @param {(wage: number) => void} callback */
  onWageTyped(callback) {
    this.$('customWageInput').addEventListener('input', () => callback(this.typedWage()));
  }

  wageRange() {
    const { min, max } = this.$('customWageInput');
    return { min: Number(min), max: Number(max) };
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

  /** Seal that tells the municipality's own survey from a regional reference. Text and icon, never color alone. */
  seal(kind, origin) {
    const own = kind === KIND.REAL;
    return `<span class="seal ${own ? 'seal-real' : 'seal-reference'}"><span class="stk-icon stk-icon-sm">${SVG_ICONS[own ? 'badgeCheck' : 'compass']}</span>`
      + `<span>${own ? 'Pesquisa do município' : 'Referência da região'}${origin ? `<small>${escapeHtml(origin)}</small>` : ''}</span></span>`;
  }

  basketCell(m) {
    const b = m.basketView;
    const origin = b.kind === KIND.REFERENCE ? `${b.originCity} (capital), ${b.period}` : `${b.period}${b.comparable ? '' : ', pesquisa local'}`;
    return `<span class="cell-stack"><span>${money(b.value)}</span>${this.seal(b.kind, origin)}</span>`;
  }

  estateCell(estate, yearsOfRent) {
    const lines = [['Compra', wholeMoney(estate.sale)], ['Aluguel', money(estate.rent)]];
    if (yearsOfRent !== undefined) lines.push(['Anos de aluguel', yearsOfRent == null ? NO_DATA : oneDecimal.format(yearsOfRent)]);
    const origin = estate.kind === KIND.REFERENCE ? `${estate.originCity} (${estate.levelLabel})` : '';
    return `<span class="cell-stack">${keyValue(lines)}${this.seal(estate.kind, origin)}</span>`;
  }

  renderMunicipalities({ resetPage = false } = {}) {
    if (resetPage) this.municipalityPage = 0;
    const rows = this.service.spMunicipalities({ query: this.$('municipalitySearch').value, region: this.$('municipalityRegion').value });
    this.lastMunicipalities = rows;
    const pages = Math.max(1, Math.ceil(rows.length / MUNICIPALITY_PAGE_SIZE));
    this.municipalityPage = Math.min(this.municipalityPage, pages - 1);
    const first = this.municipalityPage * MUNICIPALITY_PAGE_SIZE;
    const visible = rows.slice(first, first + MUNICIPALITY_PAGE_SIZE);
    this.$('municipalityCount').textContent = `${rows.length} municípios`;
    const c = this.service.spCoverage();
    this.$('municipalityCoverage').textContent = `No estado: cesta com pesquisa do município em ${c.basketReal} e referência em ${c.basketReference}; `
      + `imóvel residencial do próprio município em ${c.residentialReal} e referência em ${c.residentialReference}.`;
    this.$('municipalityPageInfo').textContent = rows.length
      ? `${first + 1} a ${first + visible.length} de ${rows.length}, página ${this.municipalityPage + 1} de ${pages}`
      : 'Nenhum município encontrado';
    this.$('municipalityPrev').disabled = this.municipalityPage === 0;
    this.$('municipalityNext').disabled = this.municipalityPage >= pages - 1;
    this.$('municipalityTable').innerHTML = table([
      { label: 'Município', cell: m => `<strong>${escapeHtml(m.municipality)}</strong> <small>IBGE ${m.ibgeCode} · ${escapeHtml(m.intermediateRegion)}</small>` },
      { label: 'Cesta básica', numeric: true, cell: m => this.basketCell(m) },
      { label: 'Na renda', numeric: true, cell: m => `<span class="cell-stack">${keyValue([['% do mínimo líquido', percent(m.wagePercent)], ['Tempo de trabalho', time(m.workTime)]])}</span>` },
      { label: 'Imóvel residencial (m²)', numeric: true, cell: m => this.estateCell(m.estate.residential, m.yearsOfRent) },
      { label: 'Imóvel comercial (m²)', numeric: true, cell: m => this.estateCell(m.estate.commercial) },
    ], visible);
  }

  goToMunicipalityPage(page) {
    this.municipalityPage = Math.max(0, page);
    this.renderMunicipalities();
    this.$('municipalityCount').scrollIntoView?.({ block: 'start' });
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

  fillLagMonths() {
    const months = this.service.lagMonths();
    this.$('lagUntil').innerHTML = months.map((m, i) => `<option value="${escapeHtml(m.value)}">${escapeHtml(m.label)}${i === 0 ? ' (ano fechado)' : (i === months.length - 1 ? ' (último mês)' : '')}</option>`).join('');
  }

  /** Seal as text and colour, with the reason in the tooltip: the word carries the meaning, the colour only helps. */
  static sealBadge(seal) {
    const exact = seal === 'exato';
    const reason = exact
      ? 'Fórmula exata e todos os números oficiais e confirmados'
      : 'Algum número ainda a confirmar na fonte primária, ou a fórmula depende de premissas';
    return `<span class="badge-status ${exact ? 'badge-ok' : 'badge-alerta'}" title="${escapeHtml(reason)}">${exact ? 'Exato' : 'Estimativa'}</span>`;
  }

  /** The numbers behind a result: what each is, its value, period and status (official/estimate, confirmed or to confirm). */
  static inputRows(inputs) {
    const names = {
      ipca_numero_indice: 'IPCA, número-índice (IBGE, SIDRA 1737)',
      irpf_isencao_mensal: 'Limite de isenção do IRPF (Receita Federal)',
      tabela_irpf_mensal: 'Tabela do IRPF e redução da Lei 15.270 (Receita Federal)',
      tabela_inss_empregado: 'Tabela do INSS do empregado',
    };
    return inputs.map(i => `<li>${escapeHtml(names[i.id] ?? i.id)}${typeof i.valor === 'number' ? `: <span class="mono">${escapeHtml(money(i.valor))}</span>` : ''} · ${escapeHtml(i.periodo)} · <span class="muted">${i.tipo === 'oficial' ? 'oficial' : 'estimativa'}, ${i.status === 'confirmado' ? 'confirmado' : 'a confirmar'}</span></li>`).join('');
  }

  renderSalary() {
    const gross = Number(this.$('salaryGrossInput').value);
    const typed = this.$('salaryGrossInput').value !== '';
    let result;
    try {
      result = this.service.incomeTaxLag({ grossIncome: gross > 0 ? gross : 0, untilMonth: this.$('lagUntil').value || undefined });
    } catch (error) {
      this.$('lagTiles').innerHTML = '';
      this.$('lagNote').textContent = error.message;
      return;
    }
    const { lag, personal } = result;
    const percentage = value => `${decimal.format(value)}%`;
    this.lastSalary = result;
    this.$('lagSeal').innerHTML = PriceMonitorView.sealBadge(lag.selo);
    this.$('lagTiles').innerHTML = [
      tile('A tabela está defasada em', percentage(lag.valor.lagPct), `Inflação de ${percentage((lag.inflationFactor - 1) * 100)} contra ${percentage((lag.currentExemption / lag.startExemption - 1) * 100)} de correção da isenção`),
      tile('Isenção hoje', money(lag.currentExemption), `Em 1996: ${money(lag.startExemption)}`),
      tile('Isenção corrigida seria', money(lag.correctedExemption), 'Por mês, de base de cálculo'),
      ...(lag.effective ? [tile('Isenção efetiva hoje (salário bruto)', wholeMoney(lag.effective.currentGross), `Corrigida: ${money(lag.effective.correctedGross)} brutos (${percentage(lag.effective.pctAbove)} a mais)`)] : []),
    ].join('');
    this.$('lagNote').textContent = `${lag.base}. Os 157% do Sindifisco usam outro método e não são calculados aqui.`;
    this.$('salaryInputs').innerHTML = PriceMonitorView.inputRows(personal ? personal.insumos : lag.insumos);

    if (!personal) {
      this.$('salarySeal').innerHTML = '';
      this.$('salaryTiles').innerHTML = '';
      this.$('salaryTable').innerHTML = '';
      this.$('salaryNote').textContent = typed && gross < 0 ? 'Informe um salário maior que zero.' : 'Informe seu salário bruto para ver a comparação.';
      return;
    }
    const v = personal.valor;
    this.$('salarySeal').innerHTML = PriceMonitorView.sealBadge(personal.selo);
    this.$('salaryTiles').innerHTML = [
      tile('Imposto pela regra de 2026', money(v.tax2026), 'Tabela atual, já com a redução da Lei 15.270'),
      tile('Com a tabela corrigida', money(v.correctedTax), `Isenção de ${money(lag.correctedExemption)}`),
      tile('Você pagaria a menos, por mês', money(v.monthlyDifference)),
      tile('Em 12 meses', money(v.annualDifference), 'Sem 13º nem ajuste anual'),
    ].join('');
    const rows = [
      ['Salário bruto', v.grossIncome],
      ['INSS (progressivo)', -v.inss],
      [v.usesSimplifiedDiscount ? 'Dedução usada: desconto simplificado' : 'Dedução usada: INSS', -v.deduction],
      ['Base de cálculo', v.base],
      ['Imposto pela tabela de 2026', v.tableTax],
      ['Redução da Lei 15.270 (sobre o bruto)', -v.reduction],
      ['Imposto em 2026', v.tax2026],
      ['Imposto pela tabela corrigida', v.correctedTax],
    ];
    this.$('salaryTable').innerHTML = table([
      { label: 'Passo', cell: r => escapeHtml(r[0]) },
      { label: 'Valor', numeric: true, cell: r => money(r[1]) },
    ], rows);
    this.$('salaryNote').textContent = personal.selo === 'exato'
      ? ''
      : 'Estimativa: a tabela do INSS de 2026 ainda está marcada "a confirmar" (ver Números usados).';
  }

  renderParameters() {
    const used = this.service.sources.parameters ?? [];
    this.$('parameterTable').innerHTML = table([
      { label: 'Número', cell: p => `<span class="mono">${escapeHtml(p.id)}</span>` },
      { label: 'Valor', numeric: true, cell: p => escapeHtml(String(p.value)) },
      { label: 'Referência', cell: p => escapeHtml(p.referenceDate) },
      { label: 'Situação', cell: p => `${p.kind === 'oficial' ? 'oficial' : 'estimativa'}, ${p.status === 'confirmado' ? 'confirmado' : 'a confirmar'}` },
      { label: 'Fonte', cell: p => (p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.source)}</a>` : escapeHtml(p.source)) },
    ], used, 'Sem parâmetros registrados.');
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
      const kind = value => (value === KIND.REAL ? 'real' : 'referência');
      const estateColumns = e => [kind(e.kind), e.originCity, e.kind === KIND.REAL ? '' : e.levelLabel, e.sale, e.rent];
      return { name: 'municipios-sp-set2026.csv', rows: [
        ['Código IBGE', 'Município', 'Região intermediária', 'Região imediata',
          'Tipo da cesta (real/referência)', 'Origem da cesta', 'Cesta', 'Período da cesta', 'Fonte da cesta', '% do mínimo líquido (sobre o valor da coluna Cesta)', 'Tempo de trabalho (sobre o valor da coluna Cesta)',
          'Tipo do imóvel residencial (real/referência)', 'Origem do imóvel residencial', 'Nível da referência residencial', 'Compra residencial (R$/m²)', 'Aluguel residencial (R$/m²)', 'Anos de aluguel residencial',
          'Tipo do imóvel comercial (real/referência)', 'Origem do imóvel comercial', 'Nível da referência comercial', 'Compra comercial (R$/m²)', 'Aluguel comercial (R$/m²)'],
        ...this.lastMunicipalities.map(m => [m.ibgeCode, m.municipality, m.intermediateRegion, m.immediateRegion,
          kind(m.basketView.kind), m.basketView.originCity, m.basketView.value, m.basketView.period, m.basketView.source, round2(m.wagePercent), time(m.workTime),
          ...estateColumns(m.estate.residential), m.yearsOfRent == null ? null : round2(m.yearsOfRent),
          ...estateColumns(m.estate.commercial)]),
      ] };
    }
    if (tabId === 'tabImoveis') {
      const s = this.segment;
      return { name: `imoveis-${SEGMENT_LABEL[s]}-set2026.csv`, rows: [
        ['Código IBGE', 'Cidade', 'UF', 'Região', 'Compra (R$/m²)', 'Compra em 12 meses (%)', 'Aluguel (R$/m²)', 'Aluguel em 12 meses (%)', 'Rentabilidade ao ano (%)'],
        ...this.lastCities.map(c => [c.ibgeCode, c.city, c.uf, c.macroRegion, c[`${s}Sale`], c[`${s}SaleChange12m`], c[`${s}Rent`], c[`${s}RentChange12m`], c[`${s}Yield`]]),
      ] };
    }
    if (tabId === 'tabSalario') {
      const { lag, personal } = this.lastSalary;
      const rows = [
        ['Defasagem da tabela do IRPF (%)', round2(lag.valor.lagPct)], ['Isenção de hoje (R$)', lag.currentExemption], ['Isenção corrigida (R$)', lag.correctedExemption],
        ['Inflação até', lag.untilMonth], ['Selo', lag.selo],
        ...(personal ? [['Salário bruto (R$)', personal.valor.grossIncome], ['Imposto em 2026 (R$)', personal.valor.tax2026], ['Imposto com a tabela corrigida (R$)', personal.valor.correctedTax],
          ['Diferença por mês (R$)', personal.valor.monthlyDifference], ['Diferença em 12 meses (R$)', personal.valor.annualDifference], ['Selo da comparação', personal.selo]] : []),
      ];
      return { name: 'seu-salario-defasagem-irpf.csv', rows: [['Item', 'Valor'], ...rows] };
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
