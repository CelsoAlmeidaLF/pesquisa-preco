# Pesquisa de Preços Brasil (8.6)

**App publicado:** https://celsoalmeidalf.github.io/pesquisa-preco/

Cesta básica nas 27 capitais, os 645 municípios de SP (com valor real ou referência da região, sempre marcados) e preços de compra e aluguel de imóveis residenciais e comerciais, com fonte para cada número. PWA sem dependências npm, no design system comum dos projetos 8.X.

## Municípios de SP: valor real e referência da região

A aba "Municípios de SP" lista os 645 municípios (IBGE Localidades, UF 35). Cada valor tem um tipo, mostrado por um selo e gravado no CSV (coluna "real" ou "referência" e a coluna de origem):

- **Pesquisa do município (real):** valor medido na própria cidade. Cesta: São Paulo (DIEESE) e Campinas (PUC-Campinas, outro mês, não comparável). Imóveis: cidades do Índice FipeZAP, por segmento (residencial 16 municípios de SP; o comercial cobre menos).
- **Referência da região:** não é pesquisa do município. É o valor oficial mais próximo, copiado da fonte sem conta nenhuma, com a cidade de origem. Cesta: a da capital, a única oficial no estado (DIEESE). Imóveis, por segmento: a cidade FipeZAP da mesma região imediata do IBGE; sem ela, a da região intermediária; sem ela, a capital. Havendo mais de uma cidade no nível, vale a que dá nome à região, depois a ordem alfabética.
- Os cálculos derivados (% do salário mínimo, tempo de trabalho, anos de aluguel) rodam sobre o valor mostrado. Na referência, partem da referência, e a tela avisa.

Nenhum número é estimado: a regra de "nada de número estimado" continua valendo, e a referência regional é a única exceção. A lista usa 50 municípios por página; a busca ignora acento e caixa, e há filtro por região intermediária. O CSV exporta todos os resultados do filtro, não só a página.

Para incluir pesquisa própria de outro município, acrescente-o em `LOCAL_BASKETS` no `scripts/build_data.py`; o build passa a tratá-lo como real.

## Seu salário: defasagem da tabela do IRPF

A aba "Seu salário" mede quanto a faixa de isenção do Imposto de Renda ficou para trás da inflação desde 1996 e quanto a pessoa pagaria com a tabela corrigida.

- **Defasagem** = (IPCA acumulado desde dez/1995) ÷ (quanto a isenção subiu desde 1996, de R$ 900 ao valor de hoje) − 1. Até dez/2025: **120,48%**, isenção corrigida de **R$ 5.355,09**. A tela diz qual base usa (só a faixa de isenção; a redução da Lei 15.270 não entra no número) e mostra a segunda visão, a isenção efetiva em salário bruto. A Receita não publica um índice oficial; os 157% do Sindifisco usam outro método e só aparecem como citação.
- **Comparação pessoal**: bruto → INSS progressivo → base → tabela de 2026 → redução da Lei 15.270 (que usa o salário **bruto**). A tabela corrigida multiplica limites e parcelas a deduzir pelo fator de defasagem, ao centavo. Sem dependentes, 13º e ajuste anual. Os casos de teste são os do Daniel (19/11/2026).
- **Selo**: a defasagem sai como **"estimativa"** (decidido pelo Celso em 19/11/2026), com aviso de que o número depende da base e do método (o Sindifisco chega a 157% por outro); a comparação pessoal também é "estimativa", pois usa o fator de defasagem e a tabela do INSS de 2026 ainda `a-confirmar`.
- **Privacidade**: o salário digitado fica só na memória da página; não é salvo (nem no `localStorage`) nem enviado.
- Os números (tabela do IRPF, INSS, isenção desde 1996, IPCA número-índice) vêm do módulo comum de parâmetros e valem na data do cálculo (RN-M01). IPCA é valor fixo com fonte e data; a aba não consulta a internet.

## Parâmetros comuns

`vendor/stk-gov/stk-gov-parametros.js` e `.json` são cópias de `../_design-system/parametros/` (ADR-001): cada número tem fonte, vigência, tipo e status. O `scripts/build_data.py` lê o mesmo JSON (salário mínimo, fator de 0,925, jornada de 220 h, 3 cestas e 0,3571 do DIEESE) **na data do período da cesta** (`PERIOD_END`), não na de hoje, confere antes os casos de vigência que o JS também roda, e grava os parâmetros usados em `SourcesData.js` (aba "Fontes e método"). Sem vigência para a data, o build para.

## Configurações

A engrenagem do topo abre o painel comum: tema (escuro, claro ou do sistema), capital ao abrir o app, opção de lembrar a renda, o que está guardado neste navegador, com opção de apagar, e a busca por versão nova. A renda só é guardada se a pessoa marcar a opção, fica só no navegador e sai ao desmarcar.

## Como rodar

```bash
python3 -m http.server 8086   # abra http://localhost:8086
npm test                      # regras, dados e parâmetros
npm run test:ui               # tela, num Chrome headless
```

## Atualizar os dados

1. Ajuste em `scripts/build_data.py` as constantes do período (`PERIOD_LABEL`, `PERIOD_FORM`, `PERIOD_END`, `COLLECTED_AT`), os nomes dos PDFs em `DOWNLOADS` e a data conferida na planilha.
2. `npm run dados:baixar` baixa as fontes para `data/raw/` e gera `src/infrastructure/data/`.
3. `python3 scripts/compare_original.py` refaz `docs/CORRECOES.md`.
4. `npm run versionar`, depois `npm test` e `npm run test:ui`.

Nunca edite `src/infrastructure/data/` à mão. O build para com erro se um nome não existir no IBGE ou se as contas não fecharem com o que a fonte publicou.

## Estrutura

| Camada | Pasta |
|---|---|
| Domain | `src/domain/`: regras da cesta, das estimativas de imóveis e do Imposto de Renda (`IncomeTaxCalculator.js`) |
| Application | `src/application/`: casos de uso |
| Infrastructure | `src/infrastructure/`: dados gerados, CSV e `VendorParameters.js` (porta de parâmetros); `scripts/`: build |
| UI | `src/ui/`, `index.html`, `css/style.css` |

`fontes/index.html` é a página original, mantida sem alteração. A lista do que mudou está em `docs/CORRECOES.md`.

## Fontes

- Cesta: Conab/DIEESE, Pesquisa Nacional da Cesta Básica de Alimentos.
- Imóveis: Índice FipeZAP (residencial em 56 cidades; comercial em 10).
- Nomes, códigos e regiões: API de Localidades do IBGE (inclui `estados/35/municipios`, os 645 de SP; o build para se o número for outro).

Links e SHA-256 dos arquivos ficam na aba "Fontes e método".

Os arquivos das fontes (`data/raw/`) não ficam no repositório, porque são de terceiros: `npm run dados:baixar` baixa de novo das URLs oficiais.

Ao mudar CSS ou JS, rode `npm run versionar`: sem isso, o navegador pode misturar arquivos novos e antigos do cache.
