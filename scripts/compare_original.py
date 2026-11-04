#!/usr/bin/env python3
"""
Infrastructure / scripts/compare_original.py
Compares the numbers of the original page (fontes/index.html) with the sources and writes docs/CORRECOES.md.
Run after scripts/build_data.py.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIGINAL = (ROOT / 'fontes' / 'index.html').read_text(encoding='utf-8')


def load(name):
    text = (ROOT / 'src' / 'infrastructure' / 'data' / name).read_text(encoding='utf-8')
    return json.loads(text[text.index('freeze(') + 7:text.rindex(');')])


def brl(value, digits=2):
    return f'{value:,.{digits}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def pct(new, old):
    return f'{(old / new - 1) * 100:+.1f}%'.replace('.', ',')


basket = load('BasketData.js')
estate = load('RealEstateData.js')
capitals = {c['capital']: c for c in basket['capitals']}
cities = {c['city']: c for c in estate['cities']}

old_capitals = re.findall(r'uf: "(\w\w)", estado: "[^"]+", capital: "([^"]+)", arroz: ([\d.]+), feijao: ([\d.]+), cafe: ([\d.]+), carne: ([\d.]+), pao: ([\d.]+), leite: ([\d.]+), cesta: ([\d.]+)', ORIGINAL)
old_estate = re.findall(r'cidade: "([^"]+)", perfil: "[^"]+", aluguelRes: ([\d.]+), aluguelCom: ([\d.]+), terrenoUrb', ORIGINAL)

lines = [
    '# Correções em relação à página original', '',
    'Gerado por `scripts/compare_original.py`. Original: `fontes/index.html` (mantido sem alteração).',
    f'Referência dos dados corretos: {basket["period"]}.', '',
    '"Erro" é quanto o valor original estava acima (+) ou abaixo (-) da fonte.', '',
    '## Cesta básica por capital', '',
    '| Capital | Original (R$) | Fonte (R$) | Erro |', '|---|---:|---:|---:|',
]
errors = []
for _, capital, *values in sorted(old_capitals, key=lambda r: r[1]):
    old = float(values[-1])
    new = capitals[capital]['publishedTotal']
    errors.append(abs(old / new - 1) * 100)
    lines.append(f'| {capital} | {brl(old)} | {brl(new)} | {pct(new, old)} |')
lines += ['', f'Erro médio absoluto: {brl(sum(errors) / len(errors), 1)}%. Maior erro: {brl(max(errors), 1)}%.', '']

lines += ['## Preços dos itens', '',
          'Nenhuma coluna de item tinha fonte. Exemplo, média das 27 capitais:', '',
          '| Item | Original (R$) | Fonte (R$) |', '|---|---:|---:|']
for index, (key, label, factor) in enumerate([('rice', 'Arroz (kg)', 1), ('beans', 'Feijão (kg)', 1), ('coffee', 'Café (kg; original em 500 g, dobrado aqui)', 2), ('meat', 'Carne (kg)', 1), ('bread', 'Pão (kg)', 1), ('milk', 'Leite (L)', 1)]):
    old = sum(float(row[2 + index]) for row in old_capitals) / len(old_capitals) * factor
    new = sum(c['prices'][key] for c in basket['capitals']) / 27
    lines.append(f'| {label} | {brl(old)} | {brl(new)} |')

lines += ['', '## Aluguel por m²', '',
          '| Cidade | Residencial original | Residencial fonte | Comercial original | Comercial fonte |', '|---|---:|---:|---:|---:|']
without_source = []
for name, residential, commercial in old_estate:
    clean = re.sub(r'\s*\(.*\)$', '', name).split(' / ')[0]
    city = cities.get(clean)
    if not city:
        without_source.append(name)
        continue
    res = '-' if city['residentialRent'] is None else brl(city['residentialRent'])
    com = '-' if city['commercialRent'] is None else brl(city['commercialRent'])
    lines.append(f'| {clean} | {brl(float(residential))} | {res} | {brl(float(commercial))} | {com} |')
lines += ['', f'Cidades da página original fora do FipeZAP, sem fonte para os valores: {", ".join(without_source)}.', '', '"-" indica que a fonte não publica o valor.', '']

lines += [
    '## Nomes e regiões', '',
    '- "São Paulo (Capital)", "Barueri (Alphaville)" e "Registro (Vale Ribeira)" viraram os nomes oficiais do IBGE.',
    '- Agrupamentos sem definição oficial, como "Interior / Oeste", foram trocados pela Região Geográfica Intermediária do IBGE.',
    '- Sorocaba estava na região "Ribeirão Preto". Pelo IBGE, é da região de Sorocaba. São Carlos e Araraquara também estavam em "Ribeirão Preto", mas são da região de Araraquara.',
    '- Os gráficos cortavam o nome no primeiro espaço: "São Bernardo do Campo" e "São José dos Campos" apareciam como "São".', '',
    '## Removido por falta de fonte', '',
    '- Preços de alimentos e cesta dos municípios paulistas, exceto a capital. O DIEESE só cobre capitais.',
    '- Preços de terreno urbano e em condomínio: nenhuma fonte pública comparável por cidade.',
    '- Coluna "Perfil de mercado" e "Fator econômico regional": texto sem fonte.',
    '- Tema claro: o design system 8.X é só escuro.', '',
    '## Erros de cálculo corrigidos', '',
    '- A cesta total era digitada, sem relação com os preços. Agora quantidade × preço reproduz o valor publicado nas 27 capitais.',
    '- A "Média Brasil" do arroz era R$ 5,92, mas a média da própria tabela era R$ 5,73. Agora é a média simples das capitais, com esse nome.',
    '- O arroz mais barato era R$ 4,39 em Pelotas / Porto Alegre. Pela fonte, é R$ 4,09 em Vitória.',
    '- O destaque de mínimo e máximo usava limites fixos no código. Agora vem dos dados.',
]
(ROOT / 'docs' / 'CORRECOES.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(f'docs/CORRECOES.md: erro médio {sum(errors) / len(errors):.1f}%, maior {max(errors):.1f}%')
