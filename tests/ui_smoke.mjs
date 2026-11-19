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
const ABAS = ['tabPanorama', 'tabCapitais', 'tabMunicipios', 'tabImoveis', 'tabSalario', 'tabFontes'];

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

  assert(await avaliar('customWageCapital.options.length') === 27, 'Calculadora de renda lista as 27 capitais');
  assert(await avaliar('customWageCapital.selectedOptions[0].textContent') === 'São Paulo (SP)', 'Calculadora de renda começa em São Paulo');
  assert(await avaliar('customWageTiles.children.length') === 0 && (await texto('customWageNote')).includes('Preencha sua renda'), 'Renda vazia orienta o preenchimento');
  await definir('customWageInput', '3000');
  const renda = await texto('customWageTiles');
  assert(await avaliar('customWageTiles.children.length') === 4 && ['67h39', '8,5', '30,75%', '922,51'].every(v => renda.includes(v)), 'Renda de R$ 3.000 em São Paulo: 67h39, 8,5 dias, 30,75%, R$ 922,51');
  await capturar('desktop-renda');
  await definir('customWageCapital', String(await avaliar('[...customWageCapital.options].find(o => o.textContent === "Aracaju (SE)").value')));
  assert((await texto('customWageTiles')).includes('587,76'), 'Trocar a capital recalcula a cesta');
  await definir('customWageInput', '500');
  assert((await texto('customWageNote')).includes('mais do que a renda') && (await texto('customWageTiles')).includes('117,55%'), 'Renda menor que a cesta passa de 100% e avisa');
  for (const invalido of ['', '0', '-50', '99', '1000001']) {
    await definir('customWageInput', invalido);
    assert(await avaliar('customWageTiles.children.length') === 0 && (await texto('customWageNote')).includes('Preencha sua renda'), `Renda inválida (${invalido || 'vazia'}) orienta o preenchimento`);
  }

  await aba('tabMunicipios');
  const linhas = () => avaliar('document.querySelectorAll("#municipalityTable tbody tr").length');
  assert((await texto('municipalityCount')) === '645 municípios', 'Lista os 645 municípios de SP');
  assert(await linhas() === 50, 'Mostra 50 por página, para não travar o celular');
  assert((await texto('municipalityPageInfo')).includes('1 a 50 de 645') && await avaliar('municipalityPrev.disabled && !municipalityNext.disabled'), 'Paginação começa na primeira página');
  await avaliar('municipalityNext.click()'); await esperar(150);
  assert((await texto('municipalityPageInfo')).includes('51 a 100 de 645') && await avaliar('!municipalityPrev.disabled'), 'Próxima página avança de 50 em 50');
  await avaliar('municipalityPrev.click()'); await esperar(150);
  await definir('municipalitySearch', 'SAO JOSE DO RIO PRETO');
  assert(await linhas() === 1 && (await texto('municipalityTable')).includes('São José do Rio Preto'), 'Busca sem acento nem caixa acha o município');
  assert(await avaliar('municipalityNext.disabled && municipalityPrev.disabled'), 'Com poucos resultados a paginação trava');
  await definir('municipalitySearch', 'zzzz');
  assert((await texto('municipalityTable')).includes('Nada encontrado') && (await texto('municipalityCount')) === '0 municípios', 'Busca sem resultado avisa');
  await definir('municipalitySearch', 'campinas');
  const campinas = await texto('municipalityTable');
  assert(campinas.includes('832,99') && campinas.includes('Pesquisa do município'), 'Campinas mostra o valor real com o selo de pesquisa do município');
  await definir('municipalitySearch', 'adamantina');
  const adamantina = await texto('municipalityTable');
  assert(adamantina.includes('922,51') && adamantina.includes('Referência da região') && adamantina.includes('São Paulo (capital)') && !adamantina.includes('Pesquisa do município'), 'Município sem pesquisa mostra a referência da capital, marcada e com a cidade de origem');
  await definir('municipalitySearch', 'adolfo');
  assert((await texto('municipalityTable')).includes('São José do Rio Preto (região imediata)'), 'Referência de imóvel diz a cidade e o nível de origem');
  const estiloSelo = tipo => avaliar(`(e => e && getComputedStyle(e).borderTopStyle + '|' + getComputedStyle(e).color)(document.querySelector('#municipalityTable .seal-${tipo}'))`);
  const estiloReferencia = await estiloSelo('reference');
  await definir('municipalitySearch', 'campinas');
  const estiloReal = await estiloSelo('real');
  assert(estiloReferencia && estiloReal && estiloReal.startsWith('solid') && estiloReferencia.startsWith('dashed') && estiloReal !== estiloReferencia, 'Selo de pesquisa do município e selo de referência têm aparência própria');
  await definir('municipalitySearch', '');
  assert(await avaliar('[...document.querySelectorAll("#municipalityTable .seal")].every(e => e.querySelector("svg") && !/[\\u{1F300}-\\u{1FAFF}]/u.test(e.textContent))'), 'Selos com ícone SVG e sem emoji');
  await definir('municipalityRegion', 'Sorocaba');
  const sorocaba = await texto('municipalityTable');
  assert(sorocaba.includes('Sorocaba') && (await texto('municipalityCount')) !== '645 municípios', 'Filtro por região intermediária funciona');
  await definir('municipalityRegion', 'ALL');
  assert(await avaliar('(w => w.scrollWidth <= w.clientWidth)(document.querySelector("#municipalityTable").parentElement)'), 'Tabela de municípios cabe sem rolagem');
  await avaliar('window.__csv = null; URL.createObjectURL = b => { window.__csv = b; return "blob:teste"; }; btnExportCsv.click()'); await esperar(300);
  const csv = await avaliar('window.__csv ? window.__csv.text() : ""');
  const linhasCsv = csv.trim().split('\r\n');
  assert(linhasCsv.length === 646 && linhasCsv[0].includes('Tipo da cesta (real/referência)') && linhasCsv[0].includes('Origem da cesta'), 'CSV exporta os 645 municípios, com colunas de tipo e de origem');
  assert(linhasCsv.some(l => l.includes(';real;Campinas;832,99')) && linhasCsv.filter(l => l.includes(';referência;São Paulo;922,51')).length === 643, 'CSV: Campinas real e 643 com referência da capital');
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
  // Valores de 2026 (tabela do IRPF com a Lei 15.270 e IPCA até dez/2025): mudam junto com a vigência de janeiro (ADR-001, revisão em 15/01/2027)
  await aba('tabSalario');
  const defasagem = await texto('lagTiles');
  assert(['120,48%', '2.428,80', '5.355,09', '5.996,0'].every(v => defasagem.includes(v)), 'Seu salário: tabela 120,48% defasada, isenção de R$ 2.428,80 e corrigida de R$ 5.355,09');
  assert((await texto('lagSeal')) === 'Estimativa' && (await texto('lagNote')).includes('Lei 15.270 não entra') && (await texto('lagNote')).includes('depende da base e do método'), 'Defasagem tem selo Estimativa, diz qual base usa e avisa que depende do método');
  assert(await avaliar('salaryTiles.children.length') === 0 && (await texto('salaryNote')).includes('Informe seu salário bruto'), 'Sem salário, a comparação orienta o preenchimento');
  await definir('salaryGrossInput', '6000');
  const pessoal = await texto('salaryTiles');
  assert(await avaliar('salaryTiles.children.length') === 4 && ['385,10', '0,26', '384,84', '4.618,08'].every(v => pessoal.includes(v)), 'Salário de R$ 6.000: paga R$ 385,10 hoje, R$ 0,26 com a tabela corrigida (R$ 384,84 por mês)');
  assert((await texto('salarySeal')) === 'Estimativa' && (await texto('salaryNote')).includes('INSS'), 'Comparação pessoal é estimativa enquanto o INSS estiver a confirmar, e diz por quê');
  assert((await texto('salaryTable')).includes('564,85') && (await texto('salaryTable')).includes('179,75'), 'Passo a passo mostra a tabela (R$ 564,85) e a redução (R$ 179,75)');
  assert(await avaliar('document.querySelectorAll("#salaryInputs li").length') === 5, 'Lista os 5 números usados com a situação de cada um');
  assert(!(await avaliar('Object.values(localStorage).some(v => v.includes("6000"))')) && !(await avaliar('Object.keys(localStorage).some(k => /sal/i.test(k))')), 'O salário digitado não vai para o armazenamento do navegador');
  await definir('lagUntil', '2026-10');
  assert((await texto('lagTiles')).includes('129,'), 'Medir até out/2026 sobe a defasagem para 129%');
  await definir('lagUntil', '2025-12');
  for (const invalido of ['-50', '']) {
    await definir('salaryGrossInput', invalido);
    assert(await avaliar('salaryTiles.children.length') === 0 && (await texto('salaryNote')).length > 0, `Salário inválido (${invalido || 'vazio'}) não calcula e orienta`);
  }
  await definir('salaryGrossInput', '');
  await capturar('desktop-salario');
  await aba('tabFontes');
  assert(await avaliar('document.querySelectorAll("#tabFontes .link-list a").length') === 14, '14 links de fontes');
  assert(await avaliar('document.querySelectorAll("#parameterTable tbody tr").length') === 5 && (await texto('parameterTable')).includes('a confirmar'), 'Fontes lista os 5 parâmetros do build, com a situação (a confirmar)');
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
    await avaliar('document.querySelector(".bottom-nav-item[data-tab=tabMunicipios]").click()'); await esperar(200);
    assert(await avaliar('getComputedStyle(document.querySelector("#municipalityTable td")).display') === 'flex' && await avaliar('document.querySelectorAll("#municipalityTable tbody tr").length') === 50, 'Municípios: 50 cartões por página');
    assert(await avaliar('[...document.querySelectorAll("#municipalityTable .seal")].every(e => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= innerWidth)'), 'Selos de origem cabem na tela');
    await definir('municipalitySearch', 'adamantina');
    assert(await semRolagem() && (await texto('municipalityTable')).includes('Referência da região'), 'Busca e selo funcionam no celular');
    await avaliar('municipalityTable.scrollIntoView({block:"start"})'); await esperar(500); await capturar(`celular-${largura}-municipio-cartao`);
    await definir('municipalitySearch', '');
    await avaliar('document.querySelector(".bottom-nav-item[data-tab=tabCapitais]").click()'); await esperar(200);
    assert(await avaliar('getComputedStyle(document.querySelector("#capitalTable td")).display') === 'flex', 'Tabela vira cartões');
    await definir('customWageInput', '3000');
    assert(await avaliar('customWageTiles.children.length === 4 && [...document.querySelectorAll("#customWageTiles .tile > *")].every(e => e.scrollWidth <= e.clientWidth + 1)') && await semRolagem(), 'Cartões da renda cabem sem cortar');
    await avaliar('document.querySelector(".bottom-nav-item[data-tab=tabSalario]").click()'); await esperar(200);
    await definir('salaryGrossInput', '6000');
    assert(await avaliar('salaryTiles.children.length === 4 && [...document.querySelectorAll("#tabSalario .tile > *")].every(e => e.scrollWidth <= e.clientWidth + 1)') && await semRolagem(), 'Seu salário: cartões cabem sem cortar e sem rolagem lateral');
    await definir('salaryGrossInput', '');
    await avaliar('document.querySelector(".bottom-nav-item[data-tab=tabPanorama]").click()'); await esperar(200);
    assert(await avaliar('[...document.querySelectorAll("#tabPanorama .tile-value")].every(e => e.scrollWidth <= e.clientWidth + 1)'), 'Valores dos cartões cabem sem cortar');
  }

  console.log('\n4. Configurações');
  const reabrir = async (url = base) => { await cdp('Page.navigate', { url: 'about:blank' }); await esperar(300); await abrir(url); };
  const configAberta = () => avaliar('stkConfig.open');
  const escolher = async (nome, valor) => { await avaliar(`document.querySelector('input[name=${nome}][value=${valor}]').click()`); await esperar(500); };
  await tela(1400);
  await reabrir();
  await avaliar('localStorage.clear()');
  await reabrir();
  assert(await avaliar('document.documentElement.dataset.theme') === 'dark', 'Tema escuro é o padrão');
  await avaliar('btnConfig.click()'); await esperar(200);
  assert(await configAberta(), 'Engrenagem do topo abre o painel');
  await escolher('stkTema', 'claro');
  assert(await avaliar(`document.documentElement.dataset.theme === 'light' && localStorage.getItem('pesquisa-preco.tema') === 'claro' && document.querySelector('meta[name=theme-color]').content === '#F7FAF8'`), 'Tema claro aplica e fica salvo');
  await avaliar('document.querySelector(".stk-config-fechar").click()'); await esperar(100);
  assert(!(await configAberta()), 'Botão fechar fecha o painel');
  await reabrir();
  assert(await avaliar('document.documentElement.dataset.theme') === 'light', 'Tema claro continua depois de recarregar');
  await avaliar(`localStorage.setItem('pesquisa-preco.tema', 'roxo')`);
  await reabrir();
  assert(await avaliar('document.documentElement.dataset.theme') === 'dark', 'Valor salvo inválido volta ao escuro');
  await tela(320, true);
  await reabrir();
  await avaliar('btnConfig.click()'); await esperar(200);
  assert(await avaliar('btnConfig.getBoundingClientRect().right <= innerWidth && stkConfig.offsetWidth <= innerWidth && stkConfig.scrollWidth <= stkConfig.clientWidth'), 'Em 320 px o painel e a engrenagem cabem na tela');
  await avaliar('stkConfig.close()');
  await tela(1400);

  const CURITIBA = await avaliar('[...breakdownCapital.options].find(o => o.textContent.startsWith("Curitiba")).value');
  const mudarSelect = async (id, valor) => { await avaliar(`(() => { const el = document.getElementById('${id}'); el.value = ${JSON.stringify(valor)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`); await esperar(150); };
  await avaliar(`localStorage.removeItem('pesquisa-preco.tema')`);
  await reabrir();
  await avaliar('btnConfig.click()'); await esperar(200);
  await mudarSelect('prefCapital', CURITIBA);
  assert(await avaliar(`breakdownCapital.value === '${CURITIBA}' && customWageCapital.value === '${CURITIBA}'`), 'Capital escolhida vale na hora');
  await avaliar('stkConfig.close()');
  await aba('tabCapitais');
  await definir('customWageInput', '3000');
  assert(await avaliar(`localStorage.getItem('pesquisa-preco.renda') === null`), 'Renda digitada não é guardada sem a pessoa pedir');
  await reabrir();
  assert(await avaliar(`breakdownCapital.value === '${CURITIBA}' && estimateCity.value === '${CURITIBA}' && customWageInput.value === ''`), 'Capital volta ao reabrir, e a renda não');
  await definir('customWageInput', '3500');
  await avaliar('btnConfig.click()'); await esperar(200);
  await avaliar('prefRememberWage.click()'); await esperar(100);
  await avaliar('stkConfig.close()');
  await definir('customWageInput', '4000');
  await reabrir();
  assert(await avaliar(`customWageInput.value === '4000' && customWageTiles.children.length === 4`), 'Com a opção marcada, a renda volta ao reabrir');
  await avaliar('btnConfig.click()'); await esperar(200);
  assert(await avaliar(`stkConfig.textContent.includes('Renda mensal') && !stkConfig.textContent.includes('4000')`), 'O painel lista o dado sem mostrar o valor da renda');
  await avaliar('prefRememberWage.click()'); await esperar(100);
  await avaliar('stkConfig.close()');
  assert(await avaliar(`localStorage.getItem('pesquisa-preco.renda') === null`), 'Desmarcar apaga a renda salva');
  await avaliar(`localStorage.setItem('pesquisa-preco.capital', '999')`);
  await reabrir();
  assert(await avaliar('appFatalError.hidden && breakdownCapital.selectedOptions[0].textContent.startsWith("São Paulo")'), 'Capital salva inválida é ignorada');

  await avaliar(`localStorage.setItem('outro-app.tema', 'claro'); localStorage.setItem('pesquisa-preco.tema', 'claro')`);
  await reabrir();
  await avaliar('btnConfig.click()'); await esperar(200);
  const botaoApagar = 'document.querySelector(".stk-config-botao.perigo")';
  await avaliar(`${botaoApagar}.click()`); await esperar(100);
  assert(await avaliar(`localStorage.getItem('pesquisa-preco.tema') === 'claro' && ${botaoApagar}.textContent.includes('Confirmar')`), 'Primeiro clique em Apagar só pede confirmação');
  await avaliar(`${botaoApagar}.click()`); await esperar(2500);
  assert(await avaliar(`document.documentElement.dataset.theme === 'dark' && !Object.keys(localStorage).some(k => k.startsWith('pesquisa-preco.') && k !== 'pesquisa-preco.dados.v1') && localStorage.getItem('outro-app.tema') === 'claro'`), 'Apagar limpa só os dados deste app e volta ao padrão');
  await avaliar(`localStorage.removeItem('outro-app.tema')`);

  assert(await avaliar('navigator.serviceWorker.getRegistration().then(r => !!(r && (r.active || r.installing || r.waiting)))'), 'Service worker registrado');
  await avaliar('btnConfig.click()'); await esperar(200);
  await avaliar('[...document.querySelectorAll(".stk-config-botao")].find(b => b.textContent.includes("Procurar")).click()'); await esperar(1500);
  assert((await avaliar('document.querySelector(".stk-config-status").textContent')).includes('versão mais recente'), 'Procurar atualização responde que o app está em dia');
  await avaliar('stkConfig.close()');
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
