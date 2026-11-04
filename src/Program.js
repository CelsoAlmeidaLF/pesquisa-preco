/** Composition root / src/Program.js: wires data, service, view, shell and PWA. */
import { StkGovShell, renderStkIcons } from '../vendor/stk-gov/stk-gov-shell.js?v=20261104-1639';
import { StkGovPwa } from '../vendor/stk-gov/stk-gov-pwa.js?v=20261104-1639';
import { PriceMonitorService } from './application/PriceMonitorService.js?v=20261104-1639';
import { downloadCsv } from './infrastructure/CsvExporter.js?v=20261104-1639';
import { BASKET_DATA } from './infrastructure/data/BasketData.js?v=20261104-1639';
import { REAL_ESTATE_DATA } from './infrastructure/data/RealEstateData.js?v=20261104-1639';
import { SAO_PAULO_MUNICIPALITIES } from './infrastructure/data/SaoPauloData.js?v=20261104-1639';
import { SOURCES_DATA } from './infrastructure/data/SourcesData.js?v=20261104-1639';
import { PriceMonitorView } from './ui/PriceMonitorView.js?v=20261104-1639';
import { SVG_ICONS } from './ui/SvgIcons.js?v=20261104-1639';

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
}

try {
  main();
} catch (error) {
  console.error(error);
  document.getElementById('appFatalError').hidden = false;
}
