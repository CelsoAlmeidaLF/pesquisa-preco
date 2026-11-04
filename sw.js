/**
 * Service Worker da Pesquisa de Preços (PWA).
 * Pré-carrega o app para abrir offline. Páginas: rede primeiro. Demais arquivos: cache e atualização em segundo plano.
 * Sem telemetria. CACHE_VERSION e APP_SHELL são gerados por scripts/versionar.mjs: não edite à mão.
 */
// <versionar>
const CACHE_VERSION = 'pesquisa-preco-20261104-1703';
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/app-icon-32.png",
  "icons/app-icon-192.png",
  "icons/apple-touch-icon.png",
  "css/fonts.css?v=20261104-1703",
  "vendor/stk-gov/stk-gov.css?v=20261104-1703",
  "css/style.css?v=20261104-1703",
  "icons/app-icon-64.png",
  "src/Program.js?v=20261104-1703",
  "src/application/PriceMonitorService.js?v=20261104-1703",
  "src/domain/BasketCalculator.js?v=20261104-1703",
  "src/domain/RealEstateCalculator.js?v=20261104-1703",
  "src/infrastructure/CsvExporter.js?v=20261104-1703",
  "src/infrastructure/data/BasketData.js?v=20261104-1703",
  "src/infrastructure/data/RealEstateData.js?v=20261104-1703",
  "src/infrastructure/data/SaoPauloData.js?v=20261104-1703",
  "src/infrastructure/data/SourcesData.js?v=20261104-1703",
  "src/ui/PriceMonitorView.js?v=20261104-1703",
  "src/ui/SvgIcons.js?v=20261104-1703",
  "vendor/fonts/ibm-plex-mono-latin-400-normal.woff2",
  "vendor/fonts/ibm-plex-mono-latin-500-normal.woff2",
  "vendor/fonts/ibm-plex-mono-latin-600-normal.woff2",
  "vendor/fonts/inter-latin-400-normal.woff2",
  "vendor/fonts/inter-latin-500-normal.woff2",
  "vendor/fonts/inter-latin-600-normal.woff2",
  "vendor/fonts/inter-latin-700-normal.woff2",
  "vendor/fonts/space-grotesk-latin-ext.woff2",
  "vendor/fonts/space-grotesk-latin.woff2",
  "vendor/stk-gov/stk-gov-shell.js?v=20261104-1703",
  "vendor/stk-gov/stk-gov-pwa.js?v=20261104-1703",
  "icons/app-icon-512.png"
];
// </versionar>

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: rede primeiro (HTML sempre atual); sem rede, abre o index.html do shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('index.html', { cacheName: CACHE_VERSION }))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
