# Correções em relação à página original

Gerado por `scripts/compare_original.py`. Original: `fontes/index.html` (mantido sem alteração).
Referência dos dados corretos: setembro de 2026.

"Erro" é quanto o valor original estava acima (+) ou abaixo (-) da fonte.

## Cesta básica por capital

| Capital | Original (R$) | Fonte (R$) | Erro |
|---|---:|---:|---:|
| Aracaju | 562,88 | 587,76 | -4,2% |
| Belo Horizonte | 689,70 | 802,99 | -14,1% |
| Belém | 724,80 | 731,62 | -0,9% |
| Boa Vista | 802,40 | 699,75 | +14,7% |
| Brasília | 752,60 | 773,78 | -2,7% |
| Campo Grande | 671,50 | 806,56 | -16,7% |
| Cuiabá | 662,10 | 891,24 | -25,7% |
| Curitiba | 795,30 | 841,93 | -5,5% |
| Florianópolis | 832,40 | 915,62 | -9,1% |
| Fortaleza | 622,30 | 779,96 | -20,2% |
| Goiânia | 654,20 | 808,01 | -19,0% |
| João Pessoa | 574,50 | 660,21 | -13,0% |
| Macapá | 785,00 | 720,01 | +9,0% |
| Maceió | 585,10 | 631,28 | -7,3% |
| Manaus | 778,50 | 676,18 | +15,1% |
| Natal | 604,20 | 635,60 | -4,9% |
| Palmas | 645,00 | 752,68 | -14,3% |
| Porto Alegre | 815,90 | 889,15 | -8,2% |
| Porto Velho | 730,00 | 691,25 | +5,6% |
| Recife | 598,40 | 663,48 | -9,8% |
| Rio Branco | 765,20 | 678,35 | +12,8% |
| Rio de Janeiro | 865,10 | 913,46 | -5,3% |
| Salvador | 615,80 | 634,67 | -3,0% |
| São Luís | 635,40 | 692,94 | -8,3% |
| São Paulo | 906,14 | 922,51 | -1,8% |
| Teresina | 628,90 | 698,55 | -10,0% |
| Vitória | 712,40 | 829,14 | -14,1% |

Erro médio absoluto: 10,2%. Maior erro: 25,7%.

## Preços dos itens

Nenhuma coluna de item tinha fonte. Exemplo, média das 27 capitais:

| Item | Original (R$) | Fonte (R$) |
|---|---:|---:|
| Arroz (kg) | 5,73 | 4,99 |
| Feijão (kg) | 7,28 | 8,80 |
| Café (kg; original em 500 g, dobrado aqui) | 39,23 | 57,43 |
| Carne (kg) | 41,20 | 48,51 |
| Pão (kg) | 16,61 | 17,44 |
| Leite (L) | 5,33 | 7,18 |

## Aluguel por m²

| Cidade | Residencial original | Residencial fonte | Comercial original | Comercial fonte |
|---|---:|---:|---:|---:|
| São Paulo | 64,98 | 65,78 | 72,50 | 62,87 |
| Barueri | 58,40 | 71,96 | 66,00 | - |
| Santos | 46,20 | 60,39 | 52,00 | - |
| Campinas | 41,50 | 56,60 | 48,00 | 50,73 |
| São José dos Campos | 37,80 | 49,43 | 43,00 | - |
| Ribeirão Preto | 35,00 | 35,28 | 41,00 | - |
| São José do Rio Preto | 28,50 | 29,77 | 33,00 | - |
| Rio de Janeiro | 54,20 | 61,86 | 62,00 | 57,80 |
| Florianópolis | 53,60 | 61,81 | 59,00 | 52,00 |
| Curitiba | 42,10 | 49,44 | 49,50 | 46,61 |
| Belo Horizonte | 39,50 | 50,78 | 48,00 | 38,48 |
| Brasília | 48,70 | 53,84 | 55,00 | 46,98 |
| Goiânia | 36,20 | 43,86 | 42,00 | - |
| Salvador | 33,40 | 55,40 | 40,00 | 55,88 |
| Fortaleza | 31,80 | 42,22 | 38,50 | - |
| Aracaju | 24,80 | 36,04 | 31,00 | - |

Cidades da página original fora do FipeZAP, sem fonte para os valores: Jundiaí (SP), Sorocaba (SP), Presidente Prudente, Registro (SP).

"-" indica que a fonte não publica o valor.

## Nomes e regiões

- "São Paulo (Capital)", "Barueri (Alphaville)" e "Registro (Vale Ribeira)" viraram os nomes oficiais do IBGE.
- Agrupamentos sem definição oficial, como "Interior / Oeste", foram trocados pela Região Geográfica Intermediária do IBGE.
- Sorocaba estava na região "Ribeirão Preto". Pelo IBGE, é da região de Sorocaba. São Carlos e Araraquara também estavam em "Ribeirão Preto", mas são da região de Araraquara.
- Os gráficos cortavam o nome no primeiro espaço: "São Bernardo do Campo" e "São José dos Campos" apareciam como "São".

## Removido por falta de fonte

- Preços de alimentos e cesta dos municípios paulistas, exceto a capital. O DIEESE só cobre capitais.
- Preços de terreno urbano e em condomínio: nenhuma fonte pública comparável por cidade.
- Coluna "Perfil de mercado" e "Fator econômico regional": texto sem fonte.
- Tema claro: o design system 8.X é só escuro.

## Erros de cálculo corrigidos

- A cesta total era digitada, sem relação com os preços. Agora quantidade × preço reproduz o valor publicado nas 27 capitais.
- A "Média Brasil" do arroz era R$ 5,92, mas a média da própria tabela era R$ 5,73. Agora é a média simples das capitais, com esse nome.
- O arroz mais barato era R$ 4,39 em Pelotas / Porto Alegre. Pela fonte, é R$ 4,09 em Vitória.
- O destaque de mínimo e máximo usava limites fixos no código. Agora vem dos dados.
