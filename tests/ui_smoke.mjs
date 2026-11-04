/**
 * Tests / tests/ui_smoke.mjs
 * Teste de tela num Chrome de verdade (headless), sem dependências npm.
 * Confere: sem erros de JavaScript, números da fonte na tela, abas, filtros, cálculos,
 * gaveta (tablet), barra inferior e cartões (celular), sem rolagem lateral e service worker ativo.
 *
 * Uso: npm run test:ui. Com a variável CAPTURAS=pasta, salva imagens das telas.
 * Sem Chrome instalado, o teste é pulado (sai com código 0 e avisa).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const chromeBin = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  .find(b => spawnSync('which', [b]).status === 0);
if (!chromeBin || typeof WebSocket === 'undefined') {
  console.log(`[PULADO] ${!chromeBin ? 'Chrome não encontrado' : 'WebSocket indisponível (use --experimental-websocket no Node 20)'}`);
  process.exit(0);
}

let passou = 0;
let falhou = 0;
const assert = (cond, msg) => {
  if (cond) { passou++; console.log(`  [PASS] ${msg}`); } else { falhou++; console.error(`  [FAIL] ${msg}`); }
};

// Servidor estático mínimo (o service worker e os módulos ES exigem http)
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const servidor = createServer(async (req, res) => {
  const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const corpo = await readFile(join(raiz, caminho === '/' ? 'index.html' : caminho));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || 'application/octet-stream' });
    res.end(corpo);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}/index.html`;

const perfil = await mkdtemp(join(tmpdir(), 'preco-ui-'));
const porta = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromeBin, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
const esperar = ms => new Promise(r => setTimeout(r, ms));

let ws;
for (let i = 0; i < 30 && !ws; i++) {
  try {
    const abas = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
    ws = new WebSocket(abas.find(t => t.type === 'page').webSocketDebuggerUrl);
  } catch { await esperar(200); }
}
await new Promise(r => ws.addEventListener('open', r));
let seq = 0;
const pendentes = {};
const erros = [];
ws.addEventListener('message', m => {
  const d = JSON.parse(m.data);
  if (d.method === 'Log.entryAdded' && /Content Security Policy/i.test(d.params.entry.text)) erros.push(d.params.entry.text);
  if (d.method === 'Runtime.exceptionThrown') erros.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (pendentes[d.id]) { pendentes[d.id](d); delete pendentes[d.id]; }
});
const cdp = (method, params = {}) => new Promise(r => { pendentes[++seq] = r; ws.send(JSON.stringify({ id: seq, method, params })); });
const avaliar = async expr => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result.exceptionDetails ? `ERRO ${r.result.exceptionDetails.exception?.description}` : r.result.result.value;
};
const tela = (largura, celular = false) => cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: 900, deviceScaleFactor: 1, mobile: celular });
const abrir = async () => { await cdp('Page.navigate', { url: base }); await esperar(1800); };
const aba = async id => { await avaliar(`document.querySelector('.sidebar-nav-item[data-tab=${id}]').click()`); await esperar(250); };
const texto = id => avaliar(`document.getElementById('${id}').textContent`);
const definir = async (id, valor) => {
  await avaliar(`(() => { const el = document.getElementById('${id}'); el.value = ${JSON.stringify(valor)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await esperar(150);
};
const semRolagem = () => avaliar('document.documentElement.scrollWidth <= innerWidth');
const capturar = async nome => {
  if (!process.env.CAPTURAS) return;
  const { result } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(process.env.CAPTURAS, `${nome}.png`), Buffer.from(result.data, 'base64'));
};
const ABAS = ['tabPanorama', 'tabCapitais', 'tabMunicipios', 'tabImoveis', 'tabFontes'];

try {
  await cdp('Runtime.enable');
  await cdp('Log.enable');
  await cdp('Page.enable');

  console.log('\n1. Desktop (1400 px)');
  await tela(1400);
  await abrir();
  assert(await avaliar('appFatalError.hidden'), 'Página abre sem aviso de falha');
  const painel = await texto('basketTiles');
  assert(painel.includes('922,51') && painel.includes('São Paulo (SP)'), 'Cesta mais cara: São Paulo, R$ 922,51');
  assert(painel.includes('587,76') && painel.includes('Aracaju (SE)'), 'Cesta mais barata: Aracaju, R$ 587,76');
  assert(painel.includes('7.750,01'), 'Salário mínimo necessário: R$ 7.750,01');
  const mercado = await texto('marketTiles');
  assert(['10.015', '54,77', '8.846', '54,64'].every(v => mercado.includes(v)), 'Médias do FipeZAP na tela');
  assert(await avaliar('document.querySelectorAll("#itemTable tbody tr").length') === 15, 'Ranking com 15 linhas (13 itens, feijão e farinha em dois tipos)');
  await capturar('desktop-panorama');

  await aba('tabCapitais');
  assert(await avaliar('document.querySelectorAll("#capitalTable tbody tr").length') === 27, '27 capitais na tabela');
  assert(await avaliar('document.querySelectorAll("#capitalBars .bar-row").length') === 27, '27 barras no gráfico');
  assert((await avaliar('document.querySelector("#capitalBars .bar-label").textContent')) === 'São Paulo (SP)', 'Gráfico começa pela cesta mais cara');
  await capturar('desktop-capitais');
  await definir('capitalSearch', 'sao luis');
  assert(await avaliar('document.querySelectorAll("#capitalTable tbody tr").length') === 1, 'Busca sem acento acha São Luís');
  await definir('capitalSearch', 'xyz');
  assert((await texto('capitalTable')).includes('Nada encontrado'), 'Busca vazia avisa que não achou nada');
  await definir('capitalSearch', '');
  assert((await texto('breakdownNote')).includes('Total publicado: R$'), 'Conta da cesta mostra soma e total publicado');

  await aba('tabMunicipios');
  assert(await avaliar('document.querySelectorAll("#municipalityTable tbody tr").length') === 28, '28 municípios de SP');
  const municipios = await texto('municipalityTable');
  assert(municipios.includes('São José do Rio Preto') && !municipios.includes('Alphaville') && !municipios.includes('(Capital)'), 'Nomes oficiais do IBGE, sem apelidos');
  await definir('municipalityRegion', 'Sorocaba');
  assert((await texto('municipalityTable')).includes('Sorocaba'), 'Filtro por região intermediária funciona');
  await definir('municipalityRegion', 'ALL');
  assert(await avaliar('(w => w.scrollWidth <= w.clientWidth)(document.querySelector("#municipalityTable").parentElement)'), 'Tabela de municípios cabe sem rolagem');
  await capturar('desktop-municipios');

  await aba('tabImoveis');
  assert(await avaliar('document.querySelectorAll("#estateTable tbody tr").length') === 56, '56 cidades no residencial');
  await definir('estimateArea', '100');
  assert((await texto('estimateTiles')).includes('1.220.600'), 'Estimativa: 100 m² em São Paulo por R$ 12.206/m²');
  await definir('estimateArea', '0');
  assert((await texto('estimateNote')).includes('maior que zero'), 'Área inválida é recusada');
  await definir('estimateArea', '250');
  await avaliar('document.querySelector("[data-segment=commercial]").click()'); await esperar(200);
  assert(await avaliar('document.querySelectorAll("#estateTable tbody tr").length') === 10, 'Comercial mostra 10 cidades');
  assert((await texto('estimateNote')).includes('200 m²'), 'Aviso acima de 200 m² no comercial');
  await definir('estimateArea', '70');
  await capturar('desktop-imoveis');
  await aba('tabFontes');
  assert(await avaliar('document.querySelectorAll("#tabFontes .link-list a").length') === 10, '10 links de fontes');
  assert(await avaliar('[...document.querySelectorAll("#hashTable .hash")].every(e => /^[0-9a-f]{64}$/.test(e.textContent))'), 'Hashes SHA-256 na tela');
  await capturar('desktop-fontes');
  await avaliar('document.querySelector(".sidebar-nav-item[data-tab=tabPanorama]").click()');
  await avaliar('btnExportCsv.click()'); await esperar(200);
  assert(await avaliar('appToast.classList.contains("show")'), 'Botão CSV baixa e avisa');
  assert(await avaliar('getComputedStyle(appBottomNav).display') === 'none' && await semRolagem(), 'Desktop sem barra inferior nem rolagem lateral');

  console.log('\n2. Tablet (820 px)');
  await tela(820);
  await abrir();
  await avaliar('btnToggleSidebar.click()'); await esperar(400);
  assert(await avaliar('appSidebar.classList.contains("sidebar-open")'), 'Botão de menu abre a gaveta');
  await avaliar('btnCloseSidebar.click()'); await esperar(300);
  for (const id of ABAS) { await aba(id); assert(await semRolagem(), `${id}: sem rolagem lateral`); }

  for (const largura of [390, 320]) {
    console.log(`\n3. Celular (${largura} px)`);
    await tela(largura, true);
    await abrir();
    assert(await avaliar('getComputedStyle(appBottomNav).display') !== 'none', 'Barra inferior visível');
    for (const id of ABAS) {
      await avaliar(`document.querySelector('.bottom-nav-item[data-tab=${id}]').click()`); await esperar(250);
      assert(await semRolagem(), `${id}: sem rolagem lateral`);
      await capturar(`celular-${largura}-${id}`);
    }
    await avaliar('document.querySelector(".bottom-nav-item[data-tab=tabCapitais]").click()'); await esperar(200);
    assert(await avaliar('getComputedStyle(document.querySelector("#capitalTable td")).display') === 'flex', 'Tabela vira cartões');
    await avaliar('document.querySelector(".bottom-nav-item[data-tab=tabPanorama]").click()'); await esperar(200);
    assert(await avaliar('[...document.querySelectorAll("#tabPanorama .tile-value")].every(e => e.scrollWidth <= e.clientWidth + 1)'), 'Valores dos cartões cabem sem cortar');
  }

  assert(await avaliar('navigator.serviceWorker.getRegistration().then(r => !!(r && (r.active || r.installing || r.waiting)))'), 'Service worker registrado');
  await avaliar('document.querySelector(".skip-link").click()');
  assert(await avaliar('document.activeElement === document.querySelector("main") && !location.hash.includes("conteudo")'), 'Atalho leva o foco ao conteúdo sem mudar o endereço');
  assert(erros.length === 0, `Nenhum erro de JavaScript${erros.length ? `: ${erros.join(' | ')}` : ''}`);
} finally {
  ws.close();
  chrome.kill();
  servidor.close();
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
}

console.log(`\nTotal: ${passou + falhou} | Passou: ${passou} | Falhou: ${falhou}\n`);
process.exit(falhou ? 1 : 0);
