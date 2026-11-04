# Pesquisa de Preços Brasil (8.6)

**App publicado:** https://celsoalmeidalf.github.io/pesquisa-preco/

Cesta básica nas 27 capitais e preços de compra e aluguel de imóveis residenciais e comerciais, com fonte para cada número. PWA sem dependências npm, no design system comum dos projetos 8.X.

## Como rodar

```bash
python3 -m http.server 8086   # abra http://localhost:8086
npm test                      # regras e dados
npm run test:ui               # tela, num Chrome headless
```

## Atualizar os dados

1. Ajuste em `scripts/build_data.py` as constantes do período (`PERIOD_LABEL`, `PERIOD_FORM`, `COLLECTED_AT`), os nomes dos PDFs em `DOWNLOADS` e a data conferida na planilha.
2. `npm run dados:baixar` baixa as fontes para `data/raw/` e gera `src/infrastructure/data/`.
3. `python3 scripts/compare_original.py` refaz `docs/CORRECOES.md`.
4. `npm run versionar`, depois `npm test` e `npm run test:ui`.

Nunca edite `src/infrastructure/data/` à mão. O build para com erro se um nome não existir no IBGE ou se as contas não fecharem com o que a fonte publicou.

## Estrutura

| Camada | Pasta |
|---|---|
| Domain | `src/domain/`: regras da cesta e das estimativas de imóveis |
| Application | `src/application/`: casos de uso |
| Infrastructure | `src/infrastructure/`: dados gerados e CSV; `scripts/`: build |
| UI | `src/ui/`, `index.html`, `css/style.css` |

`fontes/index.html` é a página original, mantida sem alteração. A lista do que mudou está em `docs/CORRECOES.md`.

## Fontes

- Cesta: Conab/DIEESE, Pesquisa Nacional da Cesta Básica de Alimentos.
- Imóveis: Índice FipeZAP (residencial em 56 cidades; comercial em 10).
- Nomes, códigos e regiões: API de Localidades do IBGE.

Links e SHA-256 dos arquivos ficam na aba "Fontes e método".

Os arquivos das fontes (`data/raw/`) não ficam no repositório, porque são de terceiros: `npm run dados:baixar` baixa de novo das URLs oficiais.

Ao mudar CSS ou JS, rode `npm run versionar`: sem isso, o navegador pode misturar arquivos novos e antigos do cache.
