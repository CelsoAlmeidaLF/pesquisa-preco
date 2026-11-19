/** Composition root / src/Program.js: wires data, service, view, shell and PWA. */
import { StkGovShell, renderStkIcons } from '../vendor/stk-gov/stk-gov-shell.js?v=20261119-1403';
import { StkGovPwa } from '../vendor/stk-gov/stk-gov-pwa.js?v=20261119-1403';
import { StkGovConfig } from '../vendor/stk-gov/stk-gov-config.js?v=20261119-1403';
import { PreferencesService } from './application/PreferencesService.js?v=20261119-1403';
import { PriceMonitorService } from './application/PriceMonitorService.js?v=20261119-1403';
import { LocalPreferencesStore } from './infrastructure/LocalPreferencesStore.js?v=20261119-1403';
import { downloadCsv } from './infrastructure/CsvExporter.js?v=20261119-1403';
import { BASKET_DATA } from './infrastructure/data/BasketData.js?v=20261119-1403';
import { REAL_ESTATE_DATA } from './infrastructure/data/RealEstateData.js?v=20261119-1403';
import { SAO_PAULO_MUNICIPALITIES } from './infrastructure/data/SaoPauloData.js?v=20261119-1403';
import { SOURCES_DATA } from './infrastructure/data/SourcesData.js?v=20261119-1403';
import { preferencesSection } from './ui/PreferencesPanel.js?v=20261119-1403';
import { PriceMonitorView } from './ui/PriceMonitorView.js?v=20261119-1403';
import { SVG_ICONS } from './ui/SvgIcons.js?v=20261119-1403';

function showToast(message) {
  const toast = document.getElementById('appToast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function main() {
  const service = new PriceMonitorService({
    basket: BASKET_DATA, realEstate: REAL_ESTATE_DATA, municipalities: SAO_PAULO_MUNICIPALITIES, sources: SOURCES_DATA,
  });
  const view = new PriceMonitorView(service);
  renderStkIcons(SVG_ICONS);
  view.start();

  const preferences = new PreferencesService({
    store: new LocalPreferencesStore(),
    isCapital: code => BASKET_DATA.capitals.some(c => c.ibgeCode === code),
    wageRange: view.wageRange(),
  });
  const capital = preferences.preferredCapital();
  if (capital !== null) view.selectCapital(capital);
  const wage = preferences.rememberedWage();
  if (wage !== null) view.fillWage(wage);
  view.onWageTyped(typed => preferences.saveWage(typed));

  let currentTab = 'tabPanorama';
  const shell = new StkGovShell({ app: 'pesquisa-preco', onTabChange: tab => { currentTab = tab; } });
  shell.iniciar();

  document.getElementById('btnExportCsv').addEventListener('click', () => {
    const { name, rows } = view.csvFor(currentTab);
    downloadCsv(name, rows);
    showToast(`Arquivo ${name} baixado.`);
  });
  document.getElementById('footerSources').addEventListener('click', event => {
    event.preventDefault();
    document.querySelector('.sidebar-nav-item[data-tab="tabFontes"]').click();
  });

  const pwa = new StkGovPwa('sw.js');
  pwa.init();
  pwa.ligarBotao(document.getElementById('btnInstallApp'));

  new StkGovConfig({
    app: 'pesquisa-preco',
    nome: 'Pesquisa de Preços Brasil',
    pwa,
    rotulosDados: { capital: 'Capital ao abrir o app', renda: 'Renda mensal' },
    dataDosDados: () => `Referência: ${BASKET_DATA.period}`,
    secoes: [preferencesSection({ preferences, view })],
  }).iniciar();
}

try {
  main();
} catch (error) {
  console.error(error);
  document.getElementById('appFatalError').hidden = false;
}
